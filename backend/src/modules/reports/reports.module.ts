import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SchedulerService } from './scheduler.service';
import { Report } from '../../entities/report.entity';
import { NewsModule } from '../news/news.module';
import { LlmModule } from '../llm/llm.module';

@Module({
  imports: [TypeOrmModule.forFeature([Report]), NewsModule, LlmModule],
  controllers: [ReportsController],
  providers: [ReportsService, SchedulerService],
  exports: [ReportsService, SchedulerService],
})
export class ReportsModule {}
