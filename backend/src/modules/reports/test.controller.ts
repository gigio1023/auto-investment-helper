import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Logger,
} from '@nestjs/common';
import { TestingService } from './testing.service';

@Controller('test')
export class TestController {
  private readonly logger = new Logger(TestController.name);

  constructor(private readonly testingService: TestingService) {}

  @Get('health')
  async getSystemHealth() {
    return this.testingService.getSystemHealth();
  }

  @Get('suites')
  async getAvailableTestSuites(): Promise<{
    suites: string[];
    descriptions: Record<string, string>;
  }> {
    const suites = await this.testingService.getAvailableTestSuites();

    const descriptions = {
      'news-collection': 'Test news collection from various RSS sources',
      'report-generation': 'Test report generation with different scenarios',
      integration: 'End-to-end integration testing of the complete pipeline',
    };

    return {
      suites,
      descriptions,
    };
  }

  @Post('suites/:suiteName/run')
  async runTestSuite(@Param('suiteName') suiteName: string) {
    this.logger.log(`🧪 Running test suite: ${suiteName}`);
    return this.testingService.runTestSuite(suiteName);
  }

  @Post('data/mock-news')
  async createMockNews(@Body() body: { count?: number } = {}): Promise<{
    success: boolean;
    created: number;
    message: string;
  }> {
    const count = body.count || 5;
    const news = await this.testingService.createMockNews(count);

    return {
      success: true,
      created: news.length,
      message: `Created ${news.length} mock news items for testing`,
    };
  }

  @Delete('data/cleanup')
  async cleanupTestData(): Promise<{
    success: boolean;
    message: string;
  }> {
    await this.testingService.cleanupTestData();

    return {
      success: true,
      message: 'Test data cleaned up successfully',
    };
  }

  @Get('scenarios')
  async getTestScenarios(): Promise<{
    scenarios: Array<{
      suite: string;
      name: string;
      description: string;
      expectedOutcome: string;
    }>;
  }> {
    // This would ideally be extracted from the TestingService
    // For now, we'll return a static list
    const scenarios = [
      {
        suite: 'news-collection',
        name: 'collect-news-basic',
        description: 'Test basic news collection functionality',
        expectedOutcome: 'News should be collected and stored in database',
      },
      {
        suite: 'news-collection',
        name: 'news-processing-speed',
        description: 'Test news processing performance',
        expectedOutcome:
          'News collection should complete within reasonable time',
      },
      {
        suite: 'report-generation',
        name: 'morning-report-generation',
        description: 'Test morning report generation',
        expectedOutcome:
          'Morning report should be generated with proper content',
      },
      {
        suite: 'report-generation',
        name: 'evening-report-generation',
        description: 'Test evening report generation',
        expectedOutcome:
          'Evening report should be generated with proper content',
      },
      {
        suite: 'report-generation',
        name: 'report-with-no-news',
        description: 'Test report generation when no new news is available',
        expectedOutcome: 'Report should be generated with default content',
      },
      {
        suite: 'integration',
        name: 'full-pipeline-test',
        description:
          'Test complete pipeline from news collection to report generation',
        expectedOutcome: 'Complete pipeline should work without errors',
      },
    ];

    return { scenarios };
  }

  @Get('admin/test')
  healthCheck(): string {
    return 'Test controller is working';
  }
}
