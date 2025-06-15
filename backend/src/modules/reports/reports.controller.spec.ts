import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SchedulerService } from './scheduler.service';

describe('ReportsController', () => {
  let controller: ReportsController;
  let service: ReportsService;
  let schedulerService: SchedulerService;

  const mockReportsService = {
    getReports: jest.fn(),
    getReportById: jest.fn(),
    getReportsByDate: jest.fn(),
    getReportsStats: jest.fn(),
  };

  const mockSchedulerService = {
    getSchedulerStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        {
          provide: ReportsService,
          useValue: mockReportsService,
        },
        {
          provide: SchedulerService,
          useValue: mockSchedulerService,
        },
      ],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
    service = module.get<ReportsService>(ReportsService);
    schedulerService = module.get<SchedulerService>(SchedulerService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getReports', () => {
    it('should return paginated reports', async () => {
      const mockResponse = {
        reports: [
          {
            id: 1,
            title: '테스트 리포트',
            content: '테스트 내용',
            summary: '테스트 요약',
            reportType: 'morning' as const,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        total: 1,
      };

      mockReportsService.getReports.mockResolvedValue(mockResponse);

      const result = await controller.getReports('1', '10');

      expect(result).toEqual({
        ...mockResponse,
        page: 1,
        limit: 10,
      });
      expect(service.getReports).toHaveBeenCalledWith(1, 10);
    });

    it('should use default pagination values', async () => {
      const mockResponse = {
        reports: [],
        total: 0,
      };

      mockReportsService.getReports.mockResolvedValue(mockResponse);

      const result = await controller.getReports('1', '10');

      expect(service.getReports).toHaveBeenCalledWith(1, 10);
    });
  });

  describe('getReport', () => {
    it('should return specific report', async () => {
      const mockReport = {
        id: 1,
        title: '테스트 리포트',
        content: '테스트 내용',
        summary: '테스트 요약',
        reportType: 'morning' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockReportsService.getReportById.mockResolvedValue(mockReport);

      const result = await controller.getReport(1);

      expect(result).toEqual(mockReport);
      expect(service.getReportById).toHaveBeenCalledWith(1);
    });
  });

  describe('getReportsByDate', () => {
    it('should return reports for specific date', async () => {
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

      mockReportsService.getReportsByDate.mockResolvedValue(mockReports);

      const result = await controller.getReportsByDate('2024-12-06');

      expect(result).toEqual(mockReports);
      expect(service.getReportsByDate).toHaveBeenCalledWith(
        new Date('2024-12-06'),
      );
    });
  });

  describe('getSchedulerStatus', () => {
    it('should return scheduler status', async () => {
      const mockStatus = {
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
        timezone: 'Asia/Seoul',
        currentTime: new Date(),
      };

      mockSchedulerService.getSchedulerStatus.mockReturnValue(mockStatus);

      const result = await controller.getSchedulerStatus();

      expect(result).toEqual(mockStatus);
      expect(schedulerService.getSchedulerStatus).toHaveBeenCalled();
    });
  });
});
