import React from 'react';

interface ThemeToggleProps {
  isDark: boolean;
  onToggle: () => void;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ isDark, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className={`
        relative w-16 h-8 rounded-full transition-all duration-300 ease-in-out
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        ${isDark ? 'bg-slate-700/60 shadow-inner' : 'bg-gray-200/80 shadow-sm'}
        hover:scale-105 hover:shadow-lg
        backdrop-blur-sm border border-white/20
      `}
      aria-label={isDark ? '라이트 모드로 변경' : '다크 모드로 변경'}
    >
      {/* 배경 글로우 효과 */}
      <div
        className={`
        absolute inset-0 rounded-full transition-all duration-300
        ${
          isDark
            ? 'bg-gradient-to-r from-blue-600/30 to-purple-600/30'
            : 'bg-gradient-to-r from-yellow-200/30 to-orange-200/30'
        }
      `}
      />

      {/* 슬라이더 토글 */}
      <div
        className={`
        absolute top-1 w-6 h-6 rounded-full transition-all duration-300 ease-out
        transform shadow-md backdrop-blur-sm
        ${
          isDark
            ? 'translate-x-9 bg-white/90 shadow-blue-500/20'
            : 'translate-x-1 bg-white shadow-orange-300/30'
        }
        flex items-center justify-center
      `}
      >
        {/* 아이콘 */}
        <div
          className={`
          transition-all duration-300 transform
          ${isDark ? 'rotate-0 scale-100' : 'rotate-180 scale-100'}
        `}
        >
          {isDark ? (
            // 달 아이콘
            <svg
              className='w-3.5 h-3.5 text-slate-700'
              fill='currentColor'
              viewBox='0 0 20 20'
            >
              <path
                fillRule='evenodd'
                d='M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z'
                clipRule='evenodd'
              />
            </svg>
          ) : (
            // 태양 아이콘
            <svg
              className='w-3.5 h-3.5 text-yellow-600'
              fill='currentColor'
              viewBox='0 0 20 20'
            >
              <path
                fillRule='evenodd'
                d='M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z'
                clipRule='evenodd'
              />
            </svg>
          )}
        </div>
      </div>

      {/* 배경의 작은 별들 (다크 모드일 때만) */}
      {isDark && (
        <div className='absolute inset-0 overflow-hidden rounded-full'>
          <div
            className='absolute top-2 left-2 w-0.5 h-0.5 bg-white/60 rounded-full animate-pulse'
            style={{ animationDelay: '0.5s' }}
          />
          <div
            className='absolute top-3 right-3 w-0.5 h-0.5 bg-white/40 rounded-full animate-pulse'
            style={{ animationDelay: '1.2s' }}
          />
          <div
            className='absolute bottom-2 left-3 w-0.5 h-0.5 bg-white/50 rounded-full animate-pulse'
            style={{ animationDelay: '0.8s' }}
          />
        </div>
      )}
    </button>
  );
};

export default ThemeToggle;
