import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { NewsSource } from '../../entities/news-source.entity';
import * as Parser from 'rss-parser';
import axios from 'axios';
import * as cheerio from 'cheerio';

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private parser = new Parser({
    timeout: 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Investment-Helper/1.0)',
    },
  });

  constructor(
    @InjectRepository(NewsSource)
    private newsRepository: Repository<NewsSource>,
  ) {}

  async collectNews(): Promise<void> {
    this.logger.log('다양한 국제 뉴스 수집 시작');

    const sources = [
      // 한국 경제 뉴스 (가장 안정적인 것들만)
      {
        name: '연합뉴스 경제',
        url: 'https://www.yna.co.kr/rss/economy.xml',
        type: 'rss',
        category: 'korean',
      },
      {
        name: '매일경제',
        url: 'https://www.mk.co.kr/rss/30000001/',
        type: 'rss',
        category: 'korean',
      },

      // 글로벌 중앙은행 & 정책 (테스트 안정성을 위해 간소화)
      {
        name: 'Federal Reserve News',
        url: 'https://www.federalreserve.gov/feeds/press_all.xml',
        type: 'rss',
        category: 'central_bank',
      },

      // 테스트용 간단한 피드 추가 (실패 시에도 전체 시스템이 동작하도록)
      {
        name: 'BBC Business',
        url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
        type: 'rss',
        category: 'international',
      },
    ];

    let totalCollected = 0;
    let successCount = 0;

    for (const source of sources) {
      try {
        const collected = await this.collectFromRSS(
          source.url,
          source.name,
          source.category,
        );
        totalCollected += collected;
        successCount++;

        // API 요청 간 간격 (너무 빠른 요청 방지)
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        this.logger.error(`${source.name} 뉴스 수집 실패:`, error.message);
      }
    }

    this.logger.log(
      `뉴스 수집 완료: ${successCount}/${sources.length} 소스에서 ${totalCollected}개 뉴스 수집`,
    );
  }

  private async collectFromRSS(
    url: string,
    sourceName: string,
    category: string,
  ): Promise<number> {
    try {
      this.logger.debug(`${sourceName} RSS 수집 시작: ${url}`);

      const feed = await this.parser.parseURL(url);
      let collectedCount = 0;

      // 최신 뉴스 15개만 처리 (너무 많은 데이터 방지)
      const items = feed.items.slice(0, 15);

      for (const item of items) {
        if (!item.link || !item.title) continue;

        // 중복 확인
        const existingNews = await this.newsRepository.findOne({
          where: { url: item.link },
        });

        if (!existingNews) {
          // 뉴스 내용 추출 및 정제
          let content = this.cleanContent(
            item.contentSnippet || item.content || item.summary || '',
          );

          // 내용이 너무 짧으면 제목과 요약을 합쳐서 사용
          if (content.length < 50) {
            content = `${item.title}. ${content}`;
          }

          const newsSource = this.newsRepository.create({
            title: this.cleanText(item.title),
            content: content.slice(0, 2000), // 최대 2000자로 제한
            url: item.link,
            source: sourceName,
            publishedAt: new Date(item.pubDate || item.isoDate || Date.now()),
            tags: this.extractTags(item.title + ' ' + content, category),
            processed: false,
            category: category, // 카테고리 추가
          });

          await this.newsRepository.save(newsSource);
          collectedCount++;
          this.logger.debug(`새 뉴스 저장: ${item.title.slice(0, 50)}...`);
        }
      }

      this.logger.log(`${sourceName}: ${collectedCount}개 새 뉴스 수집`);
      return collectedCount;
    } catch (error) {
      this.logger.error(`RSS 수집 실패 (${sourceName}):`, error.message);
      return 0;
    }
  }

  private cleanContent(content: string): string {
    if (!content) return '';

    // HTML 태그 제거
    const $ = cheerio.load(content);
    let cleanText = $.text();

    // 불필요한 문자 정리
    cleanText = cleanText
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/\t+/g, ' ')
      .trim();

    return cleanText;
  }

  private cleanText(text: string): string {
    if (!text) return '';
    return text
      .replace(/\s+/g, ' ')
      .replace(/[\r\n\t]/g, ' ')
      .trim();
  }

  private extractTags(text: string, category: string): string[] {
    const investmentKeywords = [
      // 주식 관련
      '주식',
      'stock',
      'equity',
      '상장',
      'IPO',
      '배당',
      'dividend',

      // 채권 관련
      '채권',
      'bond',
      '국채',
      '회사채',
      '수익률',
      'yield',

      // 통화 관련
      '달러',
      '유로',
      '엔화',
      '원화',
      '위안',
      '환율',
      'currency',
      'exchange rate',

      // 금리 관련
      '금리',
      'interest rate',
      '기준금리',
      'base rate',
      '연준',
      'Fed',
      'ECB',
      '한국은행',

      // 경제 지표
      '인플레이션',
      'inflation',
      'CPI',
      'GDP',
      '고용',
      'employment',
      '실업률',

      // 지역별
      '미국',
      '중국',
      '유럽',
      '일본',
      '한국',
      '아시아',
      '신흥국',

      // 섹터별
      '기술주',
      'tech',
      '금융주',
      'financial',
      '에너지',
      'energy',
      '헬스케어',
      'healthcare',
      '부동산',
      'real estate',
      '소비재',
      'consumer',
      '산업재',
      'industrial',

      // 원자재
      '금',
      'gold',
      '은',
      'silver',
      '구리',
      'copper',
      '석유',
      'oil',
      '가스',
      'gas',

      // 암호화폐
      '비트코인',
      'bitcoin',
      '이더리움',
      'ethereum',
      '암호화폐',
      'crypto',

      // 투자 관련
      '펀드',
      'fund',
      'ETF',
      '포트폴리오',
      'portfolio',
      '리스크',
      'risk',
    ];

    const foundTags = investmentKeywords.filter((keyword) =>
      text.toLowerCase().includes(keyword.toLowerCase()),
    );

    // 카테고리 태그 추가
    foundTags.push(category);

    return [...new Set(foundTags)]; // 중복 제거
  }

  async getUnprocessedNews(): Promise<NewsSource[]> {
    return this.newsRepository.find({
      where: { processed: false },
      order: { publishedAt: 'DESC' },
      take: 25, // 한 번에 처리할 뉴스 수 증가
    });
  }

  async markAsProcessed(ids: number[]): Promise<void> {
    if (ids.length > 0) {
      await this.newsRepository.update(ids, { processed: true });
      this.logger.log(`${ids.length}개 뉴스를 처리 완료로 표시`);
    }
  }

  async getRecentNews(hours: number = 24): Promise<NewsSource[]> {
    const since = new Date();
    since.setHours(since.getHours() - hours);

    return this.newsRepository.find({
      where: {
        publishedAt: MoreThan(since),
      },
      order: { publishedAt: 'DESC' },
      take: 50,
    });
  }

  async getNewsByCategory(category: string): Promise<NewsSource[]> {
    return this.newsRepository.find({
      where: { category },
      order: { publishedAt: 'DESC' },
      take: 10,
    });
  }

  async getNewsStats(): Promise<any> {
    const total = await this.newsRepository.count();
    const processed = await this.newsRepository.count({
      where: { processed: true },
    });
    const unprocessed = await this.newsRepository.count({
      where: { processed: false },
    });

    const recent24h = await this.newsRepository.count({
      where: {
        publishedAt: MoreThan(new Date(Date.now() - 24 * 60 * 60 * 1000)),
      },
    });

    return {
      total,
      processed,
      unprocessed,
      recent24h,
      collectionTime: new Date(),
    };
  }
}
