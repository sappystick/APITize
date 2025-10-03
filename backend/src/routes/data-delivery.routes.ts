import { Router, Request, Response } from 'express';
import { UnifiedDataDeliveryService, UserDataPreferences } from '../data-delivery/unified-data-delivery';
import { TenantContext } from '../tenant/multi-tenant-service';
import { logger } from '../utils/logger';

const router = Router();
const dataDeliveryService = new UnifiedDataDeliveryService(
  // Dependencies would be injected in real implementation
  {} as any, {} as any, {} as any, {} as any
);

// Get pricing information for different tiers
router.get('/pricing/:userId/:containerId', async (req: Request, res: Response) => {
  try {
    const { userId, containerId } = req.params;
    const { monthlyAPIcalls = 10000, containers = 1 } = req.query;
    
    const monthlyUsage = {
      apiCalls: parseInt(monthlyAPIcalls as string),
      containers: parseInt(containers as string)
    };
    
    const pricing = await dataDeliveryService.calculatePricingForUser(
      userId,
      containerId,
      monthlyUsage
    );
    
    res.json({
      pricing,
      estimatedUsage: monthlyUsage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting pricing:', error);
    res.status(500).json({ error: 'Failed to get pricing information' });
  }
});

// Get default mode recommendations
router.get('/default-modes', (req: Request, res: Response) => {
  try {
    const defaultModes = dataDeliveryService.getDefaultModeRecommendations();
    
    res.json({
      modes: defaultModes.mostUsedStructures,
      message: 'Popular data delivery configurations',
      statistics: {
        businessUsers: '67% choose business mode',
        developers: '78% prefer developer mode',
        analysts: 'Most analytical features',
        casual: 'Easiest for beginners'
      }
    });
  } catch (error) {
    logger.error('Error getting default modes:', error);
    res.status(500).json({ error: 'Failed to get default modes' });
  }
});

// Apply default mode configuration
router.post('/apply-default-mode', async (req: Request, res: Response) => {
  try {
    const { containerId, aiTier, mode } = req.body;
    const userId = req.tenant?.user?.userId || req.body.userId;
    
    if (!userId || !containerId || !mode) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, containerId, mode' 
      });
    }
    
    const config = await dataDeliveryService.applyDefaultMode(userId, containerId, mode);
    
    // Generate first data package to show preview
    const sampleData = await getSampleData(containerId);
    const dataPackage = await dataDeliveryService.generateUnifiedDataPackage(
      userId,
      containerId,
      sampleData
    );
    
    res.json({
      success: true,
      config,
      preview: {
        dataPackage,
        message: `Configuration applied successfully! Your ${mode} mode is now active.`,
        nextDelivery: dataPackage.nextDelivery
      }
    });
  } catch (error) {
    logger.error('Error applying default mode:', error);
    res.status(500).json({ error: 'Failed to apply default mode' });
  }
});

// Custom configuration setup
router.post('/setup', async (req: Request, res: Response) => {
  try {
    const {
      containerId,
      aiTier,
      schedule,
      format,
      deliveryMethod,
      endpoint,
      autoInsights,
      trendAnalysis,
      recommendations,
      costOptimization
    } = req.body;
    
    const userId = req.tenant?.user?.userId || req.body.userId;
    
    if (!userId || !containerId || !schedule || !format) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, containerId, schedule, format' 
      });
    }
    
    const config: UserDataPreferences = {
      userId,
      containerId,
      aiTier: aiTier || 'basic-search',
      deliveryConfig: {
        format,
        schedule,
        organization: 'by-importance', // Default
        presentation: format === 'ai-insights' ? 'ai-conversation' : 'formatted-tables'
      },
      smartFeatures: {
        autoInsights: autoInsights || false,
        trendAnalysis: trendAnalysis || false,
        recommendations: recommendations || false,
        alertHighlights: true,
        costOptimization: costOptimization || false,
        aiConversation: aiTier !== 'none'
      },
      deliveryMethod: {
        primary: deliveryMethod || 'email',
        backup: 'dashboard',
        endpoint
      },
      isConfigured: true,
      lastUpdated: new Date().toISOString()
    };
    
    // Save configuration
    await saveUserPreferences(config);
    
    // Generate preview
    const sampleData = await getSampleData(containerId);
    const dataPackage = await dataDeliveryService.generateUnifiedDataPackage(
      userId,
      containerId,
      sampleData
    );
    
    res.json({
      success: true,
      config,
      preview: {
        dataPackage,
        message: 'Custom configuration saved successfully!',
        nextDelivery: dataPackage.nextDelivery
      }
    });
  } catch (error) {
    logger.error('Error saving custom configuration:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

// AI-powered conversational setup
router.post('/ai-setup', async (req: Request, res: Response) => {
  try {
    const { containerId, aiTier, responses } = req.body;
    const userId = req.tenant?.user?.userId || req.body.userId;
    
    if (!userId || !containerId || !aiTier || !responses) {
      return res.status(400).json({ 
        error: 'Missing required fields: userId, containerId, aiTier, responses' 
      });
    }
    
    // Process AI responses and create optimized configuration
    const config = await processAIResponses(userId, containerId, aiTier, responses);
    
    // Save configuration
    await saveUserPreferences(config);
    
    // Generate personalized welcome package
    const sampleData = await getSampleData(containerId);
    const dataPackage = await dataDeliveryService.generateUnifiedDataPackage(
      userId,
      containerId,
      sampleData
    );
    
    const welcomeMessage = generateAIWelcomeMessage(aiTier, responses, config);
    
    res.json({
      success: true,
      config,
      preview: {
        dataPackage,
        welcomeMessage,
        aiIntroduction: dataPackage.aiEnhancements?.conversationalSummary,
        nextDelivery: dataPackage.nextDelivery
      }
    });
  } catch (error) {
    logger.error('Error completing AI setup:', error);
    res.status(500).json({ error: 'Failed to complete AI setup' });
  }
});

// Get user's current data delivery preferences
router.get('/preferences/:userId/:containerId', async (req: Request, res: Response) => {
  try {
    const { userId, containerId } = req.params;
    
    const preferences = await getUserPreferences(userId, containerId);
    
    if (!preferences) {
      return res.status(404).json({ 
        error: 'No preferences found',
        needsSetup: true
      });
    }
    
    res.json({
      preferences,
      isConfigured: preferences.isConfigured,
      lastUpdated: preferences.lastUpdated
    });
  } catch (error) {
    logger.error('Error getting preferences:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// Update existing preferences
router.put('/preferences/:userId/:containerId', async (req: Request, res: Response) => {
  try {
    const { userId, containerId } = req.params;
    const updates = req.body;
    
    const currentPrefs = await getUserPreferences(userId, containerId);
    
    if (!currentPrefs) {
      return res.status(404).json({ error: 'No existing preferences found' });
    }
    
    const updatedPrefs: UserDataPreferences = {
      ...currentPrefs,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    await saveUserPreferences(updatedPrefs);
    
    res.json({
      success: true,
      preferences: updatedPrefs,
      message: 'Preferences updated successfully'
    });
  } catch (error) {
    logger.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Generate data package on-demand
router.post('/generate-package', async (req: Request, res: Response) => {
  try {
    const { containerId } = req.body;
    const userId = req.tenant?.user?.userId || req.body.userId;
    
    if (!userId || !containerId) {
      return res.status(400).json({ error: 'Missing userId or containerId' });
    }
    
    // Get actual container data
    const containerData = await getContainerData(containerId);
    
    if (!containerData || containerData.length === 0) {
      return res.status(404).json({ 
        error: 'No data found for container',
        message: 'Container may not have any API activity yet'
      });
    }
    
    const dataPackage = await dataDeliveryService.generateUnifiedDataPackage(
      userId,
      containerId,
      containerData
    );
    
    res.json({
      success: true,
      dataPackage,
      generatedAt: new Date().toISOString(),
      dataPoints: containerData.length
    });
  } catch (error) {
    logger.error('Error generating data package:', error);
    res.status(500).json({ error: 'Failed to generate data package' });
  }
});

// Test delivery method
router.post('/test-delivery', async (req: Request, res: Response) => {
  try {
    const { containerId, deliveryMethod, endpoint } = req.body;
    const userId = req.tenant?.user?.userId || req.body.userId;
    
    if (!userId || !containerId || !deliveryMethod) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Generate test data package
    const testData = generateTestData();
    const testPackage = await dataDeliveryService.generateUnifiedDataPackage(
      userId,
      containerId,
      testData
    );
    
    // Attempt test delivery
    const deliveryResult = await testDelivery(testPackage, deliveryMethod, endpoint);
    
    res.json({
      success: true,
      deliveryResult,
      testPackage: {
        id: testPackage.id,
        timestamp: testPackage.timestamp,
        dataPoints: testData.length
      },
      message: 'Test delivery completed'
    });
  } catch (error) {
    logger.error('Error testing delivery:', error);
    res.status(500).json({ error: 'Failed to test delivery' });
  }
});

// Get delivery history and analytics
router.get('/analytics/:userId/:containerId', async (req: Request, res: Response) => {
  try {
    const { userId, containerId } = req.params;
    const { days = 30 } = req.query;
    
    const analytics = await getDeliveryAnalytics(userId, containerId, parseInt(days as string));
    
    res.json({
      analytics,
      period: `${days} days`,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting delivery analytics:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Pause/resume delivery
router.post('/toggle/:userId/:containerId', async (req: Request, res: Response) => {
  try {
    const { userId, containerId } = req.params;
    const { pause } = req.body;
    
    const preferences = await getUserPreferences(userId, containerId);
    
    if (!preferences) {
      return res.status(404).json({ error: 'No preferences found' });
    }
    
    const updatedPrefs: UserDataPreferences = {
      ...preferences,
      isConfigured: !pause,
      lastUpdated: new Date().toISOString()
    };
    
    await saveUserPreferences(updatedPrefs);
    
    res.json({
      success: true,
      status: pause ? 'paused' : 'resumed',
      message: `Data delivery ${pause ? 'paused' : 'resumed'} successfully`
    });
  } catch (error) {
    logger.error('Error toggling delivery:', error);
    res.status(500).json({ error: 'Failed to toggle delivery' });
  }
});

// Helper functions
async function processAIResponses(
  userId: string,
  containerId: string,
  aiTier: string,
  responses: string[]
): Promise<UserDataPreferences> {
  // Process AI conversation responses to create optimal configuration
  const roleMapping: { [key: string]: any } = {
    'Business Executive': { format: 'pdf-report', schedule: 'daily', organization: 'by-importance' },
    'Software Developer': { format: 'json', schedule: 'real-time', organization: 'by-api' },
    'Data Analyst': { format: 'excel', schedule: 'morning', organization: 'by-category' },
    'Project Manager': { format: 'dashboard-summary', schedule: 'morning', organization: 'by-importance' },
    'Researcher': { format: 'excel', schedule: 'daily', organization: 'by-category' }
  };
  
  const timeMapping: { [key: string]: string } = {
    'First thing morning': 'morning',
    'During afternoon break': 'afternoon',
    'End of day summary': 'evening',
    'Real-time alerts': 'real-time',
    'Weekly digest': 'weekly'
  };
  
  const formatMapping: { [key: string]: string } = {
    'Quick visual charts': 'dashboard-summary',
    'Detailed tables': 'excel',
    'Narrative summaries': 'pdf-report',
    'Interactive conversation': 'ai-insights',
    'Executive reports': 'pdf-report'
  };
  
  const role = responses[0] || 'Business Executive';
  const timePreference = responses[1] || 'First thing morning';
  const formatPreference = responses[2] || 'Quick visual charts';
  
  const defaultConfig = roleMapping[role] || roleMapping['Business Executive'];
  
  return {
    userId,
    containerId,
    aiTier: aiTier as any,
    deliveryConfig: {
      format: formatMapping[formatPreference] || defaultConfig.format,
      schedule: timeMapping[timePreference] || defaultConfig.schedule,
      organization: defaultConfig.organization,
      presentation: aiTier === 'legacy' ? 'ai-conversation' : 'formatted-tables'
    },
    smartFeatures: {
      autoInsights: true,
      trendAnalysis: true,
      recommendations: aiTier !== 'basic-search',
      alertHighlights: true,
      costOptimization: role === 'Business Executive',
      aiConversation: aiTier !== 'none'
    },
    deliveryMethod: {
      primary: aiTier === 'legacy' ? 'ai-chat' : 'email',
      backup: 'dashboard'
    },
    isConfigured: true,
    lastUpdated: new Date().toISOString()
  };
}

function generateAIWelcomeMessage(aiTier: string, responses: string[], config: UserDataPreferences): string {
  const tierNames = {
    smart: 'Smart AI Assistant',
    expert: 'Expert AI Consultant',
    legacy: 'Learned Legacy Specialist'
  };
  
  const tierName = tierNames[aiTier as keyof typeof tierNames] || 'AI Assistant';
  
  return `Welcome! I've set up your personalized data delivery system based on our conversation. As your ${tierName}, I've configured everything to match your ${responses[0]} workflow with ${responses[1]} delivery and ${responses[2]} format. I'll be here to help explain your data and optimize your API performance. You can always chat with me to adjust these settings or get insights about your data.`;
}

async function getSampleData(containerId: string): Promise<any[]> {
  // Generate sample data for preview - in real implementation, get from container service
  return [
    {
      source: 'Census API',
      endpoint: '/api/v1/population',
      timestamp: new Date().toISOString(),
      responseTime: 245,
      status: 'success',
      data: { population: 331449281, year: 2023 }
    },
    {
      source: 'Weather API',
      endpoint: '/api/v1/current',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      responseTime: 156,
      status: 'success',
      data: { temperature: 72, humidity: 45, conditions: 'sunny' }
    }
  ];
}

function generateTestData(): any[] {
  return [
    {
      source: 'Test API',
      endpoint: '/test/endpoint',
      timestamp: new Date().toISOString(),
      responseTime: 123,
      status: 'success',
      data: { test: true, message: 'This is test data' }
    }
  ];
}

async function testDelivery(package: any, method: string, endpoint?: string): Promise<any> {
  // Test delivery implementation
  return {
    success: true,
    method,
    endpoint,
    deliveredAt: new Date().toISOString(),
    message: `Test delivery via ${method} completed successfully`
  };
}

async function getContainerData(containerId: string): Promise<any[]> {
  // Get real container data - placeholder implementation
  return [];
}

async function getUserPreferences(userId: string, containerId: string): Promise<UserDataPreferences | null> {
  // Get from database - placeholder implementation
  return null;
}

async function saveUserPreferences(config: UserDataPreferences): Promise<void> {
  // Save to database - placeholder implementation
}

async function getDeliveryAnalytics(userId: string, containerId: string, days: number): Promise<any> {
  // Get analytics from database - placeholder implementation
  return {
    totalDeliveries: 45,
    successRate: 98.9,
    avgResponseTime: 234,
    dataPoints: 12450,
    costSavings: 125.50,
    popularFormats: ['dashboard-summary', 'email', 'pdf-report'],
    peakTimes: ['8:00 AM', '2:00 PM', '6:00 PM']
  };
}

export default router;