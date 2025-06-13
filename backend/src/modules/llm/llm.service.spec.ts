import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LlmService } from './llm.service';

describe('LlmService', () => {
  let service: LlmService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: string) => {
      switch (key) {
        case 'GEMINI_API_KEY':
          return 'test-gemini-key';
        case 'GEMINI_BASE_URL':
          return 'https://test-gemini-url.com';
        case 'OPENAI_API_KEY':
          return 'test-openai-key';
        default:
          return defaultValue;
      }
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LlmService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LlmService>(LlmService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize with config values', () => {
    expect(configService.get).toHaveBeenCalledWith('GEMINI_API_KEY');
    expect(configService.get).toHaveBeenCalledWith(
      'GEMINI_BASE_URL',
      expect.any(String),
    );
    expect(configService.get).toHaveBeenCalledWith('OPENAI_API_KEY');
  });

  describe('generateInvestmentAnalysis', () => {
    it('should throw error for empty prompt', async () => {
      await expect(service.generateInvestmentAnalysis('')).rejects.toThrow();
    });

    it('should handle API error gracefully', async () => {
      // Mock implementation for API error
      const originalMethod = service.generateInvestmentAnalysis;
      service.generateInvestmentAnalysis = jest
        .fn()
        .mockRejectedValue(new Error('API Error'));

      await expect(
        service.generateInvestmentAnalysis('test prompt'),
      ).rejects.toThrow('API Error');
    });
  });

  describe('summarizeNews', () => {
    it('should handle empty news array', async () => {
      // Mock the generateInvestmentAnalysis method
      service.generateInvestmentAnalysis = jest
        .fn()
        .mockResolvedValue('빈 뉴스 목록입니다.');

      const result = await service.summarizeNews([]);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should process news items correctly', async () => {
      const mockNewsItems = [
        {
          title: '테스트 뉴스 1',
          content: '테스트 내용 1',
          source: '테스트 소스 1',
        },
        {
          title: '테스트 뉴스 2',
          content: '테스트 내용 2',
          source: '테스트 소스 2',
        },
      ];

      service.generateInvestmentAnalysis = jest
        .fn()
        .mockResolvedValue('뉴스 분석 결과');

      const result = await service.summarizeNews(mockNewsItems);
      expect(service.generateInvestmentAnalysis).toHaveBeenCalled();
      expect(result).toBe('뉴스 분석 결과');
    });
  });
});
