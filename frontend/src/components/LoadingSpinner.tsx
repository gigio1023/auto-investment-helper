import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className='flex flex-col items-center justify-center space-y-6 p-8'>
      <div className='relative'>
        {/* 글래스 배경 */}
        <div className='glass-card w-24 h-24 rounded-full flex items-center justify-center backdrop-blur-2xl'>
          {/* 외부 링 - 다중 색상 */}
          <div className='w-20 h-20 border-4 border-transparent bg-gradient-to-r from-primary-500/30 via-financial-blue/30 to-primary-500/30 rounded-full animate-spin relative'>
            <div className='absolute inset-1 bg-white/10 dark:bg-black/10 rounded-full backdrop-blur-sm'></div>
          </div>

          {/* 내부 회전 링 */}
          <div className='absolute w-16 h-16 border-4 border-transparent border-t-primary-600 border-r-financial-blue rounded-full animate-spin' style={{ animationDirection: 'reverse' }}></div>

          {/* 중앙 아이콘 */}
          <div className='absolute inset-0 flex items-center justify-center'>
            <div className='w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center shadow-lg shadow-primary-500/25 animate-pulse'>
              <span className='text-white text-lg font-bold drop-shadow-lg'>
                ₩
              </span>
            </div>
          </div>
        </div>

        {/* 발광 효과 */}
        <div className='absolute inset-0 w-24 h-24 rounded-full bg-gradient-to-r from-primary-400/20 to-financial-blue/20 blur-xl animate-pulse'></div>
      </div>

      <div className='text-center space-y-2'>
        <h3 className='text-xl font-bold text-gray-900 dark:text-white'>
          AI가 분석 중입니다
        </h3>
        <p className='text-lg text-gray-700 dark:text-gray-300 font-medium'>
          시장 데이터를 실시간으로 처리하고 있습니다
        </p>
        <p className='text-sm text-gray-600 dark:text-gray-400'>
          잠시만 기다려주세요...
        </p>
      </div>

      {/* 진행 표시 점들 */}
      <div className='flex space-x-2'>
        <div className='w-3 h-3 bg-primary-500 rounded-full animate-bounce'></div>
        <div
          className='w-3 h-3 bg-financial-blue rounded-full animate-bounce'
          style={{ animationDelay: '0.1s' }}
        ></div>
        <div
          className='w-3 h-3 bg-primary-600 rounded-full animate-bounce'
          style={{ animationDelay: '0.2s' }}
        ></div>
      </div>
    </div>
  );
};

export default LoadingSpinner;
