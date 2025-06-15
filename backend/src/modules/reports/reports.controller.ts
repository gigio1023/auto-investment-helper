import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  ParseIntPipe,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { SchedulerService } from './scheduler.service';
import { Report } from '../../entities/report.entity';
import { NewsService } from '../news/news.service';

@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly schedulerService: SchedulerService,
    private readonly newsService: NewsService,
  ) {}

  @Get()
  async getReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    reports: Report[];
    total: number;
    page: number;
    limit: number;
  }> {
    const pageNum = page ? parseInt(page, 10) || 1 : 1;
    const limitNum = limit ? parseInt(limit, 10) || 10 : 10;
    const result = await this.reportsService.getReports(pageNum, limitNum);
    return {
      ...result,
      page: pageNum,
      limit: limitNum,
    };
  }

  @Get('stats')
  async getReportsStats(): Promise<any> {
    return this.reportsService.getReportsStats();
  }

  @Get('scheduler/status')
  async getSchedulerStatus(): Promise<any> {
    return this.schedulerService.getSchedulerStatus();
  }

  @Get(':id')
  async getReport(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Report | null> {
    return this.reportsService.getReportById(id);
  }

  @Get('date/:date')
  async getReportsByDate(@Param('date') dateString: string): Promise<Report[]> {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new BadRequestException(
        '잘못된 날짜 형식입니다. YYYY-MM-DD 형식을 사용해주세요.',
      );
    }
    return this.reportsService.getReportsByDate(date);
  }

  // === TESTING ENDPOINTS ===
  // These endpoints are for testing batch processes manually
  // Should be used in development/staging environments only

  @Post('test/generate/:type')
  async testGenerateReport(
    @Param('type') type: 'morning' | 'evening',
  ): Promise<{
    success: boolean;
    report?: Report;
    error?: string;
    metrics: {
      duration: number;
      newsProcessed: number;
      startTime: Date;
      endTime: Date;
    };
  }> {
    this.logger.log(`🧪 Test: Manual ${type} report generation started`);
    const startTime = new Date();

    try {
      if (type !== 'morning' && type !== 'evening') {
        throw new BadRequestException('Type must be "morning" or "evening"');
      }

      const report = await this.reportsService.generateDailyReport(type);
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.log(
        `✅ Test: ${type} report generated successfully in ${duration}ms`,
      );

      return {
        success: true,
        report,
        metrics: {
          duration,
          newsProcessed: report.newsAnalysis?.processedCount || 0,
          startTime,
          endTime,
        },
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error(`❌ Test: ${type} report generation failed`, error);

      return {
        success: false,
        error: error.message,
        metrics: {
          duration,
          newsProcessed: 0,
          startTime,
          endTime,
        },
      };
    }
  }

  @Post('test/news/collect')
  async testNewsCollection(): Promise<{
    success: boolean;
    stats?: any;
    error?: string;
    metrics: {
      duration: number;
      startTime: Date;
      endTime: Date;
    };
  }> {
    this.logger.log('🧪 Test: Manual news collection started');
    const startTime = new Date();

    try {
      await this.newsService.collectNews();
      const stats = await this.newsService.getNewsStats();
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.log(`✅ Test: News collection completed in ${duration}ms`);

      return {
        success: true,
        stats,
        metrics: {
          duration,
          startTime,
          endTime,
        },
      };
    } catch (error) {
      const endTime = new Date();
      const duration = endTime.getTime() - startTime.getTime();

      this.logger.error('❌ Test: News collection failed', error);

      return {
        success: false,
        error: error.message,
        metrics: {
          duration,
          startTime,
          endTime,
        },
      };
    }
  }

  @Get('test/flow/status')
  async getTestFlowStatus(): Promise<{
    news: any;
    reports: any;
    scheduler: any;
    system: {
      currentTime: Date;
      timezone: string;
      environment: string;
    };
  }> {
    const newsStats = await this.newsService.getNewsStats();
    const reportsStats = await this.reportsService.getReportsStats();
    const schedulerStatus = this.schedulerService.getSchedulerStatus();

    return {
      news: newsStats,
      reports: reportsStats,
      scheduler: schedulerStatus,
      system: {
        currentTime: new Date(),
        timezone: process.env.TZ || 'UTC',
        environment: process.env.NODE_ENV || 'development',
      },
    };
  }

  @Post('test/flow/full')
  async testFullFlow(): Promise<{
    success: boolean;
    steps: Array<{
      step: string;
      success: boolean;
      duration: number;
      result?: any;
      error?: string;
    }>;
    totalDuration: number;
    startTime: Date;
    endTime: Date;
  }> {
    this.logger.log('🧪 Test: Full flow test started');
    const startTime = new Date();
    const steps: any[] = [];

    // Step 1: News Collection
    let stepStart = Date.now();
    try {
      await this.newsService.collectNews();
      const newsStats = await this.newsService.getNewsStats();
      steps.push({
        step: 'news_collection',
        success: true,
        duration: Date.now() - stepStart,
        result: newsStats,
      });
    } catch (error) {
      steps.push({
        step: 'news_collection',
        success: false,
        duration: Date.now() - stepStart,
        error: error.message,
      });
    }

    // Step 2: Morning Report Generation
    stepStart = Date.now();
    try {
      const morningReport =
        await this.reportsService.generateDailyReport('morning');
      steps.push({
        step: 'morning_report',
        success: true,
        duration: Date.now() - stepStart,
        result: {
          id: morningReport.id,
          title: morningReport.title,
          newsProcessed: morningReport.newsAnalysis?.processedCount || 0,
        },
      });
    } catch (error) {
      steps.push({
        step: 'morning_report',
        success: false,
        duration: Date.now() - stepStart,
        error: error.message,
      });
    }

    // Step 3: Evening Report Generation
    stepStart = Date.now();
    try {
      const eveningReport =
        await this.reportsService.generateDailyReport('evening');
      steps.push({
        step: 'evening_report',
        success: true,
        duration: Date.now() - stepStart,
        result: {
          id: eveningReport.id,
          title: eveningReport.title,
          newsProcessed: eveningReport.newsAnalysis?.processedCount || 0,
        },
      });
    } catch (error) {
      steps.push({
        step: 'evening_report',
        success: false,
        duration: Date.now() - stepStart,
        error: error.message,
      });
    }

    const endTime = new Date();
    const totalDuration = endTime.getTime() - startTime.getTime();
    const allSuccessful = steps.every((step) => step.success);

    this.logger.log(
      `🧪 Test: Full flow ${allSuccessful ? 'completed' : 'failed'} in ${totalDuration}ms`,
    );

    return {
      success: allSuccessful,
      steps,
      totalDuration,
      startTime,
      endTime,
    };
  }

  @Get('admin/test')
  healthCheck(): string {
    return 'Reports controller is working';
  }
}
