import React, { useState, useEffect } from 'react';
import ThemeToggle from './ThemeToggle';

const Header: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    // 로컬 스토리지에서 테마 설정 읽기
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    } else {
      setIsDark(false);
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);

    if (newIsDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  return (
    <header className='relative'>
      {/* 극명한 글래스 배경 효과 */}
      <div className='absolute inset-0 backdrop-blur-5xl bg-glass-gradient border-b-2 border-glass-white-border dark:border-glass-black-border shadow-glass dark:shadow-glass-dark' />
      {/* 메인 헤더 */}
      <div className='relative container mx-auto px-6 py-6'>
        <div className='flex items-center justify-between'>
          {/* 로고/제목 */}
          <div className='flex items-center space-x-4'>
            <div className='flex items-center space-x-3'>
              <div className='w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center shadow-glow-primary border-2 border-glass-white-border dark:border-glass-black-border backdrop-blur-sm'>
                <svg
                  className='w-7 h-7 text-white drop-shadow-lg'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2.5}
                    d='M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z'
                  />
                </svg>
              </div>
              <div>
                <h1 className='text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300 bg-clip-text text-transparent drop-shadow-sm'>
                  투자 리포트 분석기
                </h1>
                <p className='text-sm text-gray-600 dark:text-gray-400 font-medium'>
                  AI 기반 투자 리포트 분석 플랫폼
                </p>
              </div>
            </div>
          </div>

          {/* 우측 메뉴 */}
          <div className='flex items-center space-x-4'>
            {/* 극명한 글래스 알림 아이콘 */}
            <button className='p-4 rounded-2xl bg-glass-white-strong dark:bg-glass-black-strong backdrop-blur-extreme border-2 border-glass-white-border dark:border-glass-black-border hover:bg-glass-white-border dark:hover:bg-glass-black-border transition-all duration-300 hover:scale-110 shadow-glass hover:shadow-glass-hover hover:shadow-glow-primary'>
              <svg
                className='w-6 h-6 text-gray-700 dark:text-gray-300'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9'
                />
              </svg>
            </button>

            {/* 극명한 글래스 사용자 메뉴 */}
            <button className='p-4 rounded-2xl bg-glass-white-strong dark:bg-glass-black-strong backdrop-blur-extreme border-2 border-glass-white-border dark:border-glass-black-border hover:bg-glass-white-border dark:hover:bg-glass-black-border transition-all duration-300 hover:scale-110 shadow-glass hover:shadow-glass-hover hover:shadow-glow-primary'>
              <svg
                className='w-6 h-6 text-gray-700 dark:text-gray-300'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth={2}
                  d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
                />
              </svg>
            </button>

            {/* 테마 토글 */}
            <ThemeToggle isDark={isDark} onToggle={toggleTheme} />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
