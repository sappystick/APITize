import { Router, Request, Response } from 'express';
import { DynamoDBClient, PutItemCommand, QueryCommand, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { CloudWatchClient, PutMetricDataCommand, GetMetricStatisticsCommand, PutMetricAlarmCommand } from '@aws-sdk/client-cloudwatch';
import { SNSClient, PublishCommand, CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { TenantContext } from '../tenant/multi-tenant-service';
import { logger } from '../utils/logger';
import Redis from 'ioredis';

interface MetricData {
  tenantId: string;
  metricName: string;
  value: number;
  unit: string;
  timestamp: string;
  dimensions?: Record<string, string>;
  metadata?: Record<string, any>;
}

interface AlertRule {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  metricName: string;
  threshold: number;
  comparison: 'GreaterThanThreshold' | 'LessThanThreshold' | 'GreaterThanOrEqualToThreshold' | 'LessThanOrEqualToThreshold';
  evaluationPeriods: number;
  period: number; // seconds
  statistic: 'Average' | 'Sum' | 'Maximum' | 'Minimum' | 'SampleCount';
  enabled: boolean;
  actions: AlertAction[];
  createdAt: string;
  updatedAt: string;
}

interface AlertAction {
  type: 'email' | 'sms' | 'webhook' | 'slack';
  target: string;
  template?: string;
}

interface HealthCheck {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: string;
  interval: number; // seconds
  timeout: number; // seconds
  expectedStatus: number[];
  enabled: boolean;
  lastCheck?: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  consecutiveFailures: number;
}

interface DisasterRecoveryPlan {
  tenantId: string;
  rto: number; // Recovery Time Objective (minutes)
  rpo: number; // Recovery Point Objective (minutes)
  backupStrategy: {
    frequency: 'hourly' | 'daily' | 'weekly';
    retention: number; // days
    crossRegion: boolean;
    encryption: boolean;
  };
  failoverStrategy: {
    automatic: boolean;
    regions: string[];
    healthCheckThreshold: number;
  };
  dataReplication: {
    enabled: boolean;
    targets: string[];
    syncType: 'sync' | 'async';
  };
  notificationContacts: string[];
}

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  services: Record<string, {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    responseTime: number;
    errorRate: number;
    lastCheck: string;
  }>;
  infrastructure: {
    cpu: number;
    memory: number;
    disk: number;
    network: number;
  };
  alerts: {
    active: number;
    critical: number;
    warning: number;
  };
}

class AdvancedMonitoringService {
  private dynamodb: DynamoDBClient;
  private cloudwatch: CloudWatchClient;
  private sns: SNSClient;
  private ses: SESClient;
  private redis: Redis;
  private router: Router;
  private healthChecks: Map<string, NodeJS.Timeout> = new Map();
  private alertTopics: Map<string, string> = new Map();

  constructor() {
    this.dynamodb = new DynamoDBClient({ region: process.env.AWS_REGION });
    this.cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION });
    this.sns = new SNSClient({ region: process.env.AWS_REGION });
    this.ses = new SESClient({ region: process.env.AWS_REGION });
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.router = Router();
    
    this.initializeRoutes();
    this.initializeHealthChecks();
    this.initializeAlertTopics();
  }

  // Initialize SNS topics for alerts
  private async initializeAlertTopics(): Promise<void> {
    try {
      const topics = ['critical', 'warning', 'info'];
      
      for (const topic of topics) {
        const topicName = `apitize-alerts-${topic}`;
        
        const createTopicCommand = new CreateTopicCommand({
          Name: topicName
        });
        
        const result = await this.sns.send(createTopicCommand);
        if (result.TopicArn) {
          this.alertTopics.set(topic, result.TopicArn);
        }
      }
      
      logger.info('Alert topics initialized', { topics: Array.from(this.alertTopics.keys()) });
    } catch (error) {
      logger.error('Failed to initialize alert topics', { error });
    }
  }

  // Initialize health checks from database
  private async initializeHealthChecks(): Promise<void> {
    try {
      const healthChecks = await this.loadHealthChecks();
      
      for (const healthCheck of healthChecks) {
        if (healthCheck.enabled) {
          this.startHealthCheck(healthCheck);
        }
      }
      
      logger.info('Health checks initialized', { count: healthChecks.length });
    } catch (error) {
      logger.error('Failed to initialize health checks', { error });
    }
  }

  // Load health checks from database
  private async loadHealthChecks(): Promise<HealthCheck[]> {
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-health-checks`;
    
    const command = new QueryCommand({
      TableName: tableName,
      IndexName: 'enabled-index',
      KeyConditionExpression: 'enabled = :enabled',
      ExpressionAttributeValues: marshall({ ':enabled': true })
    });
    
    const result = await this.dynamodb.send(command);
    return result.Items?.map(item => unmarshall(item) as HealthCheck) || [];
  }

  // Start health check monitoring
  private startHealthCheck(healthCheck: HealthCheck): void {
    const intervalId = setInterval(async () => {
      await this.performHealthCheck(healthCheck);
    }, healthCheck.interval * 1000);
    
    this.healthChecks.set(healthCheck.id, intervalId);
  }

  // Perform individual health check
  private async performHealthCheck(healthCheck: HealthCheck): Promise<void> {
    const startTime = Date.now();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), healthCheck.timeout * 1000);
      
      const response = await fetch(healthCheck.url, {
        method: healthCheck.method,
        headers: healthCheck.headers,
        body: healthCheck.body,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const responseTime = Date.now() - startTime;
      const isHealthy = healthCheck.expectedStatus.includes(response.status);
      
      await this.updateHealthCheckStatus(healthCheck, isHealthy, responseTime);
      
      // Send metrics to CloudWatch
      await this.sendMetric({
        tenantId: healthCheck.tenantId,
        metricName: 'HealthCheckResponseTime',
        value: responseTime,
        unit: 'Milliseconds',
        timestamp: new Date().toISOString(),
        dimensions: {
          HealthCheckId: healthCheck.id,
          HealthCheckName: healthCheck.name
        }
      });
      
      await this.sendMetric({
        tenantId: healthCheck.tenantId,
        metricName: 'HealthCheckStatus',
        value: isHealthy ? 1 : 0,
        unit: 'Count',
        timestamp: new Date().toISOString(),
        dimensions: {
          HealthCheckId: healthCheck.id,
          HealthCheckName: healthCheck.name
        }
      });
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      await this.updateHealthCheckStatus(healthCheck, false, responseTime);
      
      logger.warn('Health check failed', {
        healthCheckId: healthCheck.id,
        url: healthCheck.url,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Update health check status
  private async updateHealthCheckStatus(
    healthCheck: HealthCheck, 
    isHealthy: boolean, 
    responseTime: number
  ): Promise<void> {
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-health-checks`;
    
    const newStatus = isHealthy ? 'healthy' : 'unhealthy';
    const newConsecutiveFailures = isHealthy ? 0 : healthCheck.consecutiveFailures + 1;
    
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall({
        ...healthCheck,
        status: newStatus,
        consecutiveFailures: newConsecutiveFailures,
        lastCheck: new Date().toISOString(),
        lastResponseTime: responseTime
      })
    });
    
    await this.dynamodb.send(command);
    
    // Trigger alerts if needed
    if (!isHealthy && newConsecutiveFailures >= 3) {
      await this.triggerAlert('critical', {
        title: `Health Check Failed: ${healthCheck.name}`,
        message: `Health check for ${healthCheck.url} has failed ${newConsecutiveFailures} consecutive times.`,
        tenantId: healthCheck.tenantId,
        metadata: {
          healthCheckId: healthCheck.id,
          url: healthCheck.url,
          consecutiveFailures: newConsecutiveFailures
        }
      });
    }
  }

  // Send metrics to CloudWatch
  public async sendMetric(metric: MetricData): Promise<void> {
    try {
      const dimensions = Object.entries(metric.dimensions || {}).map(([name, value]) => ({
        Name: name,
        Value: value
      }));
      
      dimensions.push({
        Name: 'TenantId',
        Value: metric.tenantId
      });
      
      const command = new PutMetricDataCommand({
        Namespace: 'APItize/Platform',
        MetricData: [{
          MetricName: metric.metricName,
          Value: metric.value,
          Unit: metric.unit as any,
          Timestamp: new Date(metric.timestamp),
          Dimensions: dimensions
        }]
      });
      
      await this.cloudwatch.send(command);
      
      // Also store in local time-series database for faster queries
      await this.storeMetricLocally(metric);
      
    } catch (error) {
      logger.error('Failed to send metric', { metric, error });
    }
  }

  // Store metrics locally in Redis for fast access
  private async storeMetricLocally(metric: MetricData): Promise<void> {
    try {
      const key = `metrics:${metric.tenantId}:${metric.metricName}`;
      const value = JSON.stringify({
        value: metric.value,
        timestamp: metric.timestamp,
        dimensions: metric.dimensions
      });
      
      // Store with 24-hour expiration
      await this.redis.zadd(key, Date.now(), value);
      await this.redis.expire(key, 86400);
      
      // Remove old entries (keep last 1000)
      await this.redis.zremrangebyrank(key, 0, -1001);
      
    } catch (error) {
      logger.error('Failed to store metric locally', { error });
    }
  }

  // Create alert rule
  public async createAlertRule(alertRule: Omit<AlertRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<AlertRule> {
    const rule: AlertRule = {
      ...alertRule,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // Store in DynamoDB
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-alert-rules`;
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(rule)
    });
    
    await this.dynamodb.send(command);
    
    // Create CloudWatch alarm
    await this.createCloudWatchAlarm(rule);
    
    logger.info('Alert rule created', { alertRuleId: rule.id, tenantId: rule.tenantId });
    
    return rule;
  }

  // Create CloudWatch alarm
  private async createCloudWatchAlarm(rule: AlertRule): Promise<void> {
    const alarmName = `${rule.tenantId}-${rule.metricName}-${rule.id}`;
    
    const command = new PutMetricAlarmCommand({
      AlarmName: alarmName,
      AlarmDescription: rule.description,
      MetricName: rule.metricName,
      Namespace: 'APItize/Platform',
      Statistic: rule.statistic,
      Period: rule.period,
      EvaluationPeriods: rule.evaluationPeriods,
      Threshold: rule.threshold,
      ComparisonOperator: rule.comparison,
      Dimensions: [{
        Name: 'TenantId',
        Value: rule.tenantId
      }],
      AlarmActions: [this.alertTopics.get('critical')!],
      OKActions: [this.alertTopics.get('info')!]
    });
    
    await this.cloudwatch.send(command);
  }

  // Trigger alert
  public async triggerAlert(severity: 'critical' | 'warning' | 'info', alert: {
    title: string;
    message: string;
    tenantId: string;
    metadata?: any;
  }): Promise<void> {
    try {
      const alertData = {
        ...alert,
        severity,
        timestamp: new Date().toISOString(),
        id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      // Store alert in database
      await this.storeAlert(alertData);
      
      // Send notifications
      await this.sendAlertNotifications(alertData);
      
      logger.info('Alert triggered', { 
        alertId: alertData.id, 
        severity, 
        tenantId: alert.tenantId 
      });
      
    } catch (error) {
      logger.error('Failed to trigger alert', { alert, error });
    }
  }

  // Store alert in database
  private async storeAlert(alert: any): Promise<void> {
    const tableName = `${process.env.DYNAMODB_TABLE_PREFIX}-alerts`;
    
    const command = new PutItemCommand({
      TableName: tableName,
      Item: marshall(alert)
    });
    
    await this.dynamodb.send(command);
  }

  // Send alert notifications
  private async sendAlertNotifications(alert: any): Promise<void> {
    // Send to SNS topic
    const topicArn = this.alertTopics.get(alert.severity);
    if (topicArn) {
      const snsCommand = new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(alert),
        Subject: alert.title
      });
      
      await this.sns.send(snsCommand);
    }
    
    // Send email notification for critical alerts
    if (alert.severity === 'critical') {
      await this.sendCriticalAlertEmail(alert);
    }
  }

  // Send critical alert email
  private async sendCriticalAlertEmail(alert: any): Promise<void> {
    try {
      const emailCommand = new SendEmailCommand({
        Source: process.env.ALERT_EMAIL_FROM!,
        Destination: {
          ToAddresses: [process.env.ALERT_EMAIL_TO!]
        },
        Message: {
          Subject: {
            Data: `🚨 CRITICAL ALERT: ${alert.title}`,
            Charset: 'UTF-8'
          },
          Body: {
            Html: {
              Data: this.generateAlertEmailHTML(alert),
              Charset: 'UTF-8'
            }
          }
        }
      });
      
      await this.ses.send(emailCommand);
    } catch (error) {
      logger.error('Failed to send critical alert email', { error });
    }
  }

  // Generate alert email HTML
  private generateAlertEmailHTML(alert: any): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; }
            .alert-critical { background-color: #fee; border: 2px solid #f00; padding: 20px; }
            .alert-info { background-color: #eef; border: 2px solid #00f; padding: 10px; }
            .metadata { background-color: #f9f9f9; padding: 10px; margin-top: 10px; }
        </style>
    </head>
    <body>
        <div class="alert-${alert.severity}">
            <h2>🚨 ${alert.title}</h2>
            <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
            <p><strong>Tenant ID:</strong> ${alert.tenantId}</p>
            <p><strong>Time:</strong> ${alert.timestamp}</p>
            <p><strong>Message:</strong></p>
            <p>${alert.message}</p>
            
            ${alert.metadata ? `
            <div class="metadata">
                <h3>Additional Information:</h3>
                <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
            </div>
            ` : ''}
        </div>
    </body>
    </html>
    `;
  }

  // Get system health status
  public async getSystemHealth(tenantId?: string): Promise<SystemHealth> {
    try {
      const health: SystemHealth = {
        overall: 'healthy',
        services: {},
        infrastructure: {
          cpu: 0,
          memory: 0,
          disk: 0,
          network: 0
        },
        alerts: {
          active: 0,
          critical: 0,
          warning: 0
        }
      };
      
      // Check service health
      const services = ['api-gateway', 'container-service', 'auth-service', 'billing-service'];
      
      for (const service of services) {
        const serviceHealth = await this.getServiceHealth(service, tenantId);
        health.services[service] = serviceHealth;
        
        if (serviceHealth.status === 'unhealthy') {
          health.overall = 'unhealthy';
        } else if (serviceHealth.status === 'degraded' && health.overall === 'healthy') {
          health.overall = 'degraded';
        }
      }
      
      // Get infrastructure metrics
      health.infrastructure = await this.getInfrastructureMetrics(tenantId);
      
      // Get alert counts
      health.alerts = await this.getAlertCounts(tenantId);
      
      return health;
    } catch (error) {
      logger.error('Failed to get system health', { error });
      return {
        overall: 'unhealthy',
        services: {},
        infrastructure: { cpu: 0, memory: 0, disk: 0, network: 0 },
        alerts: { active: 0, critical: 0, warning: 0 }
      };
    }
  }

  // Get individual service health
  private async getServiceHealth(serviceName: string, tenantId?: string): Promise<any> {
    // This would query actual service metrics
    // For now, return mock data
    return {
      status: 'healthy',
      uptime: 99.95,
      responseTime: 125,
      errorRate: 0.1,
      lastCheck: new Date().toISOString()
    };
  }

  // Get infrastructure metrics
  private async getInfrastructureMetrics(tenantId?: string): Promise<any> {
    // This would query actual infrastructure metrics from CloudWatch
    return {
      cpu: 45.2,
      memory: 62.8,
      disk: 34.1,
      network: 12.5
    };
  }

  // Get alert counts
  private async getAlertCounts(tenantId?: string): Promise<any> {
    // This would query the alerts table
    return {
      active: 2,
      critical: 0,
      warning: 2
    };
  }

  // Initialize routes
  private initializeRoutes(): void {
    // Get system health
    this.router.get('/health', async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenant?.tenantId;
        const health = await this.getSystemHealth(tenantId);
        res.json(health);
      } catch (error) {
        logger.error('Health check endpoint failed', { error });
        res.status(500).json({ error: 'Health check failed' });
      }
    });

    // Create alert rule
    this.router.post('/alerts/rules', async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenant?.tenantId;
        if (!tenantId) {
          return res.status(400).json({ error: 'Tenant context required' });
        }
        
        const alertRule = await this.createAlertRule({
          ...req.body,
          tenantId
        });
        
        res.json(alertRule);
      } catch (error) {
        logger.error('Failed to create alert rule', { error });
        res.status(500).json({ error: 'Failed to create alert rule' });
      }
    });

    // Send custom metric
    this.router.post('/metrics', async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenant?.tenantId;
        if (!tenantId) {
          return res.status(400).json({ error: 'Tenant context required' });
        }
        
        const metric: MetricData = {
          ...req.body,
          tenantId,
          timestamp: new Date().toISOString()
        };
        
        await this.sendMetric(metric);
        res.json({ message: 'Metric sent successfully' });
      } catch (error) {
        logger.error('Failed to send metric', { error });
        res.status(500).json({ error: 'Failed to send metric' });
      }
    });

    // Get metrics
    this.router.get('/metrics/:metricName', async (req: Request, res: Response) => {
      try {
        const { metricName } = req.params;
        const tenantId = req.tenant?.tenantId;
        const { startTime, endTime } = req.query;
        
        if (!tenantId) {
          return res.status(400).json({ error: 'Tenant context required' });
        }
        
        const metrics = await this.getMetrics(tenantId, metricName, startTime as string, endTime as string);
        res.json(metrics);
      } catch (error) {
        logger.error('Failed to get metrics', { error });
        res.status(500).json({ error: 'Failed to get metrics' });
      }
    });

    // Test alert
    this.router.post('/alerts/test', async (req: Request, res: Response) => {
      try {
        const tenantId = req.tenant?.tenantId || 'test-tenant';
        
        await this.triggerAlert('info', {
          title: 'Test Alert',
          message: 'This is a test alert from the monitoring system.',
          tenantId
        });
        
        res.json({ message: 'Test alert sent' });
      } catch (error) {
        logger.error('Failed to send test alert', { error });
        res.status(500).json({ error: 'Failed to send test alert' });
      }
    });
  }

  // Get metrics from CloudWatch
  private async getMetrics(tenantId: string, metricName: string, startTime?: string, endTime?: string): Promise<any> {
    try {
      const command = new GetMetricStatisticsCommand({
        Namespace: 'APItize/Platform',
        MetricName: metricName,
        Dimensions: [{
          Name: 'TenantId',
          Value: tenantId
        }],
        StartTime: new Date(startTime || Date.now() - 24 * 60 * 60 * 1000),
        EndTime: new Date(endTime || Date.now()),
        Period: 300, // 5 minutes
        Statistics: ['Average', 'Sum', 'Maximum']
      });
      
      const result = await this.cloudwatch.send(command);
      return result.Datapoints;
    } catch (error) {
      logger.error('Failed to get CloudWatch metrics', { error });
      return [];
    }
  }

  // Cleanup method
  public cleanup(): void {
    // Stop all health checks
    this.healthChecks.forEach(interval => clearInterval(interval));
    this.healthChecks.clear();
    
    // Close Redis connection
    this.redis.disconnect();
  }

  public getRouter(): Router {
    return this.router;
  }
}

export { AdvancedMonitoringService, MetricData, AlertRule, HealthCheck, SystemHealth };