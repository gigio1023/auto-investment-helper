export interface Report {
  id: number;
  title: string;
  content: string;
  summary: string;
  marketData?: any;
  newsAnalysis?: any;
  investmentRecommendations?: any;
  reportType: 'morning' | 'evening';
  createdAt: string;
  updatedAt: string;
}

export interface ReportsResponse {
  reports: Report[];
  total: number;
  page: number;
  limit: number;
}
