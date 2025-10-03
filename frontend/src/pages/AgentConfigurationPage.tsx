import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  CogIcon,
  ChartBarIcon,
  ClockIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  SparklesIcon,
  BeakerIcon,
  BoltIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

interface AgentConfig {
  id: string;
  name: string;
  type: 'queen' | 'worker' | 'specialist';
  status: 'active' | 'training' | 'idle' | 'error';
  lastTrained: string;
  trainingCycles: number;
  successRate: number;
  errorCorrection: number;
  optimization: number;
  specialization: string[];
  collaborationScore: number;
  learningEnabled: boolean;
  autoOptimize: boolean;
  maxTrainingCycles: number;
  retrainingFrequency: 'hourly' | 'daily' | 'weekly';
  performanceMetrics: {
    avgResponseTime: number;
    uptime: number;
    tasksCompleted: number;
    knowledgeShares: number;
  };
}

const AgentConfigurationPage: React.FC = () => {
  const [agents, setAgents] = useState<AgentConfig[]>([
    {
      id: 'queen-coordinator',
      name: 'Queen Coordinator',
      type: 'queen',
      status: 'active',
      lastTrained: '2024-12-23T10:30:00Z',
      trainingCycles: 1247,
      successRate: 98.7,
      errorCorrection: 95.2,
      optimization: 92.4,
      specialization: ['orchestration', 'resource-allocation', 'task-distribution'],
      collaborationScore: 99.1,
      learningEnabled: true,
      autoOptimize: true,
      maxTrainingCycles: 5000,
      retrainingFrequency: 'daily',
      performanceMetrics: {
        avgResponseTime: 45,
        uptime: 99.8,
        tasksCompleted: 15847,
        knowledgeShares: 342
      }
    },
    {
      id: 'data-analyst-agent',
      name: 'Data Analysis Specialist',
      type: 'specialist',
      status: 'training',
      lastTrained: '2024-12-23T09:15:00Z',
      trainingCycles: 892,
      successRate: 94.3,
      errorCorrection: 89.1,
      optimization: 87.8,
      specialization: ['data-processing', 'pattern-recognition', 'statistical-analysis'],
      collaborationScore: 91.5,
      learningEnabled: true,
      autoOptimize: true,
      maxTrainingCycles: 3000,
      retrainingFrequency: 'daily',
      performanceMetrics: {
        avgResponseTime: 120,
        uptime: 98.9,
        tasksCompleted: 8934,
        knowledgeShares: 198
      }
    },
    {
      id: 'api-integrator',
      name: 'API Integration Worker',
      type: 'worker',
      status: 'active',
      lastTrained: '2024-12-23T08:45:00Z',
      trainingCycles: 567,
      successRate: 96.8,
      errorCorrection: 93.4,
      optimization: 90.2,
      specialization: ['api-calls', 'data-transformation', 'error-handling'],
      collaborationScore: 88.9,
      learningEnabled: true,
      autoOptimize: false,
      maxTrainingCycles: 2000,
      retrainingFrequency: 'daily',
      performanceMetrics: {
        avgResponseTime: 85,
        uptime: 99.2,
        tasksCompleted: 12456,
        knowledgeShares: 156
      }
    }
  ]);

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [showSwarmView, setShowSwarmView] = useState(false);

  const handleAgentUpdate = (agentId: string, updates: Partial<AgentConfig>) => {
    setAgents(prev => prev.map(agent =>
      agent.id === agentId ? { ...agent, ...updates } : agent
    ));
  };

  const handleRetrain = (agentId: string) => {
    handleAgentUpdate(agentId, {
      status: 'training',
      lastTrained: new Date().toISOString()
    });
    
    // Simulate training process
    setTimeout(() => {
      handleAgentUpdate(agentId, {
        status: 'active',
        trainingCycles: agents.find(a => a.id === agentId)!.trainingCycles + 1,
        successRate: Math.min(99.9, agents.find(a => a.id === agentId)!.successRate + Math.random() * 2)
      });
    }, 3000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600 bg-green-100';
      case 'training': return 'text-blue-600 bg-blue-100';
      case 'idle': return 'text-gray-600 bg-gray-100';
      case 'error': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'queen': return <SparklesIcon className="h-5 w-5 text-purple-600" />;
      case 'specialist': return <CpuChipIcon className="h-5 w-5 text-blue-600" />;
      case 'worker': return <CogIcon className="h-5 w-5 text-green-600" />;
      default: return <CogIcon className="h-5 w-5" />;
    }
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 95) return 'text-green-600';
    if (score >= 85) return 'text-blue-600';
    if (score >= 75) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                AI Agent Configuration
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Configure and monitor your AI agent swarm with automated learning and optimization
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowSwarmView(!showSwarmView)}
                className={`btn-outline ${showSwarmView ? 'bg-primary-100 border-primary-600' : ''}`}
              >
                {showSwarmView ? 'Individual View' : 'Swarm View'}
              </button>
              <button className="btn-primary">
                Deploy New Agent
              </button>
            </div>
          </div>

          {/* Swarm Stats */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-600">
                {agents.filter(a => a.status === 'active').length}
              </div>
              <div className="text-sm text-gray-600">Active Agents</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {Math.round(agents.reduce((sum, a) => sum + a.successRate, 0) / agents.length)}%
              </div>
              <div className="text-sm text-gray-600">Avg Success Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {agents.reduce((sum, a) => sum + a.trainingCycles, 0).toLocaleString()}
              </div>
              <div className="text-sm text-gray-600">Total Training Cycles</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {Math.round(agents.reduce((sum, a) => sum + a.collaborationScore, 0) / agents.length)}%
              </div>
              <div className="text-sm text-gray-600">Collaboration Score</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {showSwarmView ? (
          /* Swarm Intelligence View */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="card">
                <div className="card-header">
                  <h3 className="text-lg font-semibold flex items-center">
                    <SparklesIcon className="h-5 w-5 mr-2 text-purple-600" />
                    Swarm Communication Network
                  </h3>
                </div>
                <div className="card-body">
                  <div className="relative h-96 bg-gradient-to-br from-gray-900 to-purple-900 rounded-lg overflow-hidden">
                    {/* Network visualization background */}
                    <div className="absolute inset-0 opacity-20">
                      <svg className="w-full h-full">
                        <defs>
                          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5"/>
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />
                      </svg>
                    </div>
                    
                    {/* Agent nodes with connections */}
                    <div className="relative h-full">
                      {agents.map((agent, index) => {
                        const positions = [
                          { x: '50%', y: '20%' }, // Queen at top center
                          { x: '25%', y: '60%' }, // Specialist left
                          { x: '75%', y: '60%' }  // Worker right
                        ];
                        const position = positions[index] || { x: '50%', y: '80%' };
                        
                        return (
                          <div
                            key={agent.id}
                            className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
                              agent.type === 'queen'
                                ? 'w-16 h-16'
                                : 'w-12 h-12'
                            }`}
                            style={{ left: position.x, top: position.y }}
                          >
                            <div className={`w-full h-full rounded-full border-4 flex items-center justify-center ${
                              agent.type === 'queen'
                                ? 'bg-purple-600 border-purple-400 animate-pulse'
                                : agent.type === 'specialist'
                                ? 'bg-blue-600 border-blue-400'
                                : 'bg-green-600 border-green-400'
                            } ${agent.status === 'active' ? 'shadow-lg' : 'opacity-70'}`}>
                              {getTypeIcon(agent.type)}
                            </div>
                            
                            {/* Agent info tooltip */}
                            <div className="absolute top-full mt-2 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-2 min-w-max z-10">
                              <div className="text-xs font-medium text-gray-900 dark:text-white">
                                {agent.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {agent.successRate}% success rate
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Connection lines */}
                      <svg className="absolute inset-0 w-full h-full pointer-events-none">
                        {/* Queen to others */}
                        <line x1="50%" y1="20%" x2="25%" y2="60%" stroke="#8B5CF6" strokeWidth="2" opacity="0.6" strokeDasharray="5,5">
                          <animate attributeName="stroke-dashoffset" values="0;-10" dur="2s" repeatCount="indefinite" />
                        </line>
                        <line x1="50%" y1="20%" x2="75%" y2="60%" stroke="#8B5CF6" strokeWidth="2" opacity="0.6" strokeDasharray="5,5">
                          <animate attributeName="stroke-dashoffset" values="0;-10" dur="2s" repeatCount="indefinite" />
                        </line>
                        {/* Specialist to Worker */}
                        <line x1="25%" y1="60%" x2="75%" y2="60%" stroke="#3B82F6" strokeWidth="1" opacity="0.4" strokeDasharray="3,3">
                          <animate attributeName="stroke-dashoffset" values="0;-6" dur="3s" repeatCount="indefinite" />
                        </line>
                      </svg>
                    </div>
                    
                    {/* Network status */}
                    <div className="absolute bottom-4 left-4 text-white">
                      <div className="text-lg font-medium">Swarm Network Active</div>
                      <div className="text-sm opacity-80">
                        {agents.filter(a => a.status === 'active').length} agents connected
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="space-y-6">
                {/* Swarm Performance */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="text-lg font-semibold flex items-center">
                      <ChartBarIcon className="h-5 w-5 mr-2" />
                      Swarm Performance
                    </h3>
                  </div>
                  <div className="card-body">
                    <div className="space-y-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-primary-600">96.4%</div>
                        <div className="text-sm text-gray-600">Swarm Efficiency</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-green-600">
                          {agents.reduce((sum, a) => sum + a.performanceMetrics.knowledgeShares, 0)}
                        </div>
                        <div className="text-sm text-gray-600">Knowledge Exchanges</div>
                      </div>
                      <div className="text-center">
                        <div className="text-3xl font-bold text-blue-600">94.2%</div>
                        <div className="text-sm text-gray-600">Collaboration Score</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Learning Activity */}
                <div className="card">
                  <div className="card-header">
                    <h3 className="text-lg font-semibold flex items-center">
                      <BeakerIcon className="h-5 w-5 mr-2" />
                      Learning Activity
                    </h3>
                  </div>
                  <div className="card-body">
                    <div className="space-y-3">
                      {agents.map(agent => (
                        <div key={agent.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {getTypeIcon(agent.type)}
                            <span className="text-sm font-medium">
                              {agent.name.split(' ')[0]}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            {agent.status === 'training' && (
                              <BoltIcon className="h-4 w-4 text-blue-600 animate-pulse" />
                            )}
                            <span className="text-xs text-gray-500">
                              {agent.trainingCycles} cycles
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Individual Agent View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                className="card hover:shadow-lg cursor-pointer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                onClick={() => setSelectedAgent(selectedAgent === agent.id ? null : agent.id)}
              >
                <div className="card-header">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getTypeIcon(agent.type)}
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {agent.name}
                        </h3>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${getStatusColor(agent.status)}`}>
                          {agent.status}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRetrain(agent.id);
                      }}
                      className="text-gray-400 hover:text-primary-600 transition-colors"
                      disabled={agent.status === 'training'}
                    >
                      <ArrowPathIcon className={`h-5 w-5 ${agent.status === 'training' ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                <div className="card-body">
                  {/* Performance Metrics */}
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="text-center">
                      <div className={`text-lg font-bold ${getPerformanceColor(agent.successRate)}`}>
                        {agent.successRate}%
                      </div>
                      <div className="text-xs text-gray-500">Success Rate</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600">{agent.trainingCycles}</div>
                      <div className="text-xs text-gray-500">Training Cycles</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${getPerformanceColor(agent.errorCorrection)}`}>
                        {agent.errorCorrection}%
                      </div>
                      <div className="text-xs text-gray-500">Error Correction</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${getPerformanceColor(agent.collaborationScore)}`}>
                        {agent.collaborationScore}%
                      </div>
                      <div className="text-xs text-gray-500">Collaboration</div>
                    </div>
                  </div>

                  {/* Additional Metrics */}
                  <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Response Time:</span>
                      <span className="font-medium">{agent.performanceMetrics.avgResponseTime}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Uptime:</span>
                      <span className="font-medium text-green-600">{agent.performanceMetrics.uptime}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tasks Done:</span>
                      <span className="font-medium">{agent.performanceMetrics.tasksCompleted.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Knowledge Shares:</span>
                      <span className="font-medium">{agent.performanceMetrics.knowledgeShares}</span>
                    </div>
                  </div>

                  {/* Specializations */}
                  <div className="mb-4">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Specializations
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {agent.specialization.map(spec => (
                        <span 
                          key={spec}
                          className="inline-block px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                        >
                          {spec.replace('-', ' ')}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Configuration Options */}
                  {selectedAgent === agent.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-gray-200 dark:border-gray-600 pt-4 mt-4"
                    >
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium flex items-center">
                            <BeakerIcon className="h-4 w-4 mr-1" />
                            Auto Learning
                          </label>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={agent.learningEnabled}
                              onChange={(e) => handleAgentUpdate(agent.id, { learningEnabled: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium flex items-center">
                            <BoltIcon className="h-4 w-4 mr-1" />
                            Auto Optimization
                          </label>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={agent.autoOptimize}
                              onChange={(e) => handleAgentUpdate(agent.id, { autoOptimize: e.target.checked })}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
                          </label>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            Retraining Frequency
                          </label>
                          <select
                            value={agent.retrainingFrequency}
                            onChange={(e) => handleAgentUpdate(agent.id, { retrainingFrequency: e.target.value as any })}
                            className="input text-sm w-full"
                          >
                            <option value="hourly">Every Hour</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-2 flex items-center">
                            <AdjustmentsHorizontalIcon className="h-4 w-4 mr-1" />
                            Max Training Cycles: {agent.maxTrainingCycles}
                          </label>
                          <input
                            type="range"
                            min="500"
                            max="10000"
                            step="100"
                            value={agent.maxTrainingCycles}
                            onChange={(e) => handleAgentUpdate(agent.id, { maxTrainingCycles: parseInt(e.target.value) })}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 slider"
                          />
                        </div>

                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetrain(agent.id);
                            }}
                            className="btn-primary flex-1 text-sm"
                            disabled={agent.status === 'training'}
                          >
                            {agent.status === 'training' ? 'Training...' : 'Retrain Now'}
                          </button>
                          <button className="btn-outline flex-1 text-sm">
                            Reset Agent
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Global Learning Configuration Panel */}
        <div className="mt-8">
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-semibold flex items-center">
                <SparklesIcon className="h-5 w-5 mr-2" />
                Global Swarm Configuration
              </h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                    Learning Schedule
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Daily Retraining</span>
                      <span className="text-sm font-medium text-green-600">Enabled</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Peak Hours Training</span>
                      <span className="text-sm font-medium text-blue-600">2:00 AM - 4:00 AM</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Cross-Agent Learning</span>
                      <span className="text-sm font-medium text-green-600">Active</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                    Performance Targets
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Min Success Rate</span>
                      <span className="text-sm font-medium">95%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Max Error Rate</span>
                      <span className="text-sm font-medium">2%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Response Time Target</span>
                      <span className="text-sm font-medium">&lt;200ms</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                    Swarm Intelligence
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Pattern Recognition</span>
                      <span className="text-sm font-medium text-green-600">Advanced</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Error Prediction</span>
                      <span className="text-sm font-medium text-blue-600">Neural Network</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Optimization Level</span>
                      <span className="text-sm font-medium text-purple-600">Hivemind</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentConfigurationPage;