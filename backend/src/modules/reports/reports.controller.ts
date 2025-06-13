import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  ParseIntPipe,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { SchedulerService } from './scheduler.service';
import { Report } from '../../entities/report.entity';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly schedulerService: SchedulerService,
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

  @Post('generate/:type')
  async generateReport(
    @Param('type') type: 'morning' | 'evening',
  ): Promise<any> {
    if (type !== 'morning' && type !== 'evening') {
      throw new BadRequestException(
        '리포트 타입은 morning 또는 evening이어야 합니다.',
      );
    }
    return this.schedulerService.generateManualReport(type);
  }
}
