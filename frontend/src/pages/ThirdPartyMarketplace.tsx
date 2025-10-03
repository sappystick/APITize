import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MagnifyingGlassIcon,
  StarIcon,
  ChartBarIcon,
  ClockIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  GlobeAltIcon,
  DocumentTextIcon,
  BanknotesIcon,
  TrophyIcon,
  BeakerIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolidIcon } from '@heroicons/react/24/solid';

const ThirdPartyMarketplace: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'premium'>('all');
  const [qualityFilter, setQualityFilter] = useState<number>(4.0);

  // Third-party marketplace APIs with comprehensive scoring
  const marketplaceApis = [
    {
      id: 'rapidapi-weather',
      name: 'Advanced Weather Intelligence API',
      provider: 'WeatherTech Solutions',
      category: 'Weather & Climate',
      description: 'ML-enhanced weather predictions with 15-day forecasts and extreme event alerts',
      stars: 4.9,
      totalRating: 8924,
      uses: 2850000,
      uptime: 99.97,
      successRate: 99.8,
      avgResponseTime: 45,
      lastUpdated: '2024-12-23',
      pricing: {
        free: { calls: 1000, features: ['basic-forecast', '7-day'] },
        premium: { monthly: 49, calls: 100000, features: ['ml-predictions', '15-day', 'alerts'] },
        enterprise: { monthly: 499, calls: 'unlimited', features: ['all', 'custom-models', 'priority-support'] }
      },
      qualityScore: {
        documentation: 9.8,
        apiDesign: 9.5,
        reliability: 9.9,
        support: 9.4,
        innovation: 9.7
      },
      analytics: {
        totalRevenue: 1250000,
        monthlyGrowth: 23.5,
        userRetention: 94.2,
        nps: 67
      },
      marketplace: 'RapidAPI',
      royaltyRate: 20,
      creatorEarnings: 250000,
      marketplaceReady: true,
      certifications: ['ISO27001', 'SOC2', 'GDPR'],
      tags: ['weather', 'ml', 'predictions', 'alerts', 'climate']
    },
    {
      id: 'financial-intelligence',
      name: 'Real-Time Financial Data API',
      provider: 'FinanceCore Inc',
      category: 'Financial Services',
      description: 'Real-time stock prices, crypto data, and financial news with AI sentiment analysis',
      stars: 4.8,
      totalRating: 6734,
      uses: 5200000,
      uptime: 99.94,
      successRate: 99.6,
      avgResponseTime: 28,
      lastUpdated: '2024-12-23',
      pricing: {
        free: { calls: 500, features: ['basic-stocks', 'delayed-data'] },
        premium: { monthly: 99, calls: 50000, features: ['real-time', 'crypto', 'news'] },
        enterprise: { monthly: 999, calls: 'unlimited', features: ['all', 'ai-analysis', '24-7-support'] }
      },
      qualityScore: {
        documentation: 9.6,
        apiDesign: 9.8,
        reliability: 9.9,
        support: 9.2,
        innovation: 9.5
      },
      analytics: {
        totalRevenue: 2800000,
        monthlyGrowth: 31.2,
        userRetention: 96.8,
        nps: 73
      },
      marketplace: 'AWS Marketplace',
      royaltyRate: 25,
      creatorEarnings: 700000,
      marketplaceReady: true,
      certifications: ['PCI-DSS', 'SOC2', 'FCA-Regulated'],
      tags: ['finance', 'stocks', 'crypto', 'ai', 'real-time']
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Enhanced Header with Marketplace Stats */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Third-Party API Marketplace
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-3xl mx-auto">
                Discover, deploy, and monetize premium APIs from verified providers with marketplace-ready quality standards
              </p>
            </div>

            {/* Marketplace Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary-600">12,450+</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Premium APIs</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">$2.8M</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Creator Earnings</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">99.8%</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Avg Uptime</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-purple-600">850M+</div>
                <div className="text-sm text-gray-600 dark:text-gray-400">API Calls/Month</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Marketplace API Grid with Enhanced Scorecards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {marketplaceApis.map((api, index) => (
            <motion.div
              key={api.id}
              className="card hover:shadow-xl transition-all duration-300"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
            >
              {/* API Header */}
              <div className="card-header">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                        {api.name}
                      </h3>
                      <div className="flex items-center space-x-1">
                        {[...Array(5)].map((_, i) => (
                          <StarSolidIcon
                            key={i}
                            className={`h-4 w-4 ${
                              i < Math.floor(api.stars)
                                ? 'text-yellow-400'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                        <span className="text-sm text-gray-600 ml-1">
                          ({api.totalRating.toLocaleString()})
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                      <span className="flex items-center space-x-1">
                        <GlobeAltIcon className="h-4 w-4" />
                        <span>{api.provider}</span>
                      </span>
                      <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                        {api.marketplace}
                      </span>
                    </div>
                    
                    <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                      {api.description}
                    </p>

                    {/* Certifications */}
                    <div className="flex flex-wrap gap-1 mb-4">
                      {api.certifications.map(cert => (
                        <span 
                          key={cert}
                          className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
                        >
                          <ShieldCheckIcon className="h-3 w-3 inline mr-1" />
                          {cert}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="card-body">
                {/* Comprehensive Analytics Scorecard */}
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 rounded-lg p-4 mb-6">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                    <ChartBarIcon className="h-5 w-5 mr-2" />
                    Performance Scorecard
                  </h4>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{api.uptime}%</div>
                      <div className="text-xs text-gray-500">Uptime</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{api.avgResponseTime}ms</div>
                      <div className="text-xs text-gray-500">Response Time</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">{api.successRate}%</div>
                      <div className="text-xs text-gray-500">Success Rate</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span>Total Uses:</span>
                      <span className="font-medium">{api.uses.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Monthly Growth:</span>
                      <span className="font-medium text-green-600">+{api.analytics.monthlyGrowth}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>User Retention:</span>
                      <span className="font-medium">{api.analytics.userRetention}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>NPS Score:</span>
                      <span className="font-medium">{api.analytics.nps}</span>
                    </div>
                  </div>
                </div>

                {/* Revenue & Royalty Information */}
                <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <h4 className="font-semibold text-green-800 dark:text-green-400 mb-3 flex items-center">
                    <BanknotesIcon className="h-5 w-5 mr-2" />
                    Revenue & Royalties
                  </h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between">
                      <span>Total Revenue:</span>
                      <span className="font-bold text-green-600">${api.analytics.totalRevenue.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Creator Earnings:</span>
                      <span className="font-bold text-green-600">${api.creatorEarnings.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Royalty Rate:</span>
                      <span className="font-medium">{api.royaltyRate}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Monthly Growth:</span>
                      <span className="font-medium text-blue-600">+{api.analytics.monthlyGrowth}%</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex space-x-3">
                  <button className="btn-primary flex-1">
                    Deploy to Marketplace
                  </button>
                  <button className="btn-outline flex-1">
                    Clone & Customize
                  </button>
                  <button className="btn-outline">
                    <DocumentTextIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ThirdPartyMarketplace;