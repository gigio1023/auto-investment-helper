import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/Card';
import { Button } from './ui/Button';
import { Badge } from './ui/Badge';
import LoadingSpinner from './LoadingSpinner';
import apiService from '../services/api';

interface TestResult {
  success: boolean;
  totalDuration?: number;
  results?: Array<{
    scenario: string;
    result: {
      success: boolean;
      duration: number;
      data?: any;
      error?: string;
    };
  }>;
  summary?: {
    passed: number;
    failed: number;
    total: number;
  };
  error?: string;
}

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    database: boolean;
    newsService: boolean;
    llmService: boolean;
    reportsService: boolean;
  };
  metrics: {
    memoryUsage: any;
    uptime: number;
    newsCount: number;
    reportsCount: number;
  };
}

const TestingDashboard: React.FC = () => {
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [mockNewsCount, setMockNewsCount] = useState(5);

  const testSuites = [
    { name: 'news-collection', label: 'News Collection' },
    { name: 'report-generation', label: 'Report Generation' },
    { name: 'integration', label: 'Integration' }
  ];

  const fetchSystemHealth = async () => {
    try {
      setLoading(prev => ({ ...prev, health: true }));
      const response = await fetch('/api/test/health');
      const health = await response.json();
      setSystemHealth(health);
    } catch (error) {
      console.error('Failed to fetch system health:', error);
    } finally {
      setLoading(prev => ({ ...prev, health: false }));
    }
  };

  const runTestSuite = async (suiteName: string) => {
    try {
      setLoading(prev => ({ ...prev, [suiteName]: true }));
      const response = await fetch(`/api/test/suites/${suiteName}/run`, {
        method: 'POST',
      });
      const result = await response.json();
      setTestResults(prev => ({ ...prev, [suiteName]: result }));
    } catch (error) {
      console.error(`Failed to run test suite ${suiteName}:`, error);
      setTestResults(prev => ({ 
        ...prev, 
        [suiteName]: { 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        } 
      }));
    } finally {
      setLoading(prev => ({ ...prev, [suiteName]: false }));
    }
  };

  const createMockNews = async () => {
    try {
      setLoading(prev => ({ ...prev, mockNews: true }));
      const response = await fetch('/api/test/data/mock-news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ count: mockNewsCount }),
      });
      const result = await response.json();
      alert(`Created ${result.created} mock news items`);
      fetchSystemHealth(); // Refresh stats
    } catch (error) {
      console.error('Failed to create mock news:', error);
      alert('Failed to create mock news');
    } finally {
      setLoading(prev => ({ ...prev, mockNews: false }));
    }
  };

  const cleanupTestData = async () => {
    try {
      setLoading(prev => ({ ...prev, cleanup: true }));
      await fetch('/api/test/data/cleanup', { method: 'DELETE' });
      alert('Test data cleaned up successfully');
      fetchSystemHealth(); // Refresh stats
    } catch (error) {
      console.error('Failed to cleanup test data:', error);
      alert('Failed to cleanup test data');
    } finally {
      setLoading(prev => ({ ...prev, cleanup: false }));
    }
  };

  const testReportGeneration = async (type: 'morning' | 'evening') => {
    try {
      setLoading(prev => ({ ...prev, [`report-${type}`]: true }));
      const response = await fetch(`/api/reports/test/generate/${type}`, {
        method: 'POST',
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`${type} report generated successfully in ${result.metrics.duration}ms`);
      } else {
        alert(`Failed to generate ${type} report: ${result.error}`);
      }
    } catch (error) {
      console.error(`Failed to generate ${type} report:`, error);
      alert(`Failed to generate ${type} report`);
    } finally {
      setLoading(prev => ({ ...prev, [`report-${type}`]: false }));
    }
  };

  const testFullFlow = async () => {
    try {
      setLoading(prev => ({ ...prev, fullFlow: true }));
      const response = await fetch('/api/reports/test/flow/full', {
        method: 'POST',
      });
      const result = await response.json();
      
      const successSteps = result.steps.filter((s: any) => s.success).length;
      const totalSteps = result.steps.length;
      
      alert(`Full flow test completed: ${successSteps}/${totalSteps} steps successful in ${result.totalDuration}ms`);
    } catch (error) {
      console.error('Failed to run full flow test:', error);
      alert('Failed to run full flow test');
    } finally {
      setLoading(prev => ({ ...prev, fullFlow: false }));
    }
  };

  useEffect(() => {
    fetchSystemHealth();
  }, []);

  const getHealthStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'bg-green-100 text-green-800';
      case 'degraded': return 'bg-yellow-100 text-yellow-800';
      case 'unhealthy': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getServiceStatusColor = (status: boolean) => {
    return status ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Testing Dashboard</h1>
        <Button onClick={fetchSystemHealth} disabled={loading.health}>
          {loading.health ? <LoadingSpinner size="small" /> : 'Refresh'}
        </Button>
      </div>

      {/* System Health */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            System Health
            {systemHealth && (
              <Badge className={getHealthStatusColor(systemHealth.status)}>
                {systemHealth.status}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {systemHealth ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <h4 className="font-semibold mb-2">Services</h4>
                <div className="space-y-1">
                  {Object.entries(systemHealth.services).map(([service, status]) => (
                    <div key={service} className="flex items-center justify-between">
                      <span className="text-sm">{service}</span>
                      <Badge className={getServiceStatusColor(status)}>
                        {status ? '✓' : '✗'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Metrics</h4>
                <div className="space-y-1 text-sm">
                  <div>Uptime: {Math.floor(systemHealth.metrics.uptime / 3600)}h</div>
                  <div>News: {systemHealth.metrics.newsCount}</div>
                  <div>Reports: {systemHealth.metrics.reportsCount}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <LoadingSpinner />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Data Management */}
      <Card>
        <CardHeader>
          <CardTitle>Test Data Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-sm font-medium mb-1">Mock News Count:</label>
              <input
                type="number"
                value={mockNewsCount}
                onChange={(e) => setMockNewsCount(Number(e.target.value))}
                className="border rounded px-3 py-2 w-24"
                min="1"
                max="20"
              />
            </div>
            <Button onClick={createMockNews} disabled={loading.mockNews}>
              {loading.mockNews ? <LoadingSpinner size="small" /> : 'Create Mock News'}
            </Button>
            <Button onClick={cleanupTestData} disabled={loading.cleanup} variant="destructive">
              {loading.cleanup ? <LoadingSpinner size="small" /> : 'Cleanup Test Data'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Testing */}
      <Card>
        <CardHeader>
          <CardTitle>Manual Testing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Button
              onClick={() => testReportGeneration('morning')}
              disabled={loading['report-morning']}
              className="h-20"
            >
              {loading['report-morning'] ? <LoadingSpinner size="small" /> : 'Generate Morning Report'}
            </Button>
            <Button
              onClick={() => testReportGeneration('evening')}
              disabled={loading['report-evening']}
              className="h-20"
            >
              {loading['report-evening'] ? <LoadingSpinner size="small" /> : 'Generate Evening Report'}
            </Button>
            <Button
              onClick={testFullFlow}
              disabled={loading.fullFlow}
              className="h-20 bg-purple-600 hover:bg-purple-700"
            >
              {loading.fullFlow ? <LoadingSpinner size="small" /> : 'Run Full Flow Test'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Test Suites */}
      <Card>
        <CardHeader>
          <CardTitle>Test Suites</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {testSuites.map((suite) => (
              <div key={suite.name} className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-semibold">{suite.label}</h3>
                  <Button
                    onClick={() => runTestSuite(suite.name)}
                    disabled={loading[suite.name]}
                    size="sm"
                  >
                    {loading[suite.name] ? <LoadingSpinner size="small" /> : 'Run'}
                  </Button>
                </div>
                
                {testResults[suite.name] && (
                  <div className="mt-3 p-3 bg-gray-50 rounded">
                    <div className="flex items-center justify-between mb-2">
                      <Badge className={testResults[suite.name].success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                        {testResults[suite.name].success ? 'PASSED' : 'FAILED'}
                      </Badge>
                      {testResults[suite.name].totalDuration && (
                        <span className="text-sm text-gray-600">
                          {testResults[suite.name].totalDuration}ms
                        </span>
                      )}
                    </div>
                    
                    {testResults[suite.name].summary && (
                      <div className="text-sm text-gray-600 mb-2">
                        {testResults[suite.name].summary!.passed}/{testResults[suite.name].summary!.total} scenarios passed
                      </div>
                    )}
                    
                    {testResults[suite.name].error && (
                      <div className="text-sm text-red-600">
                        Error: {testResults[suite.name].error}
                      </div>
                    )}
                    
                    {testResults[suite.name].results && (
                      <div className="space-y-1">
                        {testResults[suite.name].results!.map((result, index) => (
                          <div key={index} className="flex justify-between items-center text-sm">
                            <span>{result.scenario}</span>
                            <div className="flex items-center gap-2">
                              <Badge size="sm" className={result.result.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                                {result.result.success ? '✓' : '✗'}
                              </Badge>
                              <span className="text-gray-500">{result.result.duration}ms</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TestingDashboard; 