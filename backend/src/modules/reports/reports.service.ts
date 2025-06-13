import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Report } from '../../entities/report.entity';
import { NewsService } from '../news/news.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Report)
    private reportRepository: Repository<Report>,
    private newsService: NewsService,
    private llmService: LlmService,
  ) {}

  async generateDailyReport(
    type: 'morning' | 'evening' = 'morning',
  ): Promise<Report> {
    this.logger.log(`${type} 리포트 생성 시작`);

    try {
      // 1. 최신 뉴스 수집
      this.logger.log('뉴스 수집 시작...');
      await this.newsService.collectNews();

      // 2. 미처리 뉴스 가져오기
      const unprocessedNews = await this.newsService.getUnprocessedNews();
      this.logger.log(`${unprocessedNews.length}개의 미처리 뉴스 발견`);

      // 3. 뉴스 분석
      let newsAnalysis = '';
      let keyInsights = '';

      if (unprocessedNews.length > 0) {
        this.logger.log('뉴스 분석 시작...');
        newsAnalysis = await this.llmService.summarizeNews(unprocessedNews);

        // 핵심 인사이트 추출
        keyInsights = await this.extractKeyInsights(unprocessedNews, type);
      } else {
        newsAnalysis = '분석할 새로운 뉴스가 없습니다.';
        keyInsights =
          '새로운 주요 뉴스가 없어 이전 시장 동향을 기반으로 분석합니다.';
      }

      // 4. 맞춤형 투자 리포트 생성
      this.logger.log('투자 리포트 생성 시작...');
      const reportPrompt = this.createInvestmentPrompt(
        type,
        newsAnalysis,
        keyInsights,
      );
      const reportContent =
        await this.llmService.generateInvestmentAnalysis(reportPrompt);

      // 5. 요약 생성
      this.logger.log('리포트 요약 생성...');
      const summaryPrompt = this.createSummaryPrompt(reportContent, type);
      const summary =
        await this.llmService.generateInvestmentAnalysis(summaryPrompt);

      // 6. 투자 추천사항 생성
      const investmentRecommendations =
        await this.generateInvestmentRecommendations(newsAnalysis, type);

      // 7. 리포트 저장
      const report = this.reportRepository.create({
        title: this.generateTitle(type),
        content: reportContent,
        summary: summary,
        newsAnalysis: {
          processedCount: unprocessedNews.length,
          keyInsights: keyInsights,
          categories: this.getNewsCategories(unprocessedNews),
          analysisTime: new Date(),
        },
        investmentRecommendations,
        reportType: type,
      });

      const savedReport = await this.reportRepository.save(report);

      // 8. 뉴스를 처리됨으로 표시
      if (unprocessedNews.length > 0) {
        await this.newsService.markAsProcessed(
          unprocessedNews.map((n) => n.id),
        );
      }

      this.logger.log(`${type} 리포트 생성 완료: ID ${savedReport.id}`);
      return savedReport;
    } catch (error) {
      this.logger.error('리포트 생성 실패:', error);
      throw error;
    }
  }

  private generateTitle(type: 'morning' | 'evening'): string {
    const today = new Date();
    const dateStr = today.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const typeText =
      type === 'morning' ? '오전 투자 리포트' : '오후 투자 리포트';
    return `${typeText} - ${dateStr}`;
  }

  private createInvestmentPrompt(
    type: 'morning' | 'evening',
    newsAnalysis: string,
    keyInsights: string,
  ): string {
    const timeContext =
      type === 'morning'
        ? '오늘 하루의 투자 전략을 수립하기 위한'
        : '오늘의 시장 동향을 정리하고 내일 이후의 전략을 준비하기 위한';

    const specificGuidance =
      type === 'morning'
        ? `
## 오전 리포트 특별 고려사항
- 아시아 시장 마감 후 미국/유럽 시장 영향 분석
- 전날 미국 시장 마감 이후 주요 이슈 점검
- 오늘 하루 주목해야 할 경제 이벤트 및 지표 발표
- 장 시작 전 확인해야 할 주요 변동사항`
        : `
## 오후 리포트 특별 고려사항  
- 오늘 하루 시장 움직임 종합 분석
- 미국 시장 개장 전 주요 이슈 정리
- 내일 이후 단기적 주목 포인트
- 주간/월간 관점에서의 시장 동향 평가`;

    return `27세 가치 투자자를 위한 ${timeContext} 투자 리포트를 작성해주세요.

## 뉴스 분석 결과
${newsAnalysis}

## 핵심 인사이트
${keyInsights}

## 리포트 구성 요청
다음 구조로 상세한 투자 리포트를 작성해주세요:

### 📊 시장 개요
- 주요 지수 및 섹터 동향 분석 (미국, 한국, 아시아, 유럽)
- 환율 동향 (달러, 엔화, 유로 등)
- 원자재 및 에너지 시장 동향
- 거시경제 환경 종합 평가

### 📰 주요 뉴스 임팩트 분석
- 투자에 직접적 영향을 미치는 핵심 이슈
- 중앙은행 정책 및 금리 동향 영향
- 지정학적 리스크 및 글로벌 경제 이슈
- 섹터별/지역별 영향도 분석

### 💡 27세 투자자를 위한 전략적 인사이트
- **중장기 관점** (3-10년)에서의 투자 기회 발굴
- **인플레이션 헤지** 관점에서의 자산 배분 제안
- **포트폴리오 다각화** 전략 (시간, 지역, 섹터, 자산군)
- **리스크 관리** 및 안전 마진 확보 방안
- **젊은 투자자**의 장점을 활용한 장기 성장 전략

### 🎯 실행 가능한 액션 아이템
- 이번 주/이번 달 중 고려할 구체적 투자 활동
- 모니터링해야 할 핵심 지표 및 이벤트
- 포트폴리오 점검 및 조정 사항
- 리스크 체크포인트

### 🔍 장기 관점 투자 기회
- 현재 시장 상황에서 발견되는 가치 투자 기회
- 구조적 변화 트렌드 (ESG, 디지털 전환, 인구 변화 등)
- 신흥 시장 및 새로운 투자 테마 평가

${specificGuidance}

## 중요한 작성 원칙
1. **보수적 관점** 유지: 리스크를 먼저 고려하고 안전 마진 확보
2. **실용적 조언**: 27세 개인 투자자가 실제 실행 가능한 수준
3. **장기적 시각**: 단기 변동보다는 장기적 가치와 트렌드 중심
4. **균형 잡힌 분석**: 기회와 위험을 모두 객관적으로 제시
5. **교육적 가치**: 투자 결정의 근거와 논리를 명확히 설명

이 리포트를 읽는 27세 투자자가 "오늘/이번 주에 무엇을 해야 하는가?"와 "장기적으로 어떤 방향으로 나아가야 하는가?"에 대한 명확한 방향을 얻을 수 있도록 작성해주세요.`;
  }

  private createSummaryPrompt(
    reportContent: string,
    type: 'morning' | 'evening',
  ): string {
    const summaryLength = type === 'morning' ? '3-4문장' : '4-5문장';

    return `다음 투자 리포트의 핵심 내용을 27세 투자자가 빠르게 파악할 수 있도록 ${summaryLength}으로 요약해주세요.

리포트 내용:
${reportContent}

요약 요청사항:
1. 오늘의 가장 중요한 시장 이슈 1-2개
2. 27세 투자자가 주목해야 할 핵심 포인트
3. 단기적 관심사항과 장기적 관점 모두 포함
4. 실행 가능한 액션 아이템 언급

간결하면서도 투자 의사결정에 도움이 되는 핵심만 담아서 요약해주세요.`;
  }

  private async extractKeyInsights(
    newsItems: any[],
    type: 'morning' | 'evening',
  ): Promise<string> {
    const categories = this.getNewsCategories(newsItems);
    const recentCount = newsItems.filter((item) => {
      const itemDate = new Date(item.publishedAt);
      const hoursAgo = (Date.now() - itemDate.getTime()) / (1000 * 60 * 60);
      return hoursAgo <= 12; // 최근 12시간 내 뉴스
    }).length;

    const prompt = `다음 뉴스 데이터를 기반으로 27세 가치 투자자가 알아야 할 핵심 인사이트 3-4개를 간단히 정리해주세요:

뉴스 개수: ${newsItems.length}개
최근 12시간 내 뉴스: ${recentCount}개
주요 카테고리: ${categories.join(', ')}

뉴스 목록:
${newsItems
  .slice(0, 10)
  .map((item) => `- ${item.title} (${item.source})`)
  .join('\n')}

각 인사이트는 한 문장으로 요약하고, 투자 관점에서 중요한 이유를 간단히 설명해주세요.`;

    return this.llmService.generateInvestmentAnalysis(prompt);
  }

  private async generateInvestmentRecommendations(
    newsAnalysis: string,
    type: 'morning' | 'evening',
  ): Promise<any> {
    const prompt = `다음 뉴스 분석을 바탕으로 27세 가치 투자자를 위한 구체적인 투자 추천사항을 작성해주세요:

${newsAnalysis}

다음 형태로 구조화된 추천사항을 제공해주세요:

1. **단기 관심 영역** (1-3개월): 현재 시장 상황에서 주목할 섹터나 테마
2. **중기 투자 기회** (6개월-2년): 구조적 변화를 활용한 투자 기회  
3. **장기 핵심 전략** (3년+): 27세 투자자의 장기 자산 형성 전략
4. **리스크 관리**: 현재 주의해야 할 리스크 요인들
5. **포트폴리오 배분 가이드**: 연령대에 맞는 자산 배분 제안

각 항목은 구체적이고 실행 가능한 수준으로 작성해주세요.`;

    const recommendations =
      await this.llmService.generateInvestmentAnalysis(prompt);

    return {
      generatedAt: new Date(),
      reportType: type,
      content: recommendations,
      riskLevel: 'conservative', // 27세 가치투자자 기본 성향
      timeHorizon: 'long-term',
    };
  }

  private getNewsCategories(newsItems: any[]): string[] {
    const categories = new Set<string>();
    newsItems.forEach((item) => {
      if (item.category) categories.add(item.category);
      if (item.tags && Array.isArray(item.tags)) {
        item.tags.slice(0, 3).forEach((tag) => categories.add(tag)); // 상위 3개 태그만
      }
    });
    return Array.from(categories).slice(0, 8); // 최대 8개 카테고리
  }

  async getReports(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ reports: Report[]; total: number }> {
    const [reports, total] = await this.reportRepository.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { reports, total };
  }

  async getReportById(id: number): Promise<Report | null> {
    const report = await this.reportRepository.findOne({ where: { id } });
    return report || null;
  }

  async getReportsByDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Report[]> {
    return this.reportRepository.find({
      where: {
        createdAt: Between(startDate, endDate),
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getReportsByDate(date: Date): Promise<Report[]> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.getReportsByDateRange(startOfDay, endOfDay);
  }

  async getReportsStats(): Promise<any> {
    const total = await this.reportRepository.count();
    const morningReports = await this.reportRepository.count({
      where: { reportType: 'morning' },
    });
    const eveningReports = await this.reportRepository.count({
      where: { reportType: 'evening' },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayReports = await this.reportRepository.count({
      where: {
        createdAt: Between(today, tomorrow),
      },
    });

    const latest = await this.reportRepository.findOne({
      order: { createdAt: 'DESC' },
    });

    return {
      total,
      morningReports,
      eveningReports,
      todayReports,
      latestReportTime: latest?.createdAt,
      statsTime: new Date(),
    };
  }
}
