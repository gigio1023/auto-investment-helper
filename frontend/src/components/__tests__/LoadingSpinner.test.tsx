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

  it('renders correctly for different sizes', () => {
    const { rerender } = render(<LoadingSpinner size="small" />);
    expect(screen.queryByText('AI가 분석 중입니다')).not.toBeInTheDocument();

    rerender(<LoadingSpinner size="medium" />);
    expect(screen.queryByText('AI가 분석 중입니다')).not.toBeInTheDocument();

    rerender(<LoadingSpinner size="large" />);
    expect(screen.getByText('AI가 분석 중입니다')).toBeInTheDocument();
  });

  it('renders all expected elements for large spinner', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('AI가 분석 중입니다')).toBeInTheDocument();
    expect(screen.getByText('시장 데이터를 실시간으로 처리하고 있습니다')).toBeInTheDocument();
    expect(screen.getByText('잠시만 기다려주세요...')).toBeInTheDocument();
    expect(screen.getByText('₩')).toBeInTheDocument();
  });

});
