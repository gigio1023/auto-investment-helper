import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NewsService } from './news.service';
import { NewsSource } from '../../entities/news-source.entity';

describe('NewsService', () => {
  let service: NewsService;
  let repository: Repository<NewsSource>;

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    findAndCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NewsService,
        {
          provide: getRepositoryToken(NewsSource),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<NewsService>(NewsService);
    repository = module.get<Repository<NewsSource>>(
      getRepositoryToken(NewsSource),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUnprocessedNews', () => {
    it('should return unprocessed news', async () => {
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

      mockRepository.find.mockResolvedValue(mockNews);

      const result = await service.getUnprocessedNews();
      expect(result).toEqual(mockNews);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { processed: false },
        order: { publishedAt: 'DESC' },
        take: 25,
      });
    });
  });

  describe('markAsProcessed', () => {
    it('should mark news as processed', async () => {
      const ids = [1, 2, 3];
      mockRepository.update.mockResolvedValue({ affected: 3 });

      await service.markAsProcessed(ids);
      expect(mockRepository.update).toHaveBeenCalledWith(ids, {
        processed: true,
      });
    });
  });

  describe('getRecentNews', () => {
    it('should return recent news within specified days', async () => {
      const mockNews = [
        {
          id: 1,
          title: '최근 뉴스',
          content: '최근 내용',
          url: 'https://recent.com',
          source: '최근 소스',
          publishedAt: new Date(),
          processed: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.find.mockResolvedValue(mockNews);

      const result = await service.getRecentNews(1);
      expect(result).toEqual(mockNews);
      expect(mockRepository.find).toHaveBeenCalled();
    });
  });

  describe('extractTags', () => {
    it('should extract relevant investment tags', () => {
      const text =
        '주식 시장이 상승하고 있으며 달러 환율이 변동하고 있습니다. 비트코인 가격도 주목받고 있습니다.';

      // Private method이므로 reflection을 사용하여 테스트
      const result = (service as any).extractTags(text);

      expect(result).toContain('주식');
      expect(result).toContain('달러');
      expect(result).toContain('비트코인');
    });
  });

  describe('cleanContent', () => {
    it('should clean HTML content and limit length', () => {
      const htmlContent =
        '<p>테스트 <strong>내용</strong>입니다.</p><script>alert("test")</script>';

      const result = (service as any).cleanContent(htmlContent);

      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<strong>');
      expect(result).not.toContain('<script>');
      expect(result).toContain('테스트');
      expect(result).toContain('내용');
    });
  });
});
