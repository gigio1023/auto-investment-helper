import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { TestController } from './test.controller';
import { ReportsService } from './reports.service';
import { SchedulerService } from './scheduler.service';
import { TestingService } from './testing.service';
import { Report } from '../../entities/report.entity';
import { NewsSource } from '../../entities/news-source.entity';
import { NewsModule } from '../news/news.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Report, NewsSource]),
    NewsModule,
    LlmModule,
  ],
  controllers: [ReportsController, TestController],
  providers: [ReportsService, SchedulerService, TestingService],
  exports: [ReportsService, SchedulerService, TestingService],
})
export class ReportsModule {}
