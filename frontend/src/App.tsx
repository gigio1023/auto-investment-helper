import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import ReportsList from './components/ReportsList';
import ReportDetail from './components/ReportDetail';

function App() {
  return (
    <div className='min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-blue-900 dark:to-indigo-900'>
      {/* 부드러운 배경 패턴 */}
      <div className='fixed inset-0 opacity-30 dark:opacity-20'>
        <div className='absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-br from-blue-200/40 to-purple-200/40 dark:from-blue-800/30 dark:to-purple-800/30 rounded-full blur-3xl animate-float will-change-transform' />
        <div
          className='absolute top-1/2 right-1/4 w-80 h-80 bg-gradient-to-br from-purple-200/40 to-pink-200/40 dark:from-purple-800/30 dark:to-pink-800/30 rounded-full blur-3xl animate-float will-change-transform'
          style={{ animationDelay: '2s' }}
        />
        <div
          className='absolute bottom-1/4 left-1/3 w-64 h-64 bg-gradient-to-br from-indigo-200/40 to-blue-200/40 dark:from-indigo-800/30 dark:to-blue-800/30 rounded-full blur-3xl animate-float will-change-transform'
          style={{ animationDelay: '4s' }}
        />
      </div>

      {/* 메인 콘텐츠 */}
      <div className='relative z-10'>
        <Header />
        <main className='container mx-auto px-6 py-8'>
          <Routes>
            <Route path='/' element={<ReportsList />} />
            <Route path='/reports' element={<ReportsList />} />
            <Route path='/reports/:id' element={<ReportDetail />} />
            <Route
              path='/analytics'
              element={
                <div className='text-center text-xl text-gray-600 dark:text-gray-300'>
                  분석 페이지 준비중...
                </div>
              }
            />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default App;
