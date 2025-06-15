import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Report } from '../../entities/report.entity';
import { NewsSource } from '../../entities/news-source.entity';
import { ReportsService } from './reports.service';
import { NewsService } from '../news/news.service';
import { LlmService } from '../llm/llm.service';

export interface TestScenario {
  name: string;
  description: string;
  expectedOutcome: string;
  execute: () => Promise<TestResult>;
}

export interface TestResult {
  success: boolean;
  duration: number;
  data?: any;
  error?: string;
  metrics?: {
    memoryUsage?: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
}

export interface TestSuite {
  name: string;
  description: string;
  scenarios: TestScenario[];
}

@Injectable()
export class TestingService {
  private readonly logger = new Logger(TestingService.name);

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    @InjectRepository(NewsSource)
    private newsRepository: Repository<NewsSource>,
    private reportsService: ReportsService,
    private newsService: NewsService,
    private llmService: LlmService,
  ) {}

  async runTestSuite(suiteName: string): Promise<{
    success: boolean;
    totalDuration: number;
    results: Array<{
      scenario: string;
      result: TestResult;
    }>;
    summary: {
      passed: number;
      failed: number;
      total: number;
    };
  }> {
    this.logger.log(`🧪 Running test suite: ${suiteName}`);
    const startTime = Date.now();

    const suite = this.getTestSuite(suiteName);
    if (!suite) {
      throw new Error(`Test suite '${suiteName}' not found`);
    }

    const results: Array<{ scenario: string; result: TestResult }> = [];
    let passed = 0;
    let failed = 0;

    for (const scenario of suite.scenarios) {
      this.logger.log(`🔍 Executing scenario: ${scenario.name}`);

      try {
        const result = await scenario.execute();
        results.push({
          scenario: scenario.name,
          result,
        });

        if (result.success) {
          passed++;
          this.logger.log(`✅ ${scenario.name} passed in ${result.duration}ms`);
        } else {
          failed++;
          this.logger.error(`❌ ${scenario.name} failed: ${result.error}`);
        }
      } catch (error) {
        failed++;
        this.logger.error(`💥 ${scenario.name} crashed: ${error.message}`);
        results.push({
          scenario: scenario.name,
          result: {
            success: false,
            duration: 0,
            error: error.message,
          },
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    const success = failed === 0;

    this.logger.log(
      `🏁 Test suite completed: ${passed}/${passed + failed} passed in ${totalDuration}ms`,
    );

    return {
      success,
      totalDuration,
      results,
      summary: {
        passed,
        failed,
        total: passed + failed,
      },
    };
  }

  private getTestSuite(name: string): TestSuite | null {
    const suites: Record<string, TestSuite> = {
      'news-collection': {
        name: 'news-collection',
        description: 'Test news collection from various sources',
        scenarios: [
          {
            name: 'collect-news-basic',
            description: 'Test basic news collection functionality',
            expectedOutcome: 'News should be collected and stored in database',
            execute: async (): Promise<TestResult> => {
              const startTime = Date.now();
              const cpuStart = process.cpuUsage();
              const memStart = process.memoryUsage();

              try {
                const statsBefore = await this.newsService.getNewsStats();
                await this.newsService.collectNews();
                const statsAfter = await this.newsService.getNewsStats();

                const cpuEnd = process.cpuUsage(cpuStart);
                const memEnd = process.memoryUsage();

                return {
                  success: true,
                  duration: Date.now() - startTime,
                  data: {
                    newNewsCount: statsAfter.total - statsBefore.total,
                    totalNews: statsAfter.total,
                    unprocessed: statsAfter.unprocessed,
                  },
                  metrics: {
                    cpuUsage: cpuEnd,
                    memoryUsage: {
                      rss: memEnd.rss - memStart.rss,
                      heapUsed: memEnd.heapUsed - memStart.heapUsed,
                      heapTotal: memEnd.heapTotal - memStart.heapTotal,
                      external: memEnd.external - memStart.external,
                      arrayBuffers: memEnd.arrayBuffers - memStart.arrayBuffers,
                    },
                  },
                };
              } catch (error) {
                return {
                  success: false,
                  duration: Date.now() - startTime,
                  error: error.message,
                };
              }
            },
          },
          {
            name: 'news-processing-speed',
            description: 'Test news processing performance',
            expectedOutcome:
              'News collection should complete within reasonable time',
            execute: async (): Promise<TestResult> => {
              const startTime = Date.now();
              const maxAllowedTime = 30000; // 30 seconds

              try {
                await this.newsService.collectNews();
                const duration = Date.now() - startTime;

                return {
                  success: duration < maxAllowedTime,
                  duration,
                  data: {
                    maxAllowedTime,
                    actualTime: duration,
                    performanceGrade:
                      duration < 10000
                        ? 'excellent'
                        : duration < 20000
                          ? 'good'
                          : 'slow',
                  },
                  error:
                    duration >= maxAllowedTime
                      ? `Exceeded time limit: ${duration}ms > ${maxAllowedTime}ms`
                      : undefined,
                };
              } catch (error) {
                return {
                  success: false,
                  duration: Date.now() - startTime,
                  error: error.message,
                };
              }
            },
          },
        ],
      },
      'report-generation': {
        name: 'report-generation',
        description: 'Test report generation with various scenarios',
        scenarios: [
          {
            name: 'morning-report-generation',
            description: 'Test morning report generation',
            expectedOutcome:
              'Morning report should be generated with proper content',
            execute: async (): Promise<TestResult> => {
              const startTime = Date.now();

              try {
                const report =
                  await this.reportsService.generateDailyReport('morning');

                const validationResults = this.validateReport(
                  report,
                  'morning',
                );

                return {
                  success: validationResults.isValid,
                  duration: Date.now() - startTime,
                  data: {
                    reportId: report.id,
                    reportType: report.reportType,
                    contentLength: report.content?.length || 0,
                    summaryLength: report.summary?.length || 0,
                    newsProcessed: report.newsAnalysis?.processedCount || 0,
                    validation: validationResults,
                  },
                  error: validationResults.isValid
                    ? undefined
                    : validationResults.errors.join(', '),
                };
              } catch (error) {
                return {
                  success: false,
                  duration: Date.now() - startTime,
                  error: error.message,
                };
              }
            },
          },
          {
            name: 'evening-report-generation',
            description: 'Test evening report generation',
            expectedOutcome:
              'Evening report should be generated with proper content',
            execute: async (): Promise<TestResult> => {
              const startTime = Date.now();

              try {
                const report =
                  await this.reportsService.generateDailyReport('evening');

                const validationResults = this.validateReport(
                  report,
                  'evening',
                );

                return {
                  success: validationResults.isValid,
                  duration: Date.now() - startTime,
                  data: {
                    reportId: report.id,
                    reportType: report.reportType,
                    contentLength: report.content?.length || 0,
                    summaryLength: report.summary?.length || 0,
                    newsProcessed: report.newsAnalysis?.processedCount || 0,
                    validation: validationResults,
                  },
                  error: validationResults.isValid
                    ? undefined
                    : validationResults.errors.join(', '),
                };
              } catch (error) {
                return {
                  success: false,
                  duration: Date.now() - startTime,
                  error: error.message,
                };
              }
            },
          },
          {
            name: 'report-with-no-news',
            description: 'Test report generation when no new news is available',
            expectedOutcome: 'Report should be generated with default content',
            execute: async (): Promise<TestResult> => {
              const startTime = Date.now();

              try {
                // Mark all news as processed to simulate no new news
                const unprocessedNews =
                  await this.newsService.getUnprocessedNews();
                if (unprocessedNews.length > 0) {
                  await this.newsService.markAsProcessed(
                    unprocessedNews.map((n) => n.id),
                  );
                }

                const report =
                  await this.reportsService.generateDailyReport('morning');

                return {
                  success: true,
                  duration: Date.now() - startTime,
                  data: {
                    reportId: report.id,
                    hasDefaultContent:
                      report.content?.includes(
                        '분석할 새로운 뉴스가 없습니다',
                      ) || false,
                    newsProcessed: report.newsAnalysis?.processedCount || 0,
                  },
                };
              } catch (error) {
                return {
                  success: false,
                  duration: Date.now() - startTime,
                  error: error.message,
                };
              }
            },
          },
        ],
      },
      integration: {
        name: 'integration',
        description: 'End-to-end integration tests',
        scenarios: [
          {
            name: 'full-pipeline-test',
            description:
              'Test complete pipeline from news collection to report generation',
            expectedOutcome: 'Complete pipeline should work without errors',
            execute: async (): Promise<TestResult> => {
              const startTime = Date.now();
              const steps: Array<{
                name: string;
                duration: number;
                success: boolean;
                data?: any;
              }> = [];

              try {
                // Step 1: News collection
                let stepStart = Date.now();
                await this.newsService.collectNews();
                const newsStats = await this.newsService.getNewsStats();
                steps.push({
                  name: 'news_collection',
                  duration: Date.now() - stepStart,
                  success: true,
                  data: newsStats,
                });

                // Step 2: Report generation
                stepStart = Date.now();
                const report =
                  await this.reportsService.generateDailyReport('morning');
                steps.push({
                  name: 'report_generation',
                  duration: Date.now() - stepStart,
                  success: true,
                  data: {
                    reportId: report.id,
                    newsProcessed: report.newsAnalysis?.processedCount || 0,
                  },
                });

                // Step 3: Data validation
                stepStart = Date.now();
                const validation = this.validateReport(report, 'morning');
                steps.push({
                  name: 'data_validation',
                  duration: Date.now() - stepStart,
                  success: validation.isValid,
                  data: validation,
                });

                return {
                  success: steps.every((step) => step.success),
                  duration: Date.now() - startTime,
                  data: {
                    steps,
                    totalSteps: steps.length,
                    successfulSteps: steps.filter((s) => s.success).length,
                  },
                };
              } catch (error) {
                return {
                  success: false,
                  duration: Date.now() - startTime,
                  error: error.message,
                  data: { steps },
                };
              }
            },
          },
        ],
      },
    };

    return suites[name] || null;
  }

  private validateReport(
    report: Report,
    expectedType: string,
  ): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Basic validation
    if (!report.title) errors.push('Report title is missing');
    if (!report.content) errors.push('Report content is missing');
    if (!report.summary) errors.push('Report summary is missing');
    if (report.reportType !== expectedType)
      errors.push(
        `Report type mismatch: expected ${expectedType}, got ${report.reportType}`,
      );

    // Content validation
    if (report.content && report.content.length < 100) {
      warnings.push('Report content seems too short');
    }

    if (report.summary && report.summary.length < 50) {
      warnings.push('Report summary seems too short');
    }

    // News analysis validation
    if (!report.newsAnalysis) {
      errors.push('News analysis is missing');
    } else {
      if (typeof report.newsAnalysis.processedCount !== 'number') {
        errors.push('News analysis processedCount is invalid');
      }
      if (!report.newsAnalysis.keyInsights) {
        warnings.push('Key insights are missing from news analysis');
      }
    }

    // Investment recommendations validation
    if (!report.investmentRecommendations) {
      warnings.push('Investment recommendations are missing');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  async createMockNews(count: number = 5): Promise<NewsSource[]> {
    const mockNewsItems: Partial<NewsSource>[] = [
      {
        title: 'Fed Considers Interest Rate Adjustment',
        content:
          'The Federal Reserve is considering adjusting interest rates in response to current economic conditions. Market analysts are closely watching for signs of policy changes.',
        url: `https://test.example.com/fed-rates-${Date.now()}-1`,
        source: 'Test Financial News',
        publishedAt: new Date(),
        tags: ['fed', 'interest rate', 'policy'],
        processed: false,
        category: 'central_bank',
      },
      {
        title: 'Tech Stocks Show Strong Performance',
        content:
          'Major technology companies reported strong quarterly earnings, driving up stock prices across the sector. Investors are optimistic about future growth prospects.',
        url: `https://test.example.com/tech-stocks-${Date.now()}-2`,
        source: 'Test Tech News',
        publishedAt: new Date(),
        tags: ['tech', 'stocks', 'earnings'],
        processed: false,
        category: 'international',
      },
      {
        title: 'Oil Prices Fluctuate Amid Global Tensions',
        content:
          'Crude oil prices experienced volatility due to geopolitical tensions and supply chain concerns. Energy sector investors are monitoring the situation closely.',
        url: `https://test.example.com/oil-prices-${Date.now()}-3`,
        source: 'Test Energy News',
        publishedAt: new Date(),
        tags: ['oil', 'energy', 'geopolitical'],
        processed: false,
        category: 'international',
      },
      {
        title: 'Korean Won Strengthens Against Dollar',
        content:
          'The Korean won showed strength against the US dollar in recent trading sessions, influenced by positive economic indicators and export data.',
        url: `https://test.example.com/krw-usd-${Date.now()}-4`,
        source: 'Test Currency News',
        publishedAt: new Date(),
        tags: ['currency', 'krw', 'usd', 'exchange rate'],
        processed: false,
        category: 'korean',
      },
      {
        title: 'Inflation Data Shows Mixed Signals',
        content:
          'Latest inflation data presents a mixed picture, with some sectors showing price increases while others remain stable. Economists are divided on future trends.',
        url: `https://test.example.com/inflation-${Date.now()}-5`,
        source: 'Test Economic News',
        publishedAt: new Date(),
        tags: ['inflation', 'economic data', 'prices'],
        processed: false,
        category: 'international',
      },
    ];

    const newsToCreate = mockNewsItems.slice(0, count);
    const createdNews: NewsSource[] = [];

    for (const newsData of newsToCreate) {
      const news = this.newsRepository.create(newsData);
      const savedNews = await this.newsRepository.save(news);
      createdNews.push(savedNews);
    }

    this.logger.log(
      `📰 Created ${createdNews.length} mock news items for testing`,
    );
    return createdNews;
  }

  async cleanupTestData(): Promise<void> {
    this.logger.log('🧹 Cleaning up test data...');

    // Delete test news items (those with test.example.com URLs)
    const testNews = await this.newsRepository.find({
      where: {
        url: Like('%test.example.com%'),
      },
    });

    if (testNews.length > 0) {
      await this.newsRepository.remove(testNews);
      this.logger.log(`🗑️ Deleted ${testNews.length} test news items`);
    }

    // Delete test reports (those with titles containing 'Test')
    const testReports = await this.reportRepository.find({
      where: {
        title: Like('%Test%'),
      },
    });

    if (testReports.length > 0) {
      await this.reportRepository.remove(testReports);
      this.logger.log(`🗑️ Deleted ${testReports.length} test reports`);
    }
  }

  async getAvailableTestSuites(): Promise<string[]> {
    return ['news-collection', 'report-generation', 'integration'];
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: {
      database: boolean;
      newsService: boolean;
      llmService: boolean;
      reportsService: boolean;
    };
    metrics: {
      memoryUsage: NodeJS.MemoryUsage;
      uptime: number;
      newsCount: number;
      reportsCount: number;
    };
  }> {
    const services = {
      database: false,
      newsService: false,
      llmService: false,
      reportsService: false,
    };

    let healthyServices = 0;

    // Test database connection
    try {
      await this.newsRepository.count();
      services.database = true;
      healthyServices++;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
    }

    // Test news service
    try {
      await this.newsService.getNewsStats();
      services.newsService = true;
      healthyServices++;
    } catch (error) {
      this.logger.error('News service health check failed:', error);
    }

    // Test LLM service (basic check)
    try {
      // We can't easily test LLM service without making actual API calls
      // So we'll just check if it's instantiated
      if (this.llmService) {
        services.llmService = true;
        healthyServices++;
      }
    } catch (error) {
      this.logger.error('LLM service health check failed:', error);
    }

    // Test reports service
    try {
      await this.reportsService.getReportsStats();
      services.reportsService = true;
      healthyServices++;
    } catch (error) {
      this.logger.error('Reports service health check failed:', error);
    }

    const newsCount = await this.newsRepository.count();
    const reportsCount = await this.reportRepository.count();

    const status =
      healthyServices === 4
        ? 'healthy'
        : healthyServices >= 2
          ? 'degraded'
          : 'unhealthy';

    return {
      status,
      services,
      metrics: {
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        newsCount,
        reportsCount,
      },
    };
  }
}
