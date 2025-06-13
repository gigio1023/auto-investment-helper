import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  getHello(): string {
    return 'Investment Helper API is running!';
  }

  async getHealthStatus(): Promise<any> {
    const healthStatus = {
      status: 'ok',
      info: {},
      details: {},
    };

    // Database 상태 체크
    try {
      await this.dataSource.query('SELECT 1');
      healthStatus.info['database'] = { status: 'up' };
      healthStatus.details['database'] = { status: 'up' };
    } catch (error) {
      healthStatus.status = 'error';
      healthStatus.info['database'] = { status: 'down' };
      healthStatus.details['database'] = {
        status: 'down',
        error: error.message,
      };
    }

    // AI 서비스 (Gemini) 상태 체크
    const geminiKey = this.configService.get('GEMINI_API_KEY');
    if (geminiKey) {
      try {
        // 간단한 API 키 유효성 체크 (실제 요청 없이)
        healthStatus.info['gemini'] = { status: 'up' };
        healthStatus.details['gemini'] = {
          status: 'up',
          configured: true,
        };
      } catch (error) {
        healthStatus.status = 'error';
        healthStatus.info['gemini'] = { status: 'down' };
        healthStatus.details['gemini'] = {
          status: 'down',
          error: error.message,
        };
      }
    } else {
      healthStatus.status = 'error';
      healthStatus.info['gemini'] = { status: 'down' };
      healthStatus.details['gemini'] = {
        status: 'down',
        error: 'API key not configured',
      };
    }

    return healthStatus;
  }
}
