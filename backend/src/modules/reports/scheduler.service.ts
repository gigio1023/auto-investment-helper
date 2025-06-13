import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportsService } from './reports.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(private readonly reportsService: ReportsService) {}

  // 매일 오전 8시 모닝 리포트 생성 (한국 시간)
  @Cron('0 8 * * *', {
    name: 'morning-report',
    timeZone: 'Asia/Seoul',
  })
  async generateMorningReport() {
    this.logger.log('📅 오전 8시 - 모닝 리포트 자동 생성 스케줄 시작');
    try {
      const startTime = Date.now();

      const report = await this.reportsService.generateDailyReport('morning');

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.logger.log(
        `✅ 모닝 리포트 생성 완료 (${duration}초 소요) - ID: ${report.id}`,
      );

      // 성공 알림 (향후 이메일이나 슬랙 알림으로 확장 가능)
      this.notifyReportGenerated('morning', report.id, duration);
    } catch (error) {
      this.logger.error('❌ 모닝 리포트 생성 실패:', error);
      this.notifyReportFailed('morning', error);
    }
  }

  // 매일 오후 6시 이브닝 리포트 생성 (한국 시간)
  @Cron('0 18 * * *', {
    name: 'evening-report',
    timeZone: 'Asia/Seoul',
  })
  async generateEveningReport() {
    this.logger.log('📅 오후 6시 - 이브닝 리포트 자동 생성 스케줄 시작');
    try {
      const startTime = Date.now();

      const report = await this.reportsService.generateDailyReport('evening');

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.logger.log(
        `✅ 이브닝 리포트 생성 완료 (${duration}초 소요) - ID: ${report.id}`,
      );

      this.notifyReportGenerated('evening', report.id, duration);
    } catch (error) {
      this.logger.error('❌ 이브닝 리포트 생성 실패:', error);
      this.notifyReportFailed('evening', error);
    }
  }

  // 추가 리포트 생성 옵션 - 매일 정오 12시 (선택적)
  @Cron('0 12 * * *', {
    name: 'midday-report',
    timeZone: 'Asia/Seoul',
  })
  async generateMiddayReport() {
    // 기본적으로는 비활성화, 필요시 활성화
    // 사용자가 "하루 2회 이상" 요청했으므로 옵션으로 제공

    // 환경 변수로 제어
    const enableMiddayReport = process.env.ENABLE_MIDDAY_REPORT === 'true';

    if (!enableMiddayReport) {
      this.logger.debug(
        '정오 리포트는 비활성화 상태입니다. ENABLE_MIDDAY_REPORT=true로 설정하여 활성화할 수 있습니다.',
      );
      return;
    }

    this.logger.log('📅 정오 12시 - 중간 리포트 자동 생성 스케줄 시작');
    try {
      const startTime = Date.now();

      // 정오 리포트는 morning 타입으로 생성하되 제목만 다르게
      const report = await this.reportsService.generateDailyReport('morning');

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.logger.log(
        `✅ 정오 리포트 생성 완료 (${duration}초 소요) - ID: ${report.id}`,
      );

      this.notifyReportGenerated('midday', report.id, duration);
    } catch (error) {
      this.logger.error('❌ 정오 리포트 생성 실패:', error);
      this.notifyReportFailed('midday', error);
    }
  }

  // 주간 시장 전망 리포트 (매주 일요일 오후 7시)
  @Cron('0 19 * * 0', {
    name: 'weekly-outlook',
    timeZone: 'Asia/Seoul',
  })
  async generateWeeklyOutlook() {
    const enableWeeklyReport = process.env.ENABLE_WEEKLY_REPORT === 'true';

    if (!enableWeeklyReport) {
      this.logger.debug('주간 리포트는 비활성화 상태입니다.');
      return;
    }

    this.logger.log('📅 일요일 저녁 - 주간 시장 전망 리포트 생성');
    try {
      const startTime = Date.now();

      // 주간 리포트는 evening 타입으로 생성
      const report = await this.reportsService.generateDailyReport('evening');

      const duration = Math.round((Date.now() - startTime) / 1000);
      this.logger.log(
        `✅ 주간 전망 리포트 생성 완료 (${duration}초 소요) - ID: ${report.id}`,
      );

      this.notifyReportGenerated('weekly', report.id, duration);
    } catch (error) {
      this.logger.error('❌ 주간 전망 리포트 생성 실패:', error);
      this.notifyReportFailed('weekly', error);
    }
  }

  // 뉴스 수집만 별도로 수행 (매 2시간마다)
  @Cron('0 */2 * * *', {
    name: 'news-collection-only',
  })
  async collectNewsOnly() {
    const enableNewsCollection =
      process.env.ENABLE_PERIODIC_NEWS_COLLECTION === 'true';

    if (!enableNewsCollection) {
      return; // 조용히 스킵
    }

    this.logger.log('📰 정기 뉴스 수집 시작');
    try {
      // ReportsService를 통해 NewsService에 접근
      // 실제로는 NewsService를 직접 주입받아 사용하는 것이 더 좋지만
      // 현재 구조에서는 ReportsService를 통해 접근

      // 향후 개선: NewsService를 직접 주입받아서 사용
      this.logger.log('정기 뉴스 수집은 리포트 생성 시에만 수행됩니다.');
    } catch (error) {
      this.logger.error('정기 뉴스 수집 실패:', error);
    }
  }

  // 수동 리포트 생성 (API 호출 시 사용)
  async generateManualReport(type: 'morning' | 'evening'): Promise<any> {
    this.logger.log(`🔧 수동 ${type} 리포트 생성 요청`);

    try {
      const startTime = Date.now();
      const report = await this.reportsService.generateDailyReport(type);
      const duration = Math.round((Date.now() - startTime) / 1000);

      this.logger.log(
        `✅ 수동 ${type} 리포트 생성 완료 (${duration}초 소요) - ID: ${report.id}`,
      );

      return {
        success: true,
        report,
        duration,
        generatedAt: new Date(),
        type: 'manual',
      };
    } catch (error) {
      this.logger.error(`❌ 수동 ${type} 리포트 생성 실패:`, error);
      throw error;
    }
  }

  // 리포트 생성 성공 알림
  private notifyReportGenerated(
    type: string,
    reportId: number,
    duration: number,
  ) {
    const message = `${type.toUpperCase()} 리포트 생성 완료 - ID: ${reportId}, 소요시간: ${duration}초`;

    // 향후 확장 가능한 알림 시스템
    // - 이메일 알림
    // - 슬랙 알림
    // - 웹훅 호출
    // - 푸시 알림 등

    this.logger.log(`📬 ${message}`);

    // 환경 변수로 알림 방식 제어 가능
    if (process.env.NOTIFICATION_WEBHOOK_URL) {
      this.sendWebhookNotification({
        type: 'success',
        reportType: type,
        reportId,
        duration,
        timestamp: new Date(),
      });
    }
  }

  // 리포트 생성 실패 알림
  private notifyReportFailed(type: string, error: any) {
    const message = `${type.toUpperCase()} 리포트 생성 실패 - 오류: ${error.message}`;

    this.logger.error(`🚨 ${message}`);

    if (process.env.NOTIFICATION_WEBHOOK_URL) {
      this.sendWebhookNotification({
        type: 'error',
        reportType: type,
        error: error.message,
        timestamp: new Date(),
      });
    }
  }

  // 웹훅 알림 전송 (향후 구현)
  private async sendWebhookNotification(data: any) {
    try {
      // 실제 웹훅 구현은 향후 추가
      this.logger.debug('웹훅 알림 전송:', JSON.stringify(data));
    } catch (error) {
      this.logger.error('웹훅 알림 전송 실패:', error);
    }
  }

  // 스케줄러 상태 확인
  getSchedulerStatus() {
    return {
      morningReport: {
        schedule: '매일 오전 8시 (KST)',
        cron: '0 8 * * *',
        enabled: true,
      },
      eveningReport: {
        schedule: '매일 오후 6시 (KST)',
        cron: '0 18 * * *',
        enabled: true,
      },
      middayReport: {
        schedule: '매일 정오 12시 (KST)',
        cron: '0 12 * * *',
        enabled: process.env.ENABLE_MIDDAY_REPORT === 'true',
      },
      weeklyOutlook: {
        schedule: '매주 일요일 오후 7시 (KST)',
        cron: '0 19 * * 0',
        enabled: process.env.ENABLE_WEEKLY_REPORT === 'true',
      },
      timezone: 'Asia/Seoul',
      currentTime: new Date(),
    };
  }
}
