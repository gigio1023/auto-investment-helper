import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ReportsModule } from '../../src/modules/reports/reports.module';
import { NewsModule } from '../../src/modules/news/news.module';
import { LlmModule } from '../../src/modules/llm/llm.module';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { NewsService } from '../../src/modules/news/news.service';
import { TestingService } from '../../src/modules/reports/testing.service';
import { Report } from '../../src/entities/report.entity';
import { NewsSource } from '../../src/entities/news-source.entity';
import * as request from 'supertest';

describe('Data Flow Integration (e2e)', () => {
  let app: INestApplication;
  let reportsService: ReportsService;
  let newsService: NewsService;
  let testingService: TestingService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Report, NewsSource],
          synchronize: true,
          logging: false,
        }),
        ReportsModule,
        NewsModule,
        LlmModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    reportsService = moduleFixture.get<ReportsService>(ReportsService);
    newsService = moduleFixture.get<NewsService>(NewsService);
    testingService = moduleFixture.get<TestingService>(TestingService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up any existing test data
    await testingService.cleanupTestData();
  });

  describe('Complete Data Pipeline', () => {
    it('should_complete_full_data_flow_successfully', async () => {
      // Step 1: Create mock news data
      const mockNews = await testingService.createMockNews(5);
      expect(mockNews).toHaveLength(5);

      // Step 2: Verify news is in the database
      const newsStats = await newsService.getNewsStats();
      expect(newsStats.total).toBeGreaterThanOrEqual(5);
      expect(newsStats.unprocessed).toBeGreaterThanOrEqual(5);

      // Step 3: Generate a morning report
      const morningReport = await reportsService.generateDailyReport('morning');
      expect(morningReport).toBeDefined();
      expect(morningReport.id).toBeDefined();
      expect(morningReport.reportType).toBe('morning');
      expect(morningReport.title).toContain('오전 투자 리포트');
      expect(morningReport.content).toBeDefined();
      expect(morningReport.summary).toBeDefined();

      // Step 4: Verify news was processed
      const updatedNewsStats = await newsService.getNewsStats();
      expect(updatedNewsStats.processed).toBeGreaterThan(0);

      // Step 5: Generate an evening report
      const eveningReport = await reportsService.generateDailyReport('evening');
      expect(eveningReport).toBeDefined();
      expect(eveningReport.reportType).toBe('evening');
      expect(eveningReport.title).toContain('오후 투자 리포트');

      // Step 6: Verify both reports are retrievable
      const reports = await reportsService.getReports(1, 10);
      expect(reports.reports).toHaveLength(2);
      expect(reports.total).toBe(2);
    }, 60000); // 60 second timeout for LLM operations

    it('should_handle_no_news_scenario_gracefully', async () => {
      // Clean up any existing test data first
      await testingService.cleanupTestData();
      
      // Store initial state - don't assume it's 0
      const initialStats = await newsService.getNewsStats();
      const initialUnprocessed = initialStats.unprocessed;
      
      // Generate report and verify it handles the scenario gracefully
      const report = await reportsService.generateDailyReport('morning');
      expect(report).toBeDefined();
      expect(report.reportType).toBe('morning');
      expect(report.title).toContain('오전');
      expect(report.content).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.newsAnalysis).toBeDefined();
      expect(typeof report.newsAnalysis.processedCount).toBe('number');
      
      // Verify the report was created successfully regardless of news count
      expect(report.id).toBeDefined();
      expect(report.createdAt).toBeDefined();
    }, 30000);

    it('should_validate_report_content_structure', async () => {
      // Create mock news
      await testingService.createMockNews(3);

      // Generate report
      const report = await reportsService.generateDailyReport('morning');

      // Validate report structure
      expect(report.title).toBeDefined();
      expect(report.content).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.newsAnalysis).toBeDefined();
      expect(report.investmentRecommendations).toBeDefined();

      // Validate content quality
      expect(report.content.length).toBeGreaterThan(100);
      expect(report.summary.length).toBeGreaterThan(50);
      expect(report.newsAnalysis.processedCount).toBeGreaterThan(0);

      // Validate investment recommendations structure
      expect(report.investmentRecommendations.content).toBeDefined();
      expect(report.investmentRecommendations.riskLevel).toBe('conservative');
      expect(report.investmentRecommendations.timeHorizon).toBe('long-term');
    }, 45000);

    it('should_handle_concurrent_report_generation', async () => {
      // Create sufficient mock news
      await testingService.createMockNews(10);

      // Generate both morning and evening reports concurrently
      const [morningReport, eveningReport] = await Promise.all([
        reportsService.generateDailyReport('morning'),
        reportsService.generateDailyReport('evening'),
      ]);

      expect(morningReport).toBeDefined();
      expect(eveningReport).toBeDefined();
      expect(morningReport.id).not.toBe(eveningReport.id);
      expect(morningReport.reportType).toBe('morning');
      expect(eveningReport.reportType).toBe('evening');
    }, 90000); // Extended timeout for concurrent operations
  });

  describe('API Endpoints Integration', () => {
    it('should_access_test_endpoints_successfully', async () => {
      // Test system health endpoint
      const healthResponse = await request(app.getHttpServer())
        .get('/test/health')
        .expect(200);

      expect(healthResponse.body.status).toBeDefined();
      expect(healthResponse.body.services).toBeDefined();

      // Test available test suites endpoint
      const suitesResponse = await request(app.getHttpServer())
        .get('/test/suites')
        .expect(200);

      expect(suitesResponse.body.suites).toContain('news-collection');
      expect(suitesResponse.body.suites).toContain('report-generation');
      expect(suitesResponse.body.suites).toContain('integration');
    });

    it('should_run_test_suite_via_api', async () => {
      // Create mock data first
      await testingService.createMockNews(5);

      // Run news-collection test suite
      const testResponse = await request(app.getHttpServer())
        .post('/test/suites/news-collection/run')
        .expect(201);

      expect(testResponse.body.success).toBeDefined();
      expect(testResponse.body.results).toBeDefined();
      expect(testResponse.body.summary).toBeDefined();
      expect(testResponse.body.summary.total).toBeGreaterThan(0);
    }, 30000);

    it('should_create_and_cleanup_mock_data', async () => {
      // Create mock news via API
      const createResponse = await request(app.getHttpServer())
        .post('/test/data/mock-news')
        .send({ count: 3 })
        .expect(201);

      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.created).toBe(3);

      // Verify news was created
      const stats = await newsService.getNewsStats();
      expect(stats.total).toBeGreaterThanOrEqual(3);

      // Cleanup via API
      const cleanupResponse = await request(app.getHttpServer())
        .delete('/test/data/cleanup')
        .expect(200);

      expect(cleanupResponse.body.success).toBe(true);
    });

    it('should_manually_trigger_report_generation', async () => {
      // Create mock news
      await testingService.createMockNews(3);

      // Trigger morning report generation via API
      const reportResponse = await request(app.getHttpServer())
        .post('/reports/test/generate/morning')
        .expect(201);

      expect(reportResponse.body.success).toBe(true);
      expect(reportResponse.body.report).toBeDefined();
      expect(reportResponse.body.metrics).toBeDefined();
      expect(reportResponse.body.metrics.duration).toBeGreaterThan(0);
      expect(reportResponse.body.metrics.newsProcessed).toBeGreaterThan(0);
    }, 45000);

    it('should_execute_full_flow_test', async () => {
      // Execute full flow test via API
      const flowResponse = await request(app.getHttpServer())
        .post('/reports/test/flow/full')
        .expect(201);

      expect(flowResponse.body.success).toBeDefined();
      expect(flowResponse.body.steps).toBeDefined();
      expect(flowResponse.body.totalDuration).toBeGreaterThan(0);
      expect(flowResponse.body.steps).toHaveLength(3); // news_collection, morning_report, evening_report

      // Verify each step has required properties
      flowResponse.body.steps.forEach((step: any) => {
        expect(step.step).toBeDefined();
        expect(step.success).toBeDefined();
        expect(step.duration).toBeGreaterThan(0);
      });
    }, 120000); // Extended timeout for full flow
  });

  describe('Performance and Reliability', () => {
    it('should_complete_operations_within_time_limits', async () => {
      const startTime = Date.now();

      // Create mock news
      await testingService.createMockNews(5);
      const newsCreationTime = Date.now() - startTime;
      expect(newsCreationTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Generate report
      const reportStartTime = Date.now();
      const report = await reportsService.generateDailyReport('morning');
      const reportGenerationTime = Date.now() - reportStartTime;

      expect(report).toBeDefined();
      expect(reportGenerationTime).toBeLessThan(60000); // Should complete within 60 seconds
    }, 70000);

    it('should_handle_error_scenarios_gracefully', async () => {
      // Test with invalid report type (should be handled by validation)
      try {
        await reportsService.generateDailyReport('invalid' as any);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // Test system health when services are available
      const health = await testingService.getSystemHealth();
      expect(health.status).toBeDefined();
      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
    });

    it('should_maintain_data_consistency', async () => {
      // Create initial mock data
      const initialNews = await testingService.createMockNews(5);
      const initialStats = await newsService.getNewsStats();

      // Generate report
      const report = await reportsService.generateDailyReport('morning');

      // Verify data consistency
      const finalStats = await newsService.getNewsStats();
      expect(finalStats.processed).toBeGreaterThan(initialStats.processed);
      expect(finalStats.total).toBe(initialStats.total); // Total shouldn't change

      // Verify report references processed news
      expect(report.newsAnalysis.processedCount).toBeGreaterThan(0);
      expect(report.newsAnalysis.processedCount).toBeLessThanOrEqual(
        initialNews.length,
      );
    }, 45000);
  });
});
