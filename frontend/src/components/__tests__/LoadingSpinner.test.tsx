import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from '../LoadingSpinner';

describe('LoadingSpinner Component', () => {
  it('renders loading spinner', () => {
    render(<LoadingSpinner />);

    expect(screen.getByText('로딩 중...')).toBeInTheDocument();
  });

  it('has correct styling for spinner animation', () => {
    render(<LoadingSpinner />);

    const spinner = screen.getByText('로딩 중...').previousElementSibling;
    expect(spinner).toHaveClass(
      'animate-spin',
      'rounded-full',
      'border-b-2',
      'border-blue-600',
    );
  });

  it('renders with correct container styling', () => {
    const { container } = render(<LoadingSpinner />);

    const spinnerContainer = container.firstChild;
    expect(spinnerContainer).toHaveClass(
      'flex',
      'items-center',
      'justify-center',
      'py-12',
    );
  });
});
