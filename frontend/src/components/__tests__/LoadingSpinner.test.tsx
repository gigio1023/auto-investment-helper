import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner Component', () => {
  it('renders loading spinner with Korean text', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('AI가 분석 중입니다')).toBeInTheDocument();
    expect(screen.getByText('시장 데이터를 실시간으로 처리하고 있습니다')).toBeInTheDocument();
    expect(screen.getByText('잠시만 기다려주세요...')).toBeInTheDocument();
  });

  it('renders with correct size variants', () => {
    const { container: smallContainer } = render(<LoadingSpinner size="small" />);
    expect(smallContainer.querySelector('.w-4.h-4')).toBeInTheDocument();

    const { container: mediumContainer } = render(<LoadingSpinner size="medium" />);
    expect(mediumContainer.querySelector('.w-8.h-8')).toBeInTheDocument();

    const { container: largeContainer } = render(<LoadingSpinner size="large" />);
    expect(largeContainer.querySelector('.w-24.h-24')).toBeInTheDocument();
  });

  it('renders with correct container styling for large size', () => {
    const { container } = render(<LoadingSpinner />);

    const spinnerContainer = container.firstChild;
    expect(spinnerContainer).toHaveClass(
      'flex',
      'flex-col',
      'items-center',
      'justify-center',
      'space-y-6',
      'p-8',
    );
  });

  it('contains animated elements', () => {
    const { container } = render(<LoadingSpinner />);
    
    const animatedElements = container.querySelectorAll('.animate-spin, .animate-bounce, .animate-pulse');
    expect(animatedElements.length).toBeGreaterThan(0);
  });

  it('displays currency symbol', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('₩')).toBeInTheDocument();
  });
});
