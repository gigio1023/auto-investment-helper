import React from 'react';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ isDark, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className='
        relative w-16 h-8 rounded-full transition-all duration-120 ease-fast-out
        bg-gradient-to-r from-slate-300 to-slate-400 
        dark:from-slate-700 dark:to-slate-800
        hover:scale-105 hover:shadow-lg
        shadow-inner border-2 border-slate-400/30 dark:border-slate-600/30
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        group overflow-hidden will-change-transform transform
      '
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
    >
      {/* 배경 그라데이션 오버레이 */}
      <div
        className='
        absolute inset-0 rounded-full transition-all duration-120
        bg-gradient-to-r from-blue-200/50 to-indigo-300/50
        dark:from-indigo-900/50 dark:to-purple-900/50
        opacity-0 group-hover:opacity-100
      '
      />

      {/* 아이콘들 */}
      <div className='absolute inset-0 flex items-center justify-between px-2'>
        {/* 태양 아이콘 */}
        <div
          className={`
          text-yellow-500 transition-all duration-120 transform
          ${!isDark ? 'scale-100 opacity-100' : 'scale-75 opacity-50'}
        `}
        >
          ☀️
        </div>
        {/* 달 아이콘 */}
        <div
          className={`
          text-blue-300 transition-all duration-120 transform
          ${isDark ? 'scale-100 opacity-100' : 'scale-75 opacity-50'}
        `}
        >
          🌙
        </div>
      </div>

      {/* 슬라이딩 버튼 */}
      <div
        className={`
        absolute top-1 w-6 h-6 rounded-full transition-all duration-120 ease-out
        bg-gradient-to-br from-white to-slate-100 
        dark:from-slate-200 dark:to-slate-300
        shadow-lg border border-slate-300/50
        transform
        ${isDark ? 'translate-x-8' : 'translate-x-1'}
        group-hover:shadow-xl
        will-change-transform
      `}
      >
        {/* 내부 하이라이트 */}
        <div
          className='
          absolute inset-0.5 rounded-full 
          bg-gradient-to-br from-white/80 to-transparent
          transition-all duration-120 transform
          group-hover:scale-95
        '
        />
      </div>

      {/* 글로우 효과 */}
      <div
        className={`
        absolute inset-0 rounded-full transition-all duration-120
        ${
          isDark
            ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/20'
            : 'bg-gradient-to-r from-yellow-400/20 to-orange-400/20'
        }
        opacity-0 group-hover:opacity-100 blur-sm
      `}
      />
    </button>
  );
};

export default ThemeToggle;
