import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReportsService } from './reports.service';
import { Report } from '../../entities/report.entity';
import { NewsService } from '../news/news.service';
import { LlmService } from '../llm/llm.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let repository: Repository<Report>;
  let newsService: NewsService;
  let llmService: LlmService;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
  };

  const mockNewsService = {
    collectNews: jest.fn(),
    getUnprocessedNews: jest.fn(),
    markAsProcessed: jest.fn(),
  };

  const mockLlmService = {
    summarizeNews: jest.fn(),
    generateInvestmentAnalysis: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        {
          provide: getRepositoryToken(Report),
          useValue: mockRepository,
        },
        {
          provide: NewsService,
          useValue: mockNewsService,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    repository = module.get<Repository<Report>>(getRepositoryToken(Report));
    newsService = module.get<NewsService>(NewsService);
    llmService = module.get<LlmService>(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateDailyReport', () => {
    it('should generate morning report successfully', async () => {
      const mockNews = [
        {
          id: 1,
          title: '테스트 뉴스',
          content: '테스트 내용',
          url: 'https://test.com',
          source: '테스트 소스',
          publishedAt: new Date(),
          processed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockReport = {
        id: 1,
        title: '오전 투자 리포트 - 2024년 12월 6일',
        content: '테스트 리포트 내용',
        summary: '테스트 요약',
        reportType: 'morning' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNewsService.collectNews.mockResolvedValue(undefined);
      mockNewsService.getUnprocessedNews.mockResolvedValue(mockNews);
      mockLlmService.summarizeNews.mockResolvedValue('뉴스 분석 결과');
      mockLlmService.generateInvestmentAnalysis.mockResolvedValue(
        '투자 분석 결과',
      );
      mockRepository.create.mockReturnValue(mockReport);
      mockRepository.save.mockResolvedValue(mockReport);
      mockNewsService.markAsProcessed.mockResolvedValue(undefined);

      const result = await service.generateDailyReport('morning');

      expect(result).toEqual(mockReport);
      expect(mockNewsService.collectNews).toHaveBeenCalled();
      expect(mockNewsService.getUnprocessedNews).toHaveBeenCalled();
      expect(mockLlmService.summarizeNews).toHaveBeenCalledWith(mockNews);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockNewsService.markAsProcessed).toHaveBeenCalledWith([1]);
    });

    it('should handle empty news gracefully', async () => {
      const mockReport = {
        id: 1,
        title: '오전 투자 리포트 - 2024년 12월 6일',
        content: '새로운 주요 뉴스가 없습니다.',
        summary: '테스트 요약',
        reportType: 'morning' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNewsService.collectNews.mockResolvedValue(undefined);
      mockNewsService.getUnprocessedNews.mockResolvedValue([]);
      mockLlmService.generateInvestmentAnalysis.mockResolvedValue(
        '투자 분석 결과',
      );
      mockRepository.create.mockReturnValue(mockReport);
      mockRepository.save.mockResolvedValue(mockReport);

      const result = await service.generateDailyReport('morning');

      expect(result).toEqual(mockReport);
      expect(mockLlmService.summarizeNews).not.toHaveBeenCalled();
    });
  });

  describe('getReports', () => {
    it('should return paginated reports', async () => {
      const mockReports = [
        {
          id: 1,
          title: '테스트 리포트',
          content: '테스트 내용',
          summary: '테스트 요약',
          reportType: 'morning' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.findAndCount.mockResolvedValue([mockReports, 1]);

      const result = await service.getReports(1, 10);

      expect(result).toEqual({
        reports: mockReports,
        total: 1,
      });
      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });
  });

  describe('getReportById', () => {
    it('should return report by id', async () => {
      const mockReport = {
        id: 1,
        title: '테스트 리포트',
        content: '테스트 내용',
        summary: '테스트 요약',
        reportType: 'morning' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(mockReport);

      const result = await service.getReportById(1);

      expect(result).toEqual(mockReport);
      expect(mockRepository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should return null for non-existent report', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.getReportById(999);

      expect(result).toBeNull();
    });
  });

  describe('getReportsByDate', () => {
    it('should return reports for specific date', async () => {
      const testDate = new Date('2024-12-06');
      const mockReports = [
        {
          id: 1,
          title: '테스트 리포트',
          content: '테스트 내용',
          summary: '테스트 요약',
          reportType: 'morning' as const,
          createdAt: testDate,
          updatedAt: testDate,
        },
      ];

      mockRepository.find.mockResolvedValue(mockReports);

      const result = await service.getReportsByDate(testDate);

      expect(result).toEqual(mockReports);
      expect(mockRepository.find).toHaveBeenCalled();
    });
  });
});
