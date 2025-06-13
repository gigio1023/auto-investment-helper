import axios from 'axios';
import { Report, ReportsResponse } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

export const reportsApi = {
  getReports: async (page = 1, limit = 10): Promise<ReportsResponse> => {
    const response = await api.get(`/reports?page=${page}&limit=${limit}`);
    return response.data;
  },

  getReport: async (id: number): Promise<Report> => {
    const response = await api.get(`/reports/${id}`);
    return response.data;
  },

  getReportsByDate: async (date: string): Promise<Report[]> => {
    const response = await api.get(`/reports/date/${date}`);
    return response.data;
  },

  generateReport: async (type: 'morning' | 'evening'): Promise<Report> => {
    const response = await api.post(`/reports/generate/${type}`);
    return response.data;
  },
};

export default api;
