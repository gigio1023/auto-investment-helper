import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { reportsApi } from '../services/api';
import { Report } from '../types';
import LoadingSpinner from './LoadingSpinner';

const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchReport(parseInt(id));
    }
  }, [id]);

  const fetchReport = async (reportId: number) => {
    try {
      setLoading(true);
      setError(null);
      const data = await reportsApi.getReport(reportId);
      setReport(data);
    } catch (err) {
      setError('리포트를 불러오는데 실패했습니다.');
      console.error('Error fetching report:', err instanceof Error ? err.message : err, err);
    } finally {
      setLoading(false);
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

  const formatContent = (content: string) => {
    // 마크다운 스타일의 헤더를 HTML로 변환
    return content.split('\n').map((line, index) => {
      if (line.startsWith('## ')) {
        return (
          <h2
            key={index}
            className='text-xl font-bold mt-6 mb-3 text-gray-900 border-b-2 border-blue-200 pb-2'
          >
            {line.replace('## ', '')}
          </h2>
        );
      } else if (line.startsWith('# ')) {
        return (
          <h1
            key={index}
            className='text-2xl font-bold mt-6 mb-4 text-gray-900'
          >
            {line.replace('# ', '')}
          </h1>
        );
      } else if (line.startsWith('- ')) {
        return (
          <li key={index} className='ml-4 mb-2 text-gray-700'>
            {line.replace('- ', '')}
          </li>
        );
      } else if (line.trim() === '') {
        return <br key={index} />;
      } else {
        return (
          <p key={index} className='mb-3 text-gray-700 leading-relaxed'>
            {line}
          </p>
        );
      }
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error || !report) {
    return (
      <div className='text-center py-12'>
        <div className='text-red-400 text-6xl mb-4'>⚠️</div>
        <h3 className='text-xl font-medium text-gray-900 mb-2'>
          오류가 발생했습니다
        </h3>
        <p className='text-gray-600 mb-6'>
          {error || '리포트를 찾을 수 없습니다.'}
        </p>
        <button
          onClick={() => navigate('/')}
          className='bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium'
        >
          리포트 목록으로 돌아가기
        </button>
      </div>
    );
  }

  return (
    <div className='max-w-4xl mx-auto'>
      {/* 헤더 */}
      <div className='mb-8'>
        <button
          onClick={() => navigate('/')}
          className='flex items-center text-blue-600 hover:text-blue-800 mb-4 transition-colors'
        >
          ← 리포트 목록으로 돌아가기
        </button>

        <div className='bg-white rounded-lg shadow-lg p-6'>
          <div className='flex items-center justify-between mb-4'>
            <div className='flex items-center space-x-3'>
              <span className='text-2xl'>
                {getReportTypeText(report.reportType)}
              </span>
              <span className='bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full'>
                {report.reportType === 'morning'
                  ? '모닝브리핑'
                  : '이브닝브리핑'}
              </span>
            </div>
            <div className='text-right'>
              <div className='text-sm text-gray-500'>생성일시</div>
              <div className='font-medium'>{formatDate(report.createdAt)}</div>
            </div>
          </div>

          <h1 className='text-2xl font-bold text-gray-900 mb-4'>
            {report.title}
          </h1>

          <div className='bg-blue-50 p-4 rounded-lg'>
            <h3 className='font-semibold text-blue-900 mb-2'>📝 요약</h3>
            <p className='text-blue-800 leading-relaxed'>{report.summary}</p>
          </div>

          {report.newsAnalysis?.processedCount && (
            <div className='mt-4 flex items-center text-sm text-gray-600'>
              <span className='mr-2'>📰</span>
              <span>
                {report.newsAnalysis.processedCount}개의 뉴스를 분석하여
                작성되었습니다
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 리포트 내용 */}
      <div className='bg-white rounded-lg shadow-lg p-8'>
        <div className='prose max-w-none'>{formatContent(report.content)}</div>
      </div>

      {/* 추가 정보 */}
      {(report.marketData || report.investmentRecommendations) && (
        <div className='mt-8 grid gap-6 md:grid-cols-2'>
          {report.marketData && (
            <div className='bg-white rounded-lg shadow-lg p-6'>
              <h3 className='text-lg font-semibold mb-4 text-gray-900'>
                📊 시장 데이터
              </h3>
              <pre className='text-sm text-gray-600 whitespace-pre-wrap'>
                {JSON.stringify(report.marketData, null, 2)}
              </pre>
            </div>
          )}

          {report.investmentRecommendations && (
            <div className='bg-white rounded-lg shadow-lg p-6'>
              <h3 className='text-lg font-semibold mb-4 text-gray-900'>
                💡 투자 추천
              </h3>
              <pre className='text-sm text-gray-600 whitespace-pre-wrap'>
                {JSON.stringify(report.investmentRecommendations, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportDetail;
