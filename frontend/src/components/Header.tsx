import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

const Header: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    // 시스템 테마 확인
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches;
    const savedTheme = localStorage.getItem('theme');

    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    } else {
      setIsDarkMode(prefersDark);
    }
  }, []);

  useEffect(() => {
    // HTML 클래스 업데이트
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <header className='relative'>
      {/* 글래스 네비게이션 바 */}
      <nav className='sticky top-0 z-50 glass-card backdrop-blur-extreme border-b-2 border-glass-white-border dark:border-glass-black-border shadow-glass'>
        <div className='max-w-7xl mx-auto px-6 sm:px-8'>
          <div className='flex items-center justify-between h-20'>
            {/* 로고 섹션 */}
            <Link
              to='/'
              className='flex items-center space-x-4 group transition-transform duration-120 ease-fast-out hover:scale-105 will-change-transform'
            >
              {/* 로고 아이콘 */}
              <div className='relative'>
                <div className='w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-glass group-hover:shadow-glow-primary transition-all duration-120 ease-fast-out'>
                  <span className='text-white text-2xl font-bold drop-shadow-lg'>
                    📊
                  </span>
                </div>
                {/* 글로우 효과 */}
                <div className='absolute inset-0 w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 opacity-0 blur-lg group-hover:opacity-20 transition-opacity duration-120'></div>
              </div>

              {/* 로고 텍스트 */}
              <div className='hidden sm:block'>
                <h1 className='text-2xl font-bold bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent group-hover:from-primary-500 group-hover:to-primary-400 transition-all duration-120'>
                  투자분석AI
                </h1>
                <p className='text-sm text-gray-600 dark:text-gray-300 font-medium'>
                  AI 기반 투자 리포트 분석
                </p>
              </div>
            </Link>

            {/* 네비게이션 메뉴 */}
            <div className='flex items-center space-x-6'>
              {/* 네비게이션 링크들 */}
              <div className='hidden md:flex items-center space-x-6'>
                <Link
                  to='/'
                  className='glass-button px-6 py-3 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold rounded-2xl transition-all duration-120 ease-fast-out backdrop-blur-extreme border-2 border-glass-white-border dark:border-glass-black-border hover:border-primary-400 dark:hover:bg-glass-black-border hover:scale-[1.02] transform will-change-transform'
                >
                  홈
                </Link>
                <Link
                  to='/reports'
                  className='glass-button px-6 py-3 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold rounded-2xl transition-all duration-120 ease-fast-out backdrop-blur-extreme border-2 border-glass-white-border dark:border-glass-black-border hover:border-primary-400 dark:hover:bg-glass-black-border hover:scale-[1.02] transform will-change-transform'
                >
                  리포트
                </Link>
                <Link
                  to='/analytics'
                  className='glass-button px-6 py-3 text-gray-700 dark:text-gray-300 hover:text-primary-600 dark:hover:text-primary-400 font-semibold rounded-2xl transition-all duration-120 ease-fast-out backdrop-blur-extreme border-2 border-glass-white-border dark:border-glass-black-border hover:border-primary-400 dark:hover:bg-glass-black-border hover:scale-[1.02] transform will-change-transform'
                >
                  분석
                </Link>
              </div>

              {/* 테마 토글 */}
              <ThemeToggle isDark={isDarkMode} onToggle={toggleTheme} />

              {/* 모바일 메뉴 버튼 */}
              <button 
                className='md:hidden glass-button p-3 rounded-2xl text-gray-700 dark:text-gray-300 backdrop-blur-extreme border-2 border-glass-white-border dark:border-glass-black-border transition-all duration-120 ease-fast-out hover:scale-105 will-change-transform'
                aria-label='메뉴 열기'
              >
                <svg
                  className='w-6 h-6'
                  fill='none'
                  stroke='currentColor'
                  viewBox='0 0 24 24'
                >
                  <path
                    strokeLinecap='round'
                    strokeLinejoin='round'
                    strokeWidth={2}
                    d='M4 6h16M4 12h16M4 18h16'
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
};

export default Header;
