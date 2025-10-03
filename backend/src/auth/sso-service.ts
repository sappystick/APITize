import { Router, Request, Response } from 'express';
import passport from 'passport';
import { Strategy as SamlStrategy, Profile as SamlProfile } from 'passport-saml';
import { Strategy as OAuth2Strategy, Profile as OAuth2Profile } from 'passport-oauth2';
import jwt from 'jsonwebtoken';
import { DynamoDBClient, PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { logger } from '../utils/logger';

interface SSOConfiguration {
  tenantId: string;
  name: string;
  type: 'saml' | 'oidc' | 'oauth2';
  enabled: boolean;
  config: {
    // SAML Configuration
    entryPoint?: string;
    issuer?: string;
    cert?: string;
    privateKey?: string;
    signatureAlgorithm?: string;
    
    // OAuth2/OIDC Configuration
    clientID?: string;
    clientSecret?: string;
    authorizationURL?: string;
    tokenURL?: string;
    userInfoURL?: string;
    scope?: string[];
    
    // Common Configuration
    callbackURL: string;
    identifierFormat?: string;
    attributeMapping: {
      email: string;
      firstName: string;
      lastName: string;
      department?: string;
      roles?: string;
    };
  };
}

interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  roles: string[];
  tenantId: string;
  ssoProvider: string;
  lastLogin: string;
  isActive: boolean;
}

class EnterpriseSSO {
  private dynamodb: DynamoDBClient;
  private router: Router;
  private ssoConfigurations: Map<string, SSOConfiguration> = new Map();

  constructor() {
    this.dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.router = Router();
    this.initializeRoutes();
    this.loadSSOConfigurations();
  }

  // Load SSO configurations from database
  private async loadSSOConfigurations(): Promise<void> {
    try {
      // This would typically load from DynamoDB
      // For now, we'll use environment-based configuration
      const defaultConfigs = this.getDefaultConfigurations();
      
      for (const config of defaultConfigs) {
        await this.configureSSOProvider(config);
      }
      
      logger.info('SSO configurations loaded successfully', { count: this.ssoConfigurations.size });
    } catch (error) {
      logger.error('Failed to load SSO configurations', { error });
    }
  }

  // Configure individual SSO provider
  private async configureSSOProvider(config: SSOConfiguration): Promise<void> {
    try {
      if (!config.enabled) {
        logger.info('SSO provider disabled', { provider: config.name });
        return;
      }

      switch (config.type) {
        case 'saml':
          await this.configureSAML(config);
          break;
        case 'oidc':
        case 'oauth2':
          await this.configureOAuth2(config);
          break;
        default:
          logger.warn('Unknown SSO provider type', { type: config.type });
      }
      
      this.ssoConfigurations.set(config.tenantId, config);
      logger.info('SSO provider configured', { 
        provider: config.name, 
        type: config.type,
        tenantId: config.tenantId 
      });
    } catch (error) {
      logger.error('Failed to configure SSO provider', { 
        provider: config.name, 
        error 
      });
    }
  }

  // Configure SAML strategy
  private async configureSAML(config: SSOConfiguration): Promise<void> {
    const samlStrategy = new SamlStrategy(
      {
        entryPoint: config.config.entryPoint!,
        issuer: config.config.issuer!,
        cert: config.config.cert!,
        privateKey: config.config.privateKey,
        signatureAlgorithm: config.config.signatureAlgorithm || 'sha256',
        callbackUrl: config.config.callbackURL,
        identifierFormat: config.config.identifierFormat,
        acceptedClockSkewMs: 300000, // 5 minutes
        attributeConsumingServiceIndex: false,
        disableRequestedAuthnContext: true
      },
      async (profile: SamlProfile, done: Function) => {
        try {
          const userProfile = await this.processSAMLProfile(profile, config);
          return done(null, userProfile);
        } catch (error) {
          logger.error('SAML profile processing failed', { error, profile });
          return done(error, null);
        }
      }
    );

    passport.use(`saml-${config.tenantId}`, samlStrategy);
  }

  // Configure OAuth2/OIDC strategy
  private async configureOAuth2(config: SSOConfiguration): Promise<void> {
    const oauth2Strategy = new OAuth2Strategy(
      {
        clientID: config.config.clientID!,
        clientSecret: config.config.clientSecret!,
        authorizationURL: config.config.authorizationURL!,
        tokenURL: config.config.tokenURL!,
        callbackURL: config.config.callbackURL,
        scope: config.config.scope || ['openid', 'email', 'profile']
      },
      async (accessToken: string, refreshToken: string, profile: OAuth2Profile, done: Function) => {
        try {
          // Fetch user info from OIDC userinfo endpoint
          const userInfo = await this.fetchUserInfo(accessToken, config.config.userInfoURL!);
          const userProfile = await this.processOIDCProfile(userInfo, config, accessToken, refreshToken);
          return done(null, userProfile);
        } catch (error) {
          logger.error('OAuth2/OIDC profile processing failed', { error });
          return done(error, null);
        }
      }
    );

    passport.use(`oauth2-${config.tenantId}`, oauth2Strategy);
  }

  // Process SAML profile and create user
  private async processSAMLProfile(profile: SamlProfile, config: SSOConfiguration): Promise<UserProfile> {
    const mapping = config.config.attributeMapping;
    
    const userProfile: UserProfile = {
      id: profile.nameID || profile.ID || '',
      email: this.getAttributeValue(profile, mapping.email),
      firstName: this.getAttributeValue(profile, mapping.firstName),
      lastName: this.getAttributeValue(profile, mapping.lastName),
      department: mapping.department ? this.getAttributeValue(profile, mapping.department) : undefined,
      roles: this.parseRoles(profile, mapping.roles),
      tenantId: config.tenantId,
      ssoProvider: config.name,
      lastLogin: new Date().toISOString(),
      isActive: true
    };

    await this.createOrUpdateUser(userProfile);
    return userProfile;
  }

  // Process OIDC profile and create user
  private async processOIDCProfile(
    userInfo: any, 
    config: SSOConfiguration,
    accessToken: string,
    refreshToken: string
  ): Promise<UserProfile> {
    const mapping = config.config.attributeMapping;
    
    const userProfile: UserProfile = {
      id: userInfo.sub || userInfo.id,
      email: userInfo[mapping.email] || userInfo.email,
      firstName: userInfo[mapping.firstName] || userInfo.given_name || userInfo.first_name,
      lastName: userInfo[mapping.lastName] || userInfo.family_name || userInfo.last_name,
      department: mapping.department ? userInfo[mapping.department] : undefined,
      roles: this.parseRolesFromClaims(userInfo, mapping.roles),
      tenantId: config.tenantId,
      ssoProvider: config.name,
      lastLogin: new Date().toISOString(),
      isActive: true
    };

    await this.createOrUpdateUser(userProfile);
    return userProfile;
  }

  // Fetch user info from OIDC endpoint
  private async fetchUserInfo(accessToken: string, userInfoURL: string): Promise<any> {
    const response = await fetch(userInfoURL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user info: ${response.statusText}`);
    }

    return response.json();
  }

  // Extract attribute value from SAML profile
  private getAttributeValue(profile: SamlProfile, attributeName: string): string {
    if (!profile.attributes) return '';
    
    const value = profile.attributes[attributeName];
    if (Array.isArray(value)) {
      return value[0] || '';
    }
    return value || '';
  }

  // Parse roles from SAML profile
  private parseRoles(profile: SamlProfile, roleAttribute?: string): string[] {
    if (!roleAttribute || !profile.attributes) return [];
    
    const roles = profile.attributes[roleAttribute];
    if (Array.isArray(roles)) {
      return roles;
    }
    return roles ? [roles] : [];
  }

  // Parse roles from OIDC claims
  private parseRolesFromClaims(userInfo: any, roleAttribute?: string): string[] {
    if (!roleAttribute) return [];
    
    const roles = userInfo[roleAttribute] || userInfo.roles || userInfo.groups;
    if (Array.isArray(roles)) {
      return roles;
    }
    return roles ? [roles] : [];
  }

  // Create or update user in database
  private async createOrUpdateUser(userProfile: UserProfile): Promise<void> {
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-users`;
    
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall({
        ...userProfile,
        updatedAt: new Date().toISOString()
      })
    });

    await this.dynamodb.send(command);
    
    logger.info('User profile updated', { 
      userId: userProfile.id, 
      email: userProfile.email,
      tenantId: userProfile.tenantId 
    });
  }

  // Generate JWT token for authenticated user
  private generateJWTToken(userProfile: UserProfile): string {
    const payload = {
      sub: userProfile.id,
      email: userProfile.email,
      name: `${userProfile.firstName} ${userProfile.lastName}`,
      roles: userProfile.roles,
      tenantId: userProfile.tenantId,
      ssoProvider: userProfile.ssoProvider,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
    };

    return jwt.sign(payload, process.env.JWT_SECRET!, {
      algorithm: 'HS256',
      issuer: 'apitize-platform'
    });
  }

  // Initialize routes
  private initializeRoutes(): void {
    // SSO login initiation
    this.router.get('/sso/login/:tenantId', (req: Request, res: Response, next) => {
      const { tenantId } = req.params;
      const config = this.ssoConfigurations.get(tenantId);
      
      if (!config || !config.enabled) {
        return res.status(404).json({ error: 'SSO provider not found or disabled' });
      }

      const strategyName = `${config.type}-${tenantId}`;
      passport.authenticate(strategyName)(req, res, next);
    });

    // SSO callback handler
    this.router.post('/sso/callback/:tenantId', (req: Request, res: Response, next) => {
      const { tenantId } = req.params;
      const config = this.ssoConfigurations.get(tenantId);
      
      if (!config) {
        return res.status(404).json({ error: 'SSO provider not found' });
      }

      const strategyName = `${config.type}-${tenantId}`;
      
      passport.authenticate(strategyName, (err: any, user: UserProfile) => {
        if (err) {
          logger.error('SSO authentication error', { error: err, tenantId });
          return res.status(401).json({ error: 'Authentication failed' });
        }

        if (!user) {
          return res.status(401).json({ error: 'Authentication failed' });
        }

        // Generate JWT token
        const token = this.generateJWTToken(user);
        
        // Set secure HTTP-only cookie
        res.cookie('auth_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        // Redirect to frontend with success
        const redirectURL = `${process.env.FRONTEND_URL}/auth/success?tenant=${tenantId}`;
        res.redirect(redirectURL);
      })(req, res, next);
    });

    // SSO configuration management
    this.router.post('/sso/config/:tenantId', async (req: Request, res: Response) => {
      try {
        const { tenantId } = req.params;
        const config: SSOConfiguration = req.body;
        
        config.tenantId = tenantId;
        await this.configureSSOProvider(config);
        
        res.json({ message: 'SSO configuration updated successfully' });
      } catch (error) {
        logger.error('Failed to update SSO configuration', { error });
        res.status(500).json({ error: 'Failed to update SSO configuration' });
      }
    });

    // Get SSO configuration
    this.router.get('/sso/config/:tenantId', (req: Request, res: Response) => {
      const { tenantId } = req.params;
      const config = this.ssoConfigurations.get(tenantId);
      
      if (!config) {
        return res.status(404).json({ error: 'SSO configuration not found' });
      }

      // Remove sensitive information
      const sanitizedConfig = {
        ...config,
        config: {
          ...config.config,
          clientSecret: undefined,
          privateKey: undefined
        }
      };

      res.json(sanitizedConfig);
    });

    // SSO metadata endpoint for SAML
    this.router.get('/sso/metadata/:tenantId', (req: Request, res: Response) => {
      const { tenantId } = req.params;
      const config = this.ssoConfigurations.get(tenantId);
      
      if (!config || config.type !== 'saml') {
        return res.status(404).json({ error: 'SAML configuration not found' });
      }

      const metadata = this.generateSAMLMetadata(config);
      res.type('application/xml').send(metadata);
    });
  }

  // Generate SAML metadata
  private generateSAMLMetadata(config: SSOConfiguration): string {
    const entityId = config.config.issuer;
    const acsURL = config.config.callbackURL;
    
    return `<?xml version="1.0"?>
<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${entityId}">
  <md:SPSSODescriptor AuthnRequestsSigned="true" protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsURL}" index="1"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  // Get default configurations from environment
  private getDefaultConfigurations(): SSOConfiguration[] {
    const configs: SSOConfiguration[] = [];

    // Azure AD configuration
    if (process.env.AZURE_AD_CLIENT_ID) {
      configs.push({
        tenantId: 'azure-ad',
        name: 'Azure Active Directory',
        type: 'oidc',
        enabled: true,
        config: {
          clientID: process.env.AZURE_AD_CLIENT_ID,
          clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
          authorizationURL: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/authorize`,
          tokenURL: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/oauth2/v2.0/token`,
          userInfoURL: 'https://graph.microsoft.com/oidc/userinfo',
          callbackURL: `${process.env.API_BASE_URL}/auth/sso/callback/azure-ad`,
          scope: ['openid', 'email', 'profile'],
          attributeMapping: {
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            department: 'department',
            roles: 'roles'
          }
        }
      });
    }

    // Okta configuration
    if (process.env.OKTA_CLIENT_ID) {
      configs.push({
        tenantId: 'okta',
        name: 'Okta',
        type: 'oidc',
        enabled: true,
        config: {
          clientID: process.env.OKTA_CLIENT_ID,
          clientSecret: process.env.OKTA_CLIENT_SECRET!,
          authorizationURL: `${process.env.OKTA_DOMAIN}/oauth2/v1/authorize`,
          tokenURL: `${process.env.OKTA_DOMAIN}/oauth2/v1/token`,
          userInfoURL: `${process.env.OKTA_DOMAIN}/oauth2/v1/userinfo`,
          callbackURL: `${process.env.API_BASE_URL}/auth/sso/callback/okta`,
          scope: ['openid', 'email', 'profile', 'groups'],
          attributeMapping: {
            email: 'email',
            firstName: 'given_name',
            lastName: 'family_name',
            department: 'department',
            roles: 'groups'
          }
        }
      });
    }

    return configs;
  }

  public getRouter(): Router {
    return this.router;
  }
}

export { EnterpriseSSO, SSOConfiguration, UserProfile };