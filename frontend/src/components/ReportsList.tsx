import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { reportsApi } from '../services/api';
import { Report } from '../types';
import LoadingSpinner from './LoadingSpinner';

const ReportsList: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [generating, setGenerating] = useState(false);

  const limit = 10;

  useEffect(() => {
    fetchReports();
  }, [page]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await reportsApi.getReports(page, limit);
      setReports(response.reports);
      setTotal(response.total);
    } catch (err) {
      setError('리포트를 불러오는데 실패했습니다.');
      console.error('리포트 조회 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (type: 'morning' | 'evening') => {
    try {
      setGenerating(true);
      await reportsApi.generateReport(type);

      // 새 리포트 생성 후 목록 새로고침
      setPage(1);
      await fetchReports();
    } catch (err) {
      setError('리포트 생성에 실패했습니다.');
      console.error('리포트 생성 오류:', err);
    } finally {
      setGenerating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getReportTypeText = (type: string) => {
    return type === 'morning' ? '🌅 오전' : '🌆 오후';
  };

  const totalPages = Math.ceil(total / limit);

  if (loading && reports.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <div className='space-y-6'>
      {/* 헤더 섹션 */}
      <div className='flex justify-between items-center'>
        <div>
          <h2 className='text-3xl font-bold text-gray-900'>투자 리포트</h2>
          <p className='text-gray-600 mt-2'>AI가 분석한 최신 투자 인사이트</p>
        </div>

        <div className='flex space-x-3'>
          <button
            onClick={() => generateReport('morning')}
            disabled={generating}
            className='bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors'
          >
            {generating ? '생성중...' : '🌅 오전 리포트 생성'}
          </button>
          <button
            onClick={() => generateReport('evening')}
            disabled={generating}
            className='bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors'
          >
            {generating ? '생성중...' : '🌆 오후 리포트 생성'}
          </button>
        </div>
      </div>

      {error && (
        <div className='bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg'>
          {error}
        </div>
      )}

      {/* 리포트 목록 */}
      <div className='grid gap-6'>
        {reports.map(report => (
          <div
            key={report.id}
            className='bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow'
          >
            <div className='p-6'>
              <div className='flex items-center justify-between mb-4'>
                <div className='flex items-center space-x-3'>
                  <span className='text-lg'>
                    {getReportTypeText(report.reportType)}
                  </span>
                  <span className='bg-blue-100 text-blue-800 text-sm font-medium px-2.5 py-0.5 rounded'>
                    {report.reportType === 'morning'
                      ? '모닝브리핑'
                      : '이브닝브리핑'}
                  </span>
                </div>
                <span className='text-sm text-gray-500'>
                  {formatDate(report.createdAt)}
                </span>
              </div>

              <h3 className='text-xl font-semibold text-gray-900 mb-3'>
                <Link
                  to={`/reports/${report.id}`}
                  className='hover:text-blue-600 transition-colors'
                >
                  {report.title}
                </Link>
              </h3>

              <p className='text-gray-600 leading-relaxed mb-4'>
                {report.summary}
              </p>

              <div className='flex items-center justify-between'>
                <div className='flex items-center space-x-4 text-sm text-gray-500'>
                  {report.newsAnalysis?.processedCount && (
                    <span>
                      📰 {report.newsAnalysis.processedCount}개 뉴스 분석
                    </span>
                  )}
                </div>

                <Link
                  to={`/reports/${report.id}`}
                  className='inline-flex items-center text-blue-600 hover:text-blue-800 font-medium'
                >
                  자세히 보기 →
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className='flex justify-center items-center space-x-2 mt-8'>
          <button
            onClick={() => setPage(page - 1)}
            disabled={page === 1}
            className='px-3 py-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50'
          >
            이전
          </button>

          <div className='flex space-x-1'>
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={i + 1}
                onClick={() => setPage(i + 1)}
                className={`px-3 py-2 rounded-lg ${
                  page === i + 1
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => setPage(page + 1)}
            disabled={page === totalPages}
            className='px-3 py-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50'
          >
            다음
          </button>
        </div>
      )}

      {reports.length === 0 && !loading && (
        <div className='text-center py-12'>
          <div className='text-gray-400 text-6xl mb-4'>📊</div>
          <h3 className='text-xl font-medium text-gray-900 mb-2'>
            아직 리포트가 없습니다
          </h3>
          <p className='text-gray-600 mb-6'>첫 번째 리포트를 생성해보세요!</p>
          <div className='flex justify-center space-x-3'>
            <button
              onClick={() => generateReport('morning')}
              disabled={generating}
              className='bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium'
            >
              🌅 오전 리포트 생성
            </button>
            <button
              onClick={() => generateReport('evening')}
              disabled={generating}
              className='bg-purple-500 hover:bg-purple-600 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium'
            >
              🌆 오후 리포트 생성
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsList;
