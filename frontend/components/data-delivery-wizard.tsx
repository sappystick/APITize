import React, { useState, useEffect } from 'react';
import { Button, Card, Badge, Modal, Select, Input, Checkbox } from './ui';

interface DeliveryOption {
  id: string;
  name: string;
  description: string;
  popularity: string;
  icon: string;
  features: string[];
  example: string;
}

interface DefaultMode {
  format: string;
  schedule: string;
  organization: string;
  presentation: string;
  description: string;
}

interface AITier {
  id: string;
  name: string;
  price: string;
  features: string[];
  dataEnhancement: string;
  setupType: 'automatic' | 'guided' | 'conversational';
}

export const DataDeliveryWizard: React.FC<{
  containerId: string;
  onComplete: (config: any) => void;
  onSkip: () => void;
}> = ({ containerId, onComplete, onSkip }) => {
  const [step, setStep] = useState(1);
  const [selectedAITier, setSelectedAITier] = useState<string>('basic-search');
  const [selectedMode, setSelectedMode] = useState<string | null>(null);
  const [customConfig, setCustomConfig] = useState<any>({});
  const [showAISetup, setShowAISetup] = useState(false);
  const [loading, setLoading] = useState(false);

  const aiTiers: AITier[] = [
    {
      id: 'none',
      name: 'No AI Assistant',
      price: 'Free',
      features: ['Raw data access', 'Basic organization', 'Simple search'],
      dataEnhancement: 'Organized tables and basic filtering',
      setupType: 'automatic'
    },
    {
      id: 'basic-search',
      name: 'Basic AI Search',
      price: '$9.99/month',
      features: ['Smart organization', 'Directory search AI', 'Trend analysis', 'Email reports'],
      dataEnhancement: 'Smart categorization and basic insights',
      setupType: 'guided'
    },
    {
      id: 'smart',
      name: 'Smart AI Assistant',
      price: '$29.99/month + $19/container',
      features: ['AI insights', 'Smart recommendations', 'Automated reports', 'Chat support'],
      dataEnhancement: 'AI-generated insights and explanations',
      setupType: 'conversational'
    },
    {
      id: 'expert',
      name: 'Expert AI Consultant',
      price: '$99.99/month + $99/container',
      features: ['Deep expertise', 'Predictive insights', 'Custom automation', 'Priority support'],
      dataEnhancement: 'Expert analysis with predictions and recommendations',
      setupType: 'conversational'
    },
    {
      id: 'legacy',
      name: 'Learned Legacy Specialist',
      price: '$299.99/month + $299/container',
      features: ['Collective intelligence', 'Strategic consulting', 'Proactive optimization', 'Dedicated support'],
      dataEnhancement: 'Learned insights from thousands of similar deployments',
      setupType: 'conversational'
    }
  ];

  const defaultModes: { [key: string]: DefaultMode } = {
    business: {
      format: 'pdf-report',
      schedule: 'daily',
      organization: 'by-importance',
      presentation: 'visual-charts',
      description: 'Executive summary with charts and key metrics - Most popular for business users (67% choose this)'
    },
    developer: {
      format: 'json',
      schedule: 'real-time',
      organization: 'by-api',
      presentation: 'formatted-tables',
      description: 'Structured data with technical details - Preferred by 78% of developers'
    },
    analyst: {
      format: 'excel',
      schedule: 'morning',
      organization: 'by-category',
      presentation: 'visual-charts',
      description: 'Analytical data with trends and insights - Data analyst favorite'
    },
    casual: {
      format: 'dashboard-summary',
      schedule: 'daily',
      organization: 'by-importance',
      presentation: 'narrative-summary',
      description: 'Simple summary with key highlights - Great for beginners'
    }
  };

  const deliverySchedules = [
    { id: 'real-time', name: 'Real-time', description: 'Instant notifications as data updates', icon: '⚡' },
    { id: 'morning', name: 'Morning Digest', description: 'Daily summary at 8 AM', icon: '🌅', popular: true },
    { id: 'afternoon', name: 'Afternoon Update', description: 'Progress update at 2 PM', icon: '☀️' },
    { id: 'evening', name: 'Evening Wrap-up', description: 'End of day summary at 6 PM', icon: '🌆' },
    { id: 'daily', name: 'Daily Report', description: 'Comprehensive daily report at 7 AM', icon: '📅' },
    { id: 'weekly', name: 'Weekly Summary', description: 'Monday morning weekly digest', icon: '📊' },
    { id: 'monthly', name: 'Monthly Review', description: 'First of month executive summary', icon: '📈' }
  ];

  const dataFormats = [
    { id: 'dashboard-summary', name: 'Dashboard Summary', description: 'Visual cards and charts', icon: '📊', popular: true },
    { id: 'email', name: 'Email Report', description: 'Formatted email with insights', icon: '📧' },
    { id: 'pdf-report', name: 'PDF Report', description: 'Professional document', icon: '📄' },
    { id: 'json', name: 'JSON Data', description: 'Structured data format', icon: '{ }' },
    { id: 'excel', name: 'Excel Spreadsheet', description: 'Analytical spreadsheet', icon: '📋' },
    { id: 'ai-insights', name: 'AI Conversation', description: 'Chat-based explanations', icon: '🤖', aiOnly: true }
  ];

  const handleAITierSelect = (tier: string) => {
    setSelectedAITier(tier);
    
    if (tier === 'none' || tier === 'basic-search') {
      // Auto-setup for basic tiers
      setStep(2);
    } else {
      // Conversational setup for AI tiers
      setShowAISetup(true);
    }
  };

  const handleModeSelect = async (mode: string) => {
    setSelectedMode(mode);
    setLoading(true);
    
    try {
      // Apply default mode configuration
      const config = {
        containerId,
        aiTier: selectedAITier,
        mode,
        ...defaultModes[mode]
      };
      
      const response = await fetch('/api/data-delivery/apply-default-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      const result = await response.json();
      onComplete(result);
    } catch (error) {
      console.error('Error applying default mode:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomConfiguration = () => {
    setStep(3);
  };

  const completeCustomSetup = async () => {
    setLoading(true);
    
    try {
      const config = {
        containerId,
        aiTier: selectedAITier,
        custom: true,
        ...customConfig
      };
      
      const response = await fetch('/api/data-delivery/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      const result = await response.json();
      onComplete(result);
    } catch (error) {
      console.error('Error setting up custom configuration:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-delivery-wizard max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="wizard-header text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">📦 Data Delivery Setup</h1>
        <p className="text-gray-600">Configure how you want to receive and interact with your API data</p>
        
        {/* Progress Steps */}
        <div className="flex justify-center mt-6">
          <div className="flex items-center space-x-4">
            <div className={`step ${step >= 1 ? 'active' : ''}`}>
              <span className="step-number">1</span>
              <span className="step-label">AI Assistant</span>
            </div>
            <div className="step-connector"></div>
            <div className={`step ${step >= 2 ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Data Format</span>
            </div>
            <div className="step-connector"></div>
            <div className={`step ${step >= 3 ? 'active' : ''}`}>
              <span className="step-number">3</span>
              <span className="step-label">Customize</span>
            </div>
          </div>
        </div>
      </div>

      {/* Step 1: AI Tier Selection */}
      {step === 1 && (
        <div className="step-content">
          <h2 className="text-2xl font-semibold mb-6 text-center">Choose Your AI Assistant Level</h2>
          
          <div className="ai-tiers-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {aiTiers.map(tier => (
              <Card 
                key={tier.id}
                className={`ai-tier-card cursor-pointer transition-all hover:shadow-lg ${
                  selectedAITier === tier.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleAITierSelect(tier.id)}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg">{tier.name}</h3>
                    <Badge color={tier.id === 'none' ? 'gray' : tier.id === 'legacy' ? 'purple' : 'blue'}>
                      {tier.price}
                    </Badge>
                  </div>
                  
                  <p className="text-gray-600 mb-4">{tier.dataEnhancement}</p>
                  
                  <div className="features-list mb-4">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm space-y-1">
                      {tier.features.map((feature, idx) => (
                        <li key={idx} className="flex items-center">
                          <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <div className="setup-type text-sm text-gray-500">
                    Setup: {tier.setupType === 'automatic' ? '⚡ Automatic' : 
                            tier.setupType === 'guided' ? '🎯 Guided' : '💬 Conversational AI'}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Button variant="outline" onClick={onSkip}>
              Skip Setup (Use Basic)
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Default Mode Selection */}
      {step === 2 && (
        <div className="step-content">
          <h2 className="text-2xl font-semibold mb-6 text-center">Choose Your Data Delivery Style</h2>
          <p className="text-center text-gray-600 mb-8">
            Select a popular configuration or customize your own
          </p>

          {/* Popular Default Modes */}
          <div className="default-modes-grid grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {Object.entries(defaultModes).map(([key, mode]) => (
              <Card 
                key={key}
                className="mode-card cursor-pointer transition-all hover:shadow-lg"
                onClick={() => handleModeSelect(key)}
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg capitalize">
                      {key === 'business' ? '👔 Business Executive' :
                       key === 'developer' ? '👨‍💻 Software Developer' :
                       key === 'analyst' ? '📊 Data Analyst' : '🎯 Casual User'}
                    </h3>
                    {key === 'business' && <Badge color="green">Most Popular</Badge>}
                  </div>
                  
                  <p className="text-gray-600 text-sm mb-4">{mode.description}</p>
                  
                  <div className="mode-details space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Format:</span>
                      <span className="text-sm font-medium">{mode.format}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Schedule:</span>
                      <span className="text-sm font-medium">{mode.schedule}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Organization:</span>
                      <span className="text-sm font-medium">{mode.organization}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Custom Configuration Option */}
          <div className="text-center">
            <Button 
              variant="outline" 
              onClick={handleCustomConfiguration}
              className="mb-4"
            >
              🎛️ Custom Configuration
            </Button>
            <p className="text-sm text-gray-500">
              Want more control? Set up custom schedules, formats, and organization
            </p>
          </div>
        </div>
      )}

      {/* Step 3: Custom Configuration */}
      {step === 3 && (
        <div className="step-content">
          <h2 className="text-2xl font-semibold mb-6 text-center">Custom Configuration</h2>
          
          <div className="custom-config-form space-y-8">
            {/* Schedule Selection */}
            <div className="config-section">
              <h3 className="text-lg font-medium mb-4">📅 Delivery Schedule</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {deliverySchedules.map(schedule => (
                  <div 
                    key={schedule.id}
                    className={`schedule-option p-3 border rounded-lg cursor-pointer transition-all ${
                      customConfig.schedule === schedule.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                    }`}
                    onClick={() => setCustomConfig({...customConfig, schedule: schedule.id})}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">{schedule.icon}</div>
                      <div className="font-medium text-sm">{schedule.name}</div>
                      <div className="text-xs text-gray-500">{schedule.description}</div>
                      {schedule.popular && <Badge color="green" className="mt-1">Popular</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Format Selection */}
            <div className="config-section">
              <h3 className="text-lg font-medium mb-4">📋 Data Format</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {dataFormats.filter(format => !format.aiOnly || selectedAITier !== 'none').map(format => (
                  <div 
                    key={format.id}
                    className={`format-option p-3 border rounded-lg cursor-pointer transition-all ${
                      customConfig.format === format.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'
                    }`}
                    onClick={() => setCustomConfig({...customConfig, format: format.id})}
                  >
                    <div className="text-center">
                      <div className="text-2xl mb-1">{format.icon}</div>
                      <div className="font-medium text-sm">{format.name}</div>
                      <div className="text-xs text-gray-500">{format.description}</div>
                      {format.popular && <Badge color="green" className="mt-1">Popular</Badge>}
                      {format.aiOnly && <Badge color="purple" className="mt-1">AI Enhanced</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Smart Features */}
            <div className="config-section">
              <h3 className="text-lg font-medium mb-4">🧠 Smart Features</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Checkbox
                  checked={customConfig.autoInsights || false}
                  onChange={(checked) => setCustomConfig({...customConfig, autoInsights: checked})}
                  label="Auto Insights"
                  description="Automatically highlight important patterns"
                />
                <Checkbox
                  checked={customConfig.trendAnalysis || false}
                  onChange={(checked) => setCustomConfig({...customConfig, trendAnalysis: checked})}
                  label="Trend Analysis"
                  description="Track performance trends over time"
                />
                <Checkbox
                  checked={customConfig.recommendations || false}
                  onChange={(checked) => setCustomConfig({...customConfig, recommendations: checked})}
                  label="Recommendations"
                  description="Get optimization suggestions"
                  disabled={selectedAITier === 'none'}
                />
                <Checkbox
                  checked={customConfig.costOptimization || false}
                  onChange={(checked) => setCustomConfig({...customConfig, costOptimization: checked})}
                  label="Cost Optimization"
                  description="Monitor and optimize API costs"
                />
              </div>
            </div>

            {/* Delivery Method */}
            <div className="config-section">
              <h3 className="text-lg font-medium mb-4">📬 Delivery Method</h3>
              <div className="space-y-3">
                <Select
                  value={customConfig.deliveryMethod || 'email'}
                  onChange={(value) => setCustomConfig({...customConfig, deliveryMethod: value})}
                  options={[
                    { value: 'email', label: '📧 Email' },
                    { value: 'dashboard', label: '📊 Dashboard' },
                    { value: 'webhook', label: '🔗 Webhook' },
                    { value: 'mobile-push', label: '📱 Mobile Push' },
                    ...(selectedAITier !== 'none' ? [{ value: 'ai-chat', label: '🤖 AI Chat' }] : [])
                  ]}
                />
                
                {(customConfig.deliveryMethod === 'email' || customConfig.deliveryMethod === 'webhook') && (
                  <Input
                    placeholder={customConfig.deliveryMethod === 'email' ? 'your@email.com' : 'https://your-webhook-url.com'}
                    value={customConfig.endpoint || ''}
                    onChange={(e) => setCustomConfig({...customConfig, endpoint: e.target.value})}
                  />
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-between pt-6">
              <Button variant="outline" onClick={() => setStep(2)}>
                ← Back to Defaults
              </Button>
              <Button 
                onClick={completeCustomSetup}
                disabled={loading || !customConfig.schedule || !customConfig.format}
              >
                {loading ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* AI Setup Modal */}
      <Modal 
        isOpen={showAISetup} 
        onClose={() => setShowAISetup(false)}
        title="AI Assistant Setup"
        size="lg"
      >
        <AIConversationalSetup 
          aiTier={selectedAITier}
          containerId={containerId}
          onComplete={(config) => {
            setShowAISetup(false);
            onComplete(config);
          }}
        />
      </Modal>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Setting up your data delivery...</p>
          </div>
        </div>
      )}
    </div>
  );
};

// AI Conversational Setup Component
const AIConversationalSetup: React.FC<{
  aiTier: string;
  containerId: string;
  onComplete: (config: any) => void;
}> = ({ aiTier, containerId, onComplete }) => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [responses, setResponses] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);

  const questions = {
    smart: [
      {
        question: "Hi! I'm your Smart AI Assistant. What type of work do you do?",
        options: ["Business Executive", "Software Developer", "Data Analyst", "Project Manager", "Researcher", "Other"],
        followUp: "Perfect! This helps me understand how to present your data most effectively."
      },
      {
        question: "When do you prefer to receive important information?",
        options: ["First thing morning", "During afternoon break", "End of day summary", "Real-time alerts", "Weekly digest"],
        followUp: "Great choice! I'll schedule deliveries when you're most likely to act on the information."
      },
      {
        question: "How do you like to consume data?",
        options: ["Quick visual charts", "Detailed tables", "Narrative summaries", "Interactive conversation", "Executive reports"],
        followUp: "Excellent! This format will make the data most actionable for you."
      }
    ],
    expert: [
      {
        question: "Welcome! I'm your Expert AI Consultant. What are your primary business objectives with this API data?",
        options: ["Cost optimization", "Performance improvement", "Strategic planning", "Risk management", "Market analysis"],
        followUp: "Excellent! I'll focus my analysis on delivering insights that directly support these objectives."
      },
      {
        question: "How do you prefer to consume analytical insights?",
        options: ["Executive dashboards", "Detailed reports", "Predictive models", "Comparative analysis", "Strategic narratives"],
        followUp: "Perfect! I'll structure all insights in this format for maximum impact."
      },
      {
        question: "What decision-making timeline do you typically work with?",
        options: ["Immediate tactical", "Weekly planning", "Monthly reviews", "Quarterly strategy", "Annual planning"],
        followUp: "This helps me prioritize insights by urgency and strategic importance."
      }
    ],
    legacy: [
      {
        question: "Greetings! I'm your Learned Legacy Specialist with knowledge from thousands of deployments. What industry best practices should I leverage for your organization?",
        options: ["Fortune 500 standards", "Startup agility", "Government compliance", "Healthcare regulations", "Financial services"],
        followUp: "Excellent! I'll apply proven patterns from similar successful organizations in your sector."
      },
      {
        question: "How can I best align this data delivery with your strategic initiatives?",
        options: ["Digital transformation", "Operational efficiency", "Customer experience", "Innovation pipeline", "Risk reduction"],
        followUp: "Perfect! I'll connect all data insights to these strategic outcomes."
      },
      {
        question: "Based on my experience with similar implementations, how should I prioritize recommendations?",
        options: ["Immediate ROI", "Long-term value", "Risk mitigation", "Competitive advantage", "Innovation potential"],
        followUp: "Excellent strategic thinking! I'll weight all recommendations using this priority framework."
      }
    ]
  };

  const currentQuestions = questions[aiTier as keyof typeof questions] || questions.smart;

  const handleResponse = (response: string) => {
    const newResponses = [...responses, response];
    setResponses(newResponses);
    setIsThinking(true);
    
    setTimeout(() => {
      setIsThinking(false);
      if (currentQuestion < currentQuestions.length - 1) {
        setCurrentQuestion(currentQuestion + 1);
      } else {
        completeSetup(newResponses);
      }
    }, 2000);
  };

  const completeSetup = async (allResponses: string[]) => {
    try {
      const response = await fetch('/api/data-delivery/ai-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerId,
          aiTier,
          responses: allResponses
        })
      });
      
      const config = await response.json();
      onComplete(config);
    } catch (error) {
      console.error('Error completing AI setup:', error);
    }
  };

  const question = currentQuestions[currentQuestion];

  return (
    <div className="ai-setup-conversation p-6">
      <div className="conversation-flow">
        {/* Previous Questions */}
        {responses.map((response, idx) => (
          <div key={idx} className="conversation-item mb-6">
            <div className="ai-message mb-2">
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-blue-800">{currentQuestions[idx].question}</p>
              </div>
            </div>
            <div className="user-response mb-2">
              <div className="bg-gray-100 p-3 rounded-lg ml-8">
                <p className="text-gray-800">{response}</p>
              </div>
            </div>
            <div className="ai-followup">
              <div className="bg-green-50 p-2 rounded text-sm text-green-800 ml-4">
                {currentQuestions[idx].followUp}
              </div>
            </div>
          </div>
        ))}
        
        {/* Current Question */}
        <div className="current-question">
          <div className="ai-message mb-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center mb-2">
                <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white mr-3">
                  🤖
                </div>
                <span className="font-medium text-blue-800">
                  {aiTier === 'smart' ? 'Smart Assistant' : 
                   aiTier === 'expert' ? 'Expert Consultant' : 'Legacy Specialist'}
                </span>
              </div>
              <p className="text-blue-800">{question.question}</p>
            </div>
          </div>
          
          {/* Response Options */}
          {!isThinking && (
            <div className="response-options space-y-2">
              {question.options.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => handleResponse(option)}
                  className="w-full text-left p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          
          {/* Thinking Indicator */}
          {isThinking && (
            <div className="thinking-indicator flex items-center justify-center py-8">
              <div className="flex items-center space-x-2">
                <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                <span className="text-blue-600">AI is thinking about your response...</span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="progress-indicator mt-6">
        <div className="flex justify-between text-sm text-gray-500">
          <span>Question {currentQuestion + 1} of {currentQuestions.length}</span>
          <span>{Math.round(((currentQuestion + 1) / currentQuestions.length) * 100)}% complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
          <div 
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentQuestion + 1) / currentQuestions.length) * 100}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};

export default DataDeliveryWizard;