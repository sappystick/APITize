import { Router, Request, Response } from 'express';
import { DynamoDBClient, PutItemCommand, GetItemCommand, QueryCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { TenantContext } from '../tenant/multi-tenant-service';
import { logger } from '../utils/logger';
import semver from 'semver';

interface APIVersion {
  apiId: string;
  tenantId: string;
  version: string;
  status: 'draft' | 'published' | 'deprecated' | 'retired';
  createdAt: string;
  publishedAt?: string;
  deprecatedAt?: string;
  retiredAt?: string;
  createdBy: string;
  changelog: string;
  breakingChanges: boolean;
  compatibilityLevel: 'patch' | 'minor' | 'major';
  specification: {
    openapi: string;
    info: {
      title: string;
      description: string;
      version: string;
      contact?: {
        name: string;
        email: string;
      };
      license?: {
        name: string;
        url: string;
      };
    };
    servers: Array<{
      url: string;
      description: string;
    }>;
    paths: Record<string, any>;
    components?: Record<string, any>;
  };
  deployment: {
    environment: 'development' | 'staging' | 'production';
    endpoint: string;
    containerImage: string;
    replicas: number;
    resources: {
      cpu: string;
      memory: string;
    };
    healthCheck: {
      path: string;
      interval: number;
      timeout: number;
    };
  };
  metrics: {
    requests: number;
    errors: number;
    responseTime: number;
    uptime: number;
    adoption: number; // percentage of users using this version
  };
  deprecationPlan?: {
    reason: string;
    migrationGuide: string;
    supportEndDate: string;
    replacementVersion?: string;
  };
}

interface APILifecyclePolicy {
  tenantId: string;
  apiId: string;
  policy: {
    maxVersions: number;
    supportPeriod: number; // days
    deprecationWarning: number; // days before deprecation
    autoRetirement: boolean;
    retirementPeriod: number; // days after deprecation
    breakingChangePolicy: 'major-only' | 'allowed' | 'forbidden';
    backwardCompatibility: {
      required: boolean;
      testSuite: string;
    };
  };
  notifications: {
    deprecation: {
      enabled: boolean;
      recipients: string[];
      template: string;
    };
    retirement: {
      enabled: boolean;
      recipients: string[];
      template: string;
    };
  };
}

interface MigrationPlan {
  id: string;
  fromVersion: string;
  toVersion: string;
  apiId: string;
  tenantId: string;
  status: 'planned' | 'in-progress' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  strategy: 'blue-green' | 'canary' | 'rolling' | 'immediate';
  steps: MigrationStep[];
  rollbackPlan: {
    enabled: boolean;
    conditions: string[];
    steps: string[];
  };
  validation: {
    preDeployment: ValidationTest[];
    postDeployment: ValidationTest[];
    contractTests: string[];
  };
  metrics: {
    successRate: number;
    errorRate: number;
    performanceImpact: number;
  };
}

interface MigrationStep {
  id: string;
  name: string;
  description: string;
  type: 'preparation' | 'deployment' | 'verification' | 'cleanup';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  duration?: number;
  startedAt?: string;
  completedAt?: string;
  dependencies: string[];
  commands: string[];
  validation: {
    healthCheck: boolean;
    contractTests: boolean;
    performanceTests: boolean;
  };
}

interface ValidationTest {
  name: string;
  type: 'contract' | 'integration' | 'performance' | 'security';
  endpoint: string;
  method: string;
  expectedStatus: number;
  expectedResponse?: any;
  timeout: number;
  retries: number;
}

interface CompatibilityReport {
  version1: string;
  version2: string;
  compatible: boolean;
  breakingChanges: Array<{
    type: 'removed-endpoint' | 'changed-schema' | 'added-required-field' | 'changed-response-format';
    path: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    impact: string;
    mitigation?: string;
  }>;
  warnings: Array<{
    type: string;
    description: string;
    recommendation: string;
  }>;
  score: number; // 0-100, 100 being fully compatible
}

class APIVersioningService {
  private dynamodb: DynamoDBClient;
  private s3: S3Client;
  private router: Router;

  constructor() {
    this.dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.s3 = new S3Client({ region: process.env.AWS_REGION });
    this.router = Router();
    this.initializeRoutes();
  }

  // Create new API version
  public async createVersion(versionData: Omit<APIVersion, 'createdAt' | 'metrics'>): Promise<APIVersion> {
    // Validate semantic versioning
    if (!semver.valid(versionData.version)) {
      throw new Error('Invalid semantic version format');
    }

    // Check if version already exists
    const existingVersion = await this.getVersion(versionData.apiId, versionData.version);
    if (existingVersion) {
      throw new Error('Version already exists');
    }

    // Determine compatibility level
    const latestVersion = await this.getLatestVersion(versionData.apiId);
    let compatibilityLevel: 'patch' | 'minor' | 'major' = 'patch';
    
    if (latestVersion) {
      const diff = semver.diff(latestVersion.version, versionData.version);
      if (diff === 'major') compatibilityLevel = 'major';
      else if (diff === 'minor') compatibilityLevel = 'minor';
      else compatibilityLevel = 'patch';
    }

    const version: APIVersion = {
      ...versionData,
      compatibilityLevel,
      createdAt: new Date().toISOString(),
      metrics: {
        requests: 0,
        errors: 0,
        responseTime: 0,
        uptime: 100,
        adoption: 0
      }
    };

    // Store version in DynamoDB
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-api-versions`;
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(version)
    });

    await this.dynamodb.send(command);

    // Store OpenAPI specification in S3
    await this.storeSpecification(version);

    // Check lifecycle policy and apply if needed
    await this.applyLifecyclePolicy(version);

    logger.info('API version created', {
      apiId: version.apiId,
      version: version.version,
      compatibilityLevel,
      tenantId: version.tenantId
    });

    return version;
  }

  // Get specific API version
  public async getVersion(apiId: string, version: string): Promise<APIVersion | null> {
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-api-versions`;
    const command = new GetItemCommand({
      TableName: tableName,
      Key: marshall({ apiId, version })
    });

    const result = await this.dynamodb.send(command);
    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as APIVersion;
  }

  // Get latest version of an API
  public async getLatestVersion(apiId: string): Promise<APIVersion | null> {
    const versions = await this.getVersions(apiId);
    if (versions.length === 0) {
      return null;
    }

    // Sort by semantic version and return the latest
    const sortedVersions = versions.sort((a, b) => semver.rcompare(a.version, b.version));
    return sortedVersions[0];
  }

  // Get all versions of an API
  public async getVersions(apiId: string): Promise<APIVersion[]> {
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-api-versions`;
    const command = new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'apiId = :apiId',
      ExpressionAttributeValues: marshall({ ':apiId': apiId })
    });

    const result = await this.dynamodb.send(command);
    if (!result.Items) {
      return [];
    }

    return result.Items.map(item => unmarshall(item) as APIVersion);
  }

  // Store OpenAPI specification in S3
  private async storeSpecification(version: APIVersion): Promise<void> {
    const bucketName = process.env.AWS_S3_BUCKET!;
    const key = `api-specifications/${version.tenantId}/${version.apiId}/${version.version}/openapi.json`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(version.specification, null, 2),
      ContentType: 'application/json',
      Metadata: {
        apiId: version.apiId,
        version: version.version,
        tenantId: version.tenantId,
        createdAt: version.createdAt
      }
    });

    await this.s3.send(command);
  }

  // Apply lifecycle policy to version
  private async applyLifecyclePolicy(version: APIVersion): Promise<void> {
    const policy = await this.getLifecyclePolicy(version.apiId);
    if (!policy) {
      return;
    }

    // Check if we need to deprecate old versions
    const versions = await this.getVersions(version.apiId);
    const activeVersions = versions.filter(v => v.status === 'published');

    if (activeVersions.length > policy.policy.maxVersions) {
      // Sort by version and deprecate the oldest
      const sortedVersions = activeVersions.sort((a, b) => semver.compare(a.version, b.version));
      const toDeprecate = sortedVersions.slice(0, activeVersions.length - policy.policy.maxVersions);
      
      for (const oldVersion of toDeprecate) {
        await this.deprecateVersion(oldVersion.apiId, oldVersion.version, {
          reason: 'Exceeded maximum version policy',
          migrationGuide: 'Please migrate to the latest version',
          supportEndDate: new Date(Date.now() + policy.policy.supportPeriod * 24 * 60 * 60 * 1000).toISOString(),
          replacementVersion: version.version
        });
      }
    }
  }

  // Deprecate an API version
  public async deprecateVersion(
    apiId: string, 
    version: string, 
    deprecationPlan: APIVersion['deprecationPlan']
  ): Promise<void> {
    const apiVersion = await this.getVersion(apiId, version);
    if (!apiVersion) {
      throw new Error('Version not found');
    }

    if (apiVersion.status !== 'published') {
      throw new Error('Only published versions can be deprecated');
    }

    // Update version status
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-api-versions`;
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ apiId, version }),
      UpdateExpression: 'SET #status = :status, deprecatedAt = :deprecatedAt, deprecationPlan = :plan',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: marshall({
        ':status': 'deprecated',
        ':deprecatedAt': new Date().toISOString(),
        ':plan': deprecationPlan
      })
    });

    await this.dynamodb.send(command);

    // Send deprecation notifications
    await this.sendDeprecationNotification(apiVersion, deprecationPlan!);

    logger.info('API version deprecated', {
      apiId,
      version,
      reason: deprecationPlan?.reason
    });
  }

  // Retire an API version
  public async retireVersion(apiId: string, version: string): Promise<void> {
    const apiVersion = await this.getVersion(apiId, version);
    if (!apiVersion) {
      throw new Error('Version not found');
    }

    if (apiVersion.status !== 'deprecated') {
      throw new Error('Only deprecated versions can be retired');
    }

    // Update version status
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-api-versions`;
    const command = new UpdateItemCommand({
      TableName: tableName,
      Key: marshall({ apiId, version }),
      UpdateExpression: 'SET #status = :status, retiredAt = :retiredAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: marshall({
        ':status': 'retired',
        ':retiredAt': new Date().toISOString()
      })
    });

    await this.dynamodb.send(command);

    // Remove from active deployment
    await this.removeDeployment(apiVersion);

    logger.info('API version retired', { apiId, version });
  }

  // Compare two API versions for compatibility
  public async compareVersions(
    apiId: string, 
    version1: string, 
    version2: string
  ): Promise<CompatibilityReport> {
    const v1 = await this.getVersion(apiId, version1);
    const v2 = await this.getVersion(apiId, version2);

    if (!v1 || !v2) {
      throw new Error('One or both versions not found');
    }

    const report: CompatibilityReport = {
      version1,
      version2,
      compatible: true,
      breakingChanges: [],
      warnings: [],
      score: 100
    };

    // Analyze OpenAPI specifications for breaking changes
    const breakingChanges = this.analyzeBreakingChanges(v1.specification, v2.specification);
    report.breakingChanges = breakingChanges;
    report.compatible = breakingChanges.length === 0;
    
    // Calculate compatibility score
    let scoreDeduction = 0;
    breakingChanges.forEach(change => {
      switch (change.severity) {
        case 'critical': scoreDeduction += 25; break;
        case 'high': scoreDeduction += 15; break;
        case 'medium': scoreDeduction += 10; break;
        case 'low': scoreDeduction += 5; break;
      }
    });
    
    report.score = Math.max(0, 100 - scoreDeduction);

    return report;
  }

  // Analyze breaking changes between two OpenAPI specifications
  private analyzeBreakingChanges(spec1: any, spec2: any): CompatibilityReport['breakingChanges'] {
    const breakingChanges: CompatibilityReport['breakingChanges'] = [];

    // Check for removed endpoints
    const paths1 = Object.keys(spec1.paths || {});
    const paths2 = Object.keys(spec2.paths || {});
    
    paths1.forEach(path => {
      if (!paths2.includes(path)) {
        breakingChanges.push({
          type: 'removed-endpoint',
          path,
          description: `Endpoint ${path} was removed`,
          severity: 'critical',
          impact: 'Clients using this endpoint will fail',
          mitigation: 'Provide alternative endpoint or keep for backward compatibility'
        });
      }
    });

    // Check for changed response schemas
    paths2.forEach(path => {
      if (paths1.includes(path)) {
        const methods1 = Object.keys(spec1.paths[path] || {});
        const methods2 = Object.keys(spec2.paths[path] || {});
        
        methods2.forEach(method => {
          if (methods1.includes(method)) {
            const responses1 = spec1.paths[path][method]?.responses;
            const responses2 = spec2.paths[path][method]?.responses;
            
            if (responses1 && responses2) {
              // Compare response schemas (simplified check)
              const schema1 = JSON.stringify(responses1['200']?.content);
              const schema2 = JSON.stringify(responses2['200']?.content);
              
              if (schema1 !== schema2) {
                breakingChanges.push({
                  type: 'changed-response-format',
                  path: `${method.toUpperCase()} ${path}`,
                  description: 'Response format changed',
                  severity: 'high',
                  impact: 'Client parsing may fail',
                  mitigation: 'Use content negotiation or versioned endpoints'
                });
              }
            }
          }
        });
      }
    });

    return breakingChanges;
  }

  // Create migration plan
  public async createMigrationPlan(
    apiId: string,
    fromVersion: string,
    toVersion: string,
    strategy: MigrationPlan['strategy']
  ): Promise<MigrationPlan> {
    const compatibilityReport = await this.compareVersions(apiId, fromVersion, toVersion);
    
    const migrationPlan: MigrationPlan = {
      id: `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromVersion,
      toVersion,
      apiId,
      tenantId: '', // This would be set from context
      status: 'planned',
      createdAt: new Date().toISOString(),
      strategy,
      steps: this.generateMigrationSteps(strategy, compatibilityReport),
      rollbackPlan: {
        enabled: true,
        conditions: ['error-rate > 5%', 'response-time > 2000ms'],
        steps: ['Stop traffic to new version', 'Route all traffic to old version', 'Investigate issues']
      },
      validation: {
        preDeployment: this.generateValidationTests('pre', fromVersion, toVersion),
        postDeployment: this.generateValidationTests('post', fromVersion, toVersion),
        contractTests: ['contract-test-suite']
      },
      metrics: {
        successRate: 0,
        errorRate: 0,
        performanceImpact: 0
      }
    };

    // Store migration plan
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-migration-plans`;
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(migrationPlan)
    });

    await this.dynamodb.send(command);

    return migrationPlan;
  }

  // Generate migration steps based on strategy
  private generateMigrationSteps(strategy: string, compatibilityReport: CompatibilityReport): MigrationStep[] {
    const steps: MigrationStep[] = [];

    // Common preparation steps
    steps.push({
      id: 'prep-1',
      name: 'Pre-deployment Validation',
      description: 'Run pre-deployment tests and validations',
      type: 'preparation',
      status: 'pending',
      dependencies: [],
      commands: ['npm test', 'npm run lint', 'npm run security-check'],
      validation: {
        healthCheck: true,
        contractTests: true,
        performanceTests: false
      }
    });

    // Strategy-specific deployment steps
    switch (strategy) {
      case 'blue-green':
        steps.push(
          {
            id: 'deploy-1',
            name: 'Deploy Green Environment',
            description: 'Deploy new version to green environment',
            type: 'deployment',
            status: 'pending',
            dependencies: ['prep-1'],
            commands: ['kubectl apply -f green-deployment.yaml'],
            validation: {
              healthCheck: true,
              contractTests: true,
              performanceTests: true
            }
          },
          {
            id: 'deploy-2',
            name: 'Switch Traffic',
            description: 'Switch traffic from blue to green',
            type: 'deployment',
            status: 'pending',
            dependencies: ['deploy-1'],
            commands: ['kubectl patch service api-service -p \'...\'' ],
            validation: {
              healthCheck: true,
              contractTests: false,
              performanceTests: true
            }
          }
        );
        break;
      
      case 'canary':
        steps.push(
          {
            id: 'deploy-1',
            name: 'Deploy Canary (10%)',
            description: 'Deploy new version to 10% of traffic',
            type: 'deployment',
            status: 'pending',
            dependencies: ['prep-1'],
            commands: ['kubectl apply -f canary-10-deployment.yaml'],
            validation: {
              healthCheck: true,
              contractTests: true,
              performanceTests: true
            }
          },
          {
            id: 'deploy-2',
            name: 'Increase to 50%',
            description: 'Increase canary traffic to 50%',
            type: 'deployment',
            status: 'pending',
            dependencies: ['deploy-1'],
            commands: ['kubectl apply -f canary-50-deployment.yaml'],
            validation: {
              healthCheck: true,
              contractTests: false,
              performanceTests: true
            }
          },
          {
            id: 'deploy-3',
            name: 'Full Deployment',
            description: 'Route 100% traffic to new version',
            type: 'deployment',
            status: 'pending',
            dependencies: ['deploy-2'],
            commands: ['kubectl apply -f full-deployment.yaml'],
            validation: {
              healthCheck: true,
              contractTests: false,
              performanceTests: true
            }
          }
        );
        break;
    }

    // Post-deployment cleanup
    steps.push({
      id: 'cleanup-1',
      name: 'Cleanup Old Resources',
      description: 'Remove old deployment resources',
      type: 'cleanup',
      status: 'pending',
      dependencies: [steps[steps.length - 1].id],
      commands: ['kubectl delete deployment old-api-deployment'],
      validation: {
        healthCheck: false,
        contractTests: false,
        performanceTests: false
      }
    });

    return steps;
  }

  // Generate validation tests
  private generateValidationTests(phase: 'pre' | 'post', fromVersion: string, toVersion: string): ValidationTest[] {
    const tests: ValidationTest[] = [
      {
        name: 'Health Check',
        type: 'integration',
        endpoint: '/health',
        method: 'GET',
        expectedStatus: 200,
        timeout: 5000,
        retries: 3
      },
      {
        name: 'API Compatibility',
        type: 'contract',
        endpoint: '/api/v1/test',
        method: 'GET',
        expectedStatus: 200,
        timeout: 10000,
        retries: 2
      }
    ];

    if (phase === 'post') {
      tests.push({
        name: 'Performance Baseline',
        type: 'performance',
        endpoint: '/api/v1/benchmark',
        method: 'GET',
        expectedStatus: 200,
        timeout: 15000,
        retries: 1
      });
    }

    return tests;
  }

  // Get lifecycle policy
  private async getLifecyclePolicy(apiId: string): Promise<APILifecyclePolicy | null> {
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-api-lifecycle-policies`;
    const command = new GetItemCommand({
      TableName: tableName,
      Key: marshall({ apiId })
    });

    const result = await this.dynamodb.send(command);
    if (!result.Item) {
      return null;
    }

    return unmarshall(result.Item) as APILifecyclePolicy;
  }

  // Send deprecation notification
  private async sendDeprecationNotification(
    version: APIVersion, 
    deprecationPlan: APIVersion['deprecationPlan']
  ): Promise<void> {
    // This would integrate with notification service
    logger.info('Deprecation notification sent', {
      apiId: version.apiId,
      version: version.version,
      reason: deprecationPlan?.reason
    });
  }

  // Remove deployment
  private async removeDeployment(version: APIVersion): Promise<void> {
    // This would integrate with container orchestration service
    logger.info('Deployment removed', {
      apiId: version.apiId,
      version: version.version,
      endpoint: version.deployment.endpoint
    });
  }

  // Initialize routes
  private initializeRoutes(): void {
    // Create new version
    this.router.post('/apis/:apiId/versions', async (req: Request, res: Response) => {
      try {
        const { apiId } = req.params;
        const tenantId = req.tenant?.tenantId;
        
        if (!tenantId) {
          return res.status(400).json({ error: 'Tenant context required' });
        }
        
        const version = await this.createVersion({
          ...req.body,
          apiId,
          tenantId
        });
        
        res.json(version);
      } catch (error) {
        logger.error('Failed to create version', { error });
        res.status(500).json({ error: 'Failed to create version' });
      }
    });

    // Get all versions
    this.router.get('/apis/:apiId/versions', async (req: Request, res: Response) => {
      try {
        const { apiId } = req.params;
        const versions = await this.getVersions(apiId);
        res.json(versions);
      } catch (error) {
        logger.error('Failed to get versions', { error });
        res.status(500).json({ error: 'Failed to get versions' });
      }
    });

    // Get specific version
    this.router.get('/apis/:apiId/versions/:version', async (req: Request, res: Response) => {
      try {
        const { apiId, version } = req.params;
        const apiVersion = await this.getVersion(apiId, version);
        
        if (!apiVersion) {
          return res.status(404).json({ error: 'Version not found' });
        }
        
        res.json(apiVersion);
      } catch (error) {
        logger.error('Failed to get version', { error });
        res.status(500).json({ error: 'Failed to get version' });
      }
    });

    // Compare versions
    this.router.get('/apis/:apiId/versions/:version1/compare/:version2', async (req: Request, res: Response) => {
      try {
        const { apiId, version1, version2 } = req.params;
        const comparison = await this.compareVersions(apiId, version1, version2);
        res.json(comparison);
      } catch (error) {
        logger.error('Failed to compare versions', { error });
        res.status(500).json({ error: 'Failed to compare versions' });
      }
    });

    // Deprecate version
    this.router.post('/apis/:apiId/versions/:version/deprecate', async (req: Request, res: Response) => {
      try {
        const { apiId, version } = req.params;
        const deprecationPlan = req.body;
        
        await this.deprecateVersion(apiId, version, deprecationPlan);
        res.json({ message: 'Version deprecated successfully' });
      } catch (error) {
        logger.error('Failed to deprecate version', { error });
        res.status(500).json({ error: 'Failed to deprecate version' });
      }
    });

    // Create migration plan
    this.router.post('/apis/:apiId/versions/:fromVersion/migrate/:toVersion', async (req: Request, res: Response) => {
      try {
        const { apiId, fromVersion, toVersion } = req.params;
        const { strategy } = req.body;
        
        const migrationPlan = await this.createMigrationPlan(apiId, fromVersion, toVersion, strategy);
        res.json(migrationPlan);
      } catch (error) {
        logger.error('Failed to create migration plan', { error });
        res.status(500).json({ error: 'Failed to create migration plan' });
      }
    });
  }

  public getRouter(): Router {
    return this.router;
  }
}

export { APIVersioningService, APIVersion, MigrationPlan, CompatibilityReport };