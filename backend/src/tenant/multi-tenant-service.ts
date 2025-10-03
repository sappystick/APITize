import { Router, Request, Response, NextFunction } from 'express';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { S3Client, CreateBucketCommand, PutBucketPolicyCommand } from '@aws-sdk/client-s3';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

interface TenantConfiguration {
  tenantId: string;
  name: string;
  domain: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
  updatedAt: string;
  settings: {
    isolation: 'shared' | 'dedicated';
    customDomain: boolean;
    ssoEnabled: boolean;
    apiLimits: {
      requests: number;
      storage: number; // GB
      containers: number;
      users: number;
    };
    features: {
      governmentAPIs: boolean;
      aiAgents: boolean;
      analytics: boolean;
      whiteLabel: boolean;
      customBranding: boolean;
    };
    branding: {
      logo?: string;
      primaryColor?: string;
      secondaryColor?: string;
      customCSS?: string;
    };
    billing: {
      billingContact: string;
      paymentMethod: string;
      subscriptionId?: string;
      nextBillingDate?: string;
    };
  };
  resourceLimits: {
    current: {
      requests: number;
      storage: number;
      containers: number;
      users: number;
    };
    limits: {
      requests: number;
      storage: number;
      containers: number;
      users: number;
    };
  };
}

interface TenantUser {
  userId: string;
  tenantId: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  lastAccess: string;
}

interface TenantContext {
  tenantId: string;
  tenant: TenantConfiguration;
  user: TenantUser;
  isolation: 'shared' | 'dedicated';
  resourcePrefix: string;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

class MultiTenantService {
  private dynamodb: DynamoDBClient;
  private s3: S3Client;
  private redis: Redis;
  private router: Router;
  private tenantCache: Map<string, TenantConfiguration> = new Map();

  constructor() {
    this.dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.router = Router();
    this.initializeRoutes();
  }

  // Tenant identification middleware
  public tenantMiddleware = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = this.extractTenantId(req);
      
      if (!tenantId) {
        res.status(400).json({ error: 'Tenant identification required' });
        return;
      }

      const tenant = await this.getTenant(tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'Tenant not found' });
        return;
      }

      if (tenant.status !== 'active') {
        res.status(403).json({ error: 'Tenant account suspended' });
        return;
      }

      // Extract user from JWT token
      const token = req.headers.authorization?.replace('Bearer ', '');
      const user = await this.validateUserToken(token, tenantId);
      
      if (!user) {
        res.status(401).json({ error: 'Invalid authentication' });
        return;
      }

      // Create tenant context
      const tenantContext: TenantContext = {
        tenantId,
        tenant,
        user,
        isolation: tenant.settings.isolation,
        resourcePrefix: this.getResourcePrefix(tenant)
      };

      req.tenant = tenantContext;
      
      // Log tenant access
      await this.logTenantAccess(tenantContext);
      
      next();
    } catch (error) {
      logger.error('Tenant middleware error', { error });
      res.status(500).json({ error: 'Tenant validation failed' });
    }
  };

  // Extract tenant ID from various sources
  private extractTenantId(req: Request): string | null {
    // Try subdomain first (e.g., tenant1.apitize.com)
    const host = req.get('host');
    if (host) {
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'api' && subdomain !== 'www') {
        return subdomain;
      }
    }

    // Try path parameter (e.g., /api/v1/tenants/{tenantId})
    if (req.params.tenantId) {
      return req.params.tenantId;
    }

    // Try query parameter
    if (req.query.tenantId) {
      return req.query.tenantId as string;
    }

    // Try custom header
    const headerTenant = req.get('x-tenant-id');
    if (headerTenant) {
      return headerTenant;
    }

    return null;
  }

  // Get tenant configuration
  private async getTenant(tenantId: string): Promise<TenantConfiguration | null> {
    try {
      // Check cache first
      if (this.tenantCache.has(tenantId)) {
        return this.tenantCache.get(tenantId)!;
      }

      // Check Redis cache
      const cached = await this.redis.get(`tenant:${tenantId}`);
      if (cached) {
        const tenant = JSON.parse(cached);
        this.tenantCache.set(tenantId, tenant);
        return tenant;
      }

      // Fetch from DynamoDB
      const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-tenants`;
      const command = new GetItemCommand({
        TableName: tableName,
        Key: marshall({ tenantId })
      });

      const result = await this.dynamodb.send(command);
      if (!result.Item) {
        return null;
      }

      const tenant = unmarshall(result.Item) as TenantConfiguration;
      
      // Cache for future use
      this.tenantCache.set(tenantId, tenant);
      await this.redis.setex(`tenant:${tenantId}`, 3600, JSON.stringify(tenant)); // 1 hour cache
      
      return tenant;
    } catch (error) {
      logger.error('Failed to get tenant', { tenantId, error });
      return null;
    }
  }

  // Validate user token and get user info
  private async validateUserToken(token: string | undefined, tenantId: string): Promise<TenantUser | null> {
    if (!token) {
      return null;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      if (decoded.tenantId !== tenantId) {
        return null;
      }

      // Fetch user from database
      const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-tenant-users`;
      const command = new GetItemCommand({
        TableName: tableName,
        Key: marshall({ 
          tenantId, 
          userId: decoded.sub 
        })
      });

      const result = await this.dynamodb.send(command);
      if (!result.Item) {
        return null;
      }

      const user = unmarshall(result.Item) as TenantUser;
      
      if (!user.isActive) {
        return null;
      }

      // Update last access
      await this.updateUserLastAccess(user.userId, tenantId);
      
      return user;
    } catch (error) {
      logger.error('Token validation failed', { error });
      return null;
    }
  }

  // Get resource prefix for tenant isolation
  private getResourcePrefix(tenant: TenantConfiguration): string {
    if (tenant.settings.isolation === 'dedicated') {
      return `dedicated-${tenant.tenantId}`;
    }
    return `shared-${tenant.tenantId}`;
  }

  // Log tenant access for analytics
  private async logTenantAccess(context: TenantContext): Promise<void> {
    try {
      const accessLog = {
        tenantId: context.tenantId,
        userId: context.user.userId,
        timestamp: new Date().toISOString(),
        endpoint: 'api-access',
        method: 'access',
        isolation: context.isolation
      };

      // Store in time-series table for analytics
      const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-tenant-access-logs`;
      const command = new PutItemCommand({
        TableName: tableName,
        Item: marshall(accessLog)
      });

      await this.dynamodb.send(command);
    } catch (error) {
      // Don't fail request if logging fails
      logger.warn('Failed to log tenant access', { error });
    }
  }

  // Update user last access timestamp
  private async updateUserLastAccess(userId: string, tenantId: string): Promise<void> {
    try {
      const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-tenant-users`;
      const command = new UpdateItemCommand({
        TableName: tableName,
        Key: marshall({ tenantId, userId }),
        UpdateExpression: 'SET lastAccess = :timestamp',
        ExpressionAttributeValues: marshall({
          ':timestamp': new Date().toISOString()
        })
      });

      await this.dynamodb.send(command);
    } catch (error) {
      logger.warn('Failed to update user last access', { userId, tenantId, error });
    }
  }

  // Create new tenant
  private async createTenant(tenantData: Partial<TenantConfiguration>): Promise<TenantConfiguration> {
    const tenant: TenantConfiguration = {
      tenantId: tenantData.tenantId!,
      name: tenantData.name!,
      domain: tenantData.domain!,
      plan: tenantData.plan || 'free',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        isolation: tenantData.plan === 'enterprise' ? 'dedicated' : 'shared',
        customDomain: tenantData.plan === 'enterprise',
        ssoEnabled: tenantData.plan !== 'free',
        apiLimits: this.getDefaultLimits(tenantData.plan || 'free'),
        features: this.getDefaultFeatures(tenantData.plan || 'free'),
        branding: {},
        billing: {
          billingContact: '',
          paymentMethod: ''
        }
      },
      resourceLimits: {
        current: {
          requests: 0,
          storage: 0,
          containers: 0,
          users: 1
        },
        limits: this.getDefaultLimits(tenantData.plan || 'free')
      }
    };

    // Store in DynamoDB
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-tenants`;
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(tenant)
    });

    await this.dynamodb.send(command);

    // Create dedicated resources if needed
    if (tenant.settings.isolation === 'dedicated') {
      await this.createDedicatedResources(tenant);
    }

    // Cache the new tenant
    this.tenantCache.set(tenant.tenantId, tenant);
    await this.redis.setex(`tenant:${tenant.tenantId}`, 3600, JSON.stringify(tenant));

    logger.info('Tenant created successfully', { 
      tenantId: tenant.tenantId, 
      plan: tenant.plan,
      isolation: tenant.settings.isolation 
    });

    return tenant;
  }

  // Create dedicated AWS resources for tenant
  private async createDedicatedResources(tenant: TenantConfiguration): Promise<void> {
    try {
      const resourcePrefix = this.getResourcePrefix(tenant);
      
      // Create dedicated S3 bucket
      const bucketName = `${process.env.AWS_S3_BUCKET_PREFIX}-${resourcePrefix}`;
      
      const createBucketCommand = new CreateBucketCommand({
        Bucket: bucketName,
        CreateBucketConfiguration: {
          LocationConstraint: process.env.AWS_REGION !== 'us-east-1' ? process.env.AWS_REGION : undefined
        }
      });

      await this.s3.send(createBucketCommand);

      // Set bucket policy for tenant isolation
      const bucketPolicy = {
        Version: '2012-10-17',
        Statement: [
          {
            Sid: 'TenantAccess',
            Effect: 'Allow',
            Principal: {
              AWS: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:role/APITizeExecutionRole`
            },
            Action: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
            Resource: `arn:aws:s3:::${bucketName}/*`,
            Condition: {
              StringEquals: {
                's3:ExistingObjectTag/tenantId': tenant.tenantId
              }
            }
          }
        ]
      };

      const putBucketPolicyCommand = new PutBucketPolicyCommand({
        Bucket: bucketName,
        Policy: JSON.stringify(bucketPolicy)
      });

      await this.s3.send(putBucketPolicyCommand);

      // Create dedicated DynamoDB tables if needed
      // This would be implemented based on specific requirements

      logger.info('Dedicated resources created', { 
        tenantId: tenant.tenantId,
        bucketName 
      });
    } catch (error) {
      logger.error('Failed to create dedicated resources', { 
        tenantId: tenant.tenantId, 
        error 
      });
      throw error;
    }
  }

  // Get default limits based on plan
  private getDefaultLimits(plan: string) {
    const limits = {
      free: {
        requests: 1000,
        storage: 1,
        containers: 3,
        users: 1
      },
      pro: {
        requests: 100000,
        storage: 10,
        containers: 25,
        users: 10
      },
      enterprise: {
        requests: 1000000,
        storage: 100,
        containers: 100,
        users: 100
      }
    };

    return limits[plan as keyof typeof limits] || limits.free;
  }

  // Get default features based on plan
  private getDefaultFeatures(plan: string) {
    const features = {
      free: {
        governmentAPIs: false,
        aiAgents: false,
        analytics: false,
        whiteLabel: false,
        customBranding: false
      },
      pro: {
        governmentAPIs: true,
        aiAgents: true,
        analytics: true,
        whiteLabel: false,
        customBranding: true
      },
      enterprise: {
        governmentAPIs: true,
        aiAgents: true,
        analytics: true,
        whiteLabel: true,
        customBranding: true
      }
    };

    return features[plan as keyof typeof features] || features.free;
  }

  // Initialize routes
  private initializeRoutes(): void {
    // Create new tenant
    this.router.post('/tenants', async (req: Request, res: Response) => {
      try {
        const tenantData = req.body;
        const tenant = await this.createTenant(tenantData);
        res.json(tenant);
      } catch (error) {
        logger.error('Failed to create tenant', { error });
        res.status(500).json({ error: 'Failed to create tenant' });
      }
    });

    // Get tenant configuration
    this.router.get('/tenants/:tenantId', async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        const tenant = await this.getTenant(tenantId);
        
        if (!tenant) {
          return res.status(404).json({ error: 'Tenant not found' });
        }

        res.json(tenant);
      } catch (error) {
        logger.error('Failed to get tenant', { error });
        res.status(500).json({ error: 'Failed to get tenant' });
      }
    });

    // Update tenant configuration
    this.router.put('/tenants/:tenantId', async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        const updates = req.body;
        
        const tenant = await this.updateTenant(tenantId, updates);
        res.json(tenant);
      } catch (error) {
        logger.error('Failed to update tenant', { error });
        res.status(500).json({ error: 'Failed to update tenant' });
      }
    });

    // Get tenant usage statistics
    this.router.get('/tenants/:tenantId/usage', async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        const usage = await this.getTenantUsage(tenantId);
        res.json(usage);
      } catch (error) {
        logger.error('Failed to get tenant usage', { error });
        res.status(500).json({ error: 'Failed to get tenant usage' });
      }
    });
  }

  // Update tenant configuration
  private async updateTenant(tenantId: string, updates: Partial<TenantConfiguration>): Promise<TenantConfiguration> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const updatedTenant = {
      ...tenant,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-tenants`;
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(updatedTenant)
    });

    await this.dynamodb.send(command);

    // Invalidate cache
    this.tenantCache.delete(tenantId);
    await this.redis.del(`tenant:${tenantId}`);

    return updatedTenant;
  }

  // Get tenant usage statistics
  private async getTenantUsage(tenantId: string): Promise<any> {
    // This would query various AWS services and databases
    // to get current usage statistics
    return {
      requests: {
        current: 50000,
        limit: 100000,
        percentage: 50
      },
      storage: {
        current: 5.2,
        limit: 10,
        percentage: 52
      },
      containers: {
        current: 12,
        limit: 25,
        percentage: 48
      },
      users: {
        current: 5,
        limit: 10,
        percentage: 50
      }
    };
  }

  // Resource isolation helper
  public getIsolatedResourceName(tenantContext: TenantContext, resourceType: string, resourceName: string): string {
    return `${tenantContext.resourcePrefix}-${resourceType}-${resourceName}`;
  }

  // Check if tenant has exceeded limits
  public async checkResourceLimits(tenantId: string, resourceType: keyof TenantConfiguration['resourceLimits']['limits']): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      return false;
    }

    return tenant.resourceLimits.current[resourceType] < tenant.resourceLimits.limits[resourceType];
  }

  public getRouter(): Router {
    return this.router;
  }
}

export { MultiTenantService, TenantConfiguration, TenantUser, TenantContext };