import React from 'react';

const LoadingSpinner: React.FC = () => {
  return (
    <div className='flex items-center justify-center py-12'>
      <div className='animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600'></div>
      <span className='ml-3 text-gray-600'>로딩 중...</span>
    </div>
  );
};

export default LoadingSpinner;
