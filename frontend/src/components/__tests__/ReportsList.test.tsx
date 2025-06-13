import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ReportsList from '../ReportsList';
import { reportsApi } from '../../services/api';

// Mock the API
jest.mock('../../services/api');
const mockedReportsApi = reportsApi as jest.Mocked<typeof reportsApi>;

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

const mockReports = [
  {
    id: 1,
    title: '오전 투자 리포트 - 2024년 12월 6일',
    content: '테스트 리포트 내용',
    summary: '테스트 요약 내용입니다.',
    marketData: null,
    newsAnalysis: { processedCount: 5 },
    investmentRecommendations: null,
    reportType: 'morning' as const,
    createdAt: '2024-12-06T08:00:00Z',
    updatedAt: '2024-12-06T08:00:00Z',
  },
  {
    id: 2,
    title: '오후 투자 리포트 - 2024년 12월 5일',
    content: '테스트 리포트 내용 2',
    summary: '테스트 요약 내용 2입니다.',
    marketData: null,
    newsAnalysis: { processedCount: 3 },
    investmentRecommendations: null,
    reportType: 'evening' as const,
    createdAt: '2024-12-05T18:00:00Z',
    updatedAt: '2024-12-05T18:00:00Z',
  },
];

describe('ReportsList Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading spinner initially', () => {
    mockedReportsApi.getReports.mockImplementation(() => new Promise(() => {}));

    renderWithRouter(<ReportsList />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('renders reports list after loading', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: mockReports,
      total: 2,
      page: 1,
      limit: 10,
    });

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      expect(
        screen.getByText('오전 투자 리포트 - 2024년 12월 6일'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('오후 투자 리포트 - 2024년 12월 5일'),
      ).toBeInTheDocument();
    });
  });

  it('renders report generation buttons', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      expect(screen.getByText('🌅 오전 리포트 생성')).toBeInTheDocument();
      expect(screen.getByText('🌆 오후 리포트 생성')).toBeInTheDocument();
    });
  });

  it('handles morning report generation', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    mockedReportsApi.generateReport.mockResolvedValue(mockReports[0]);

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      const morningButton = screen.getByText('🌅 오전 리포트 생성');
      fireEvent.click(morningButton);
    });

    await waitFor(() => {
      expect(mockedReportsApi.generateReport).toHaveBeenCalledWith('morning');
    });
  });

  it('handles evening report generation', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    mockedReportsApi.generateReport.mockResolvedValue(mockReports[1]);

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      const eveningButton = screen.getByText('🌆 오후 리포트 생성');
      fireEvent.click(eveningButton);
    });

    await waitFor(() => {
      expect(mockedReportsApi.generateReport).toHaveBeenCalledWith('evening');
    });
  });

  it('displays error message on API failure', async () => {
    mockedReportsApi.getReports.mockRejectedValue(new Error('API Error'));

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      expect(
        screen.getByText('리포트를 불러오는데 실패했습니다.'),
      ).toBeInTheDocument();
    });
  });

  it('shows empty state when no reports exist', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      expect(screen.getByText('아직 리포트가 없습니다')).toBeInTheDocument();
      expect(
        screen.getByText('첫 번째 리포트를 생성해보세요!'),
      ).toBeInTheDocument();
    });
  });

  it('formats date correctly', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: mockReports,
      total: 2,
      page: 1,
      limit: 10,
    });

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      // Check if Korean date format is displayed
      expect(screen.getByText(/2024년 12월/)).toBeInTheDocument();
    });
  });

  it('displays news analysis count', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: mockReports,
      total: 2,
      page: 1,
      limit: 10,
    });

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      expect(screen.getByText('📰 5개 뉴스 분석')).toBeInTheDocument();
      expect(screen.getByText('📰 3개 뉴스 분석')).toBeInTheDocument();
    });
  });

  it('renders report type badges correctly', async () => {
    mockedReportsApi.getReports.mockResolvedValue({
      reports: mockReports,
      total: 2,
      page: 1,
      limit: 10,
    });

    renderWithRouter(<ReportsList />);

    await waitFor(() => {
      expect(screen.getByText('🌅 오전')).toBeInTheDocument();
      expect(screen.getByText('🌆 오후')).toBeInTheDocument();
      expect(screen.getByText('모닝브리핑')).toBeInTheDocument();
      expect(screen.getByText('이브닝브리핑')).toBeInTheDocument();
    });
  });
});
