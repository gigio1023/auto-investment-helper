import React from 'react';
import { Link } from 'react-router-dom';

const Header: React.FC = () => {
  return (
    <header className='bg-blue-600 text-white shadow-lg'>
      <div className='max-w-6xl mx-auto px-4 py-6'>
        <div className='flex items-center justify-between'>
          <Link to='/' className='flex items-center space-x-2'>
            <h1 className='text-2xl font-bold'>📈 투자 도우미</h1>
          </Link>
          <nav className='flex space-x-6'>
            <Link
              to='/'
              className='hover:text-blue-200 transition-colors duration-200'
            >
              리포트 목록
            </Link>
          </nav>
        </div>
        <p className='mt-2 text-blue-100'>AI 기반 투자 분석 및 리포트 서비스</p>
      </div>
    </header>
  );
};

export default Header;
