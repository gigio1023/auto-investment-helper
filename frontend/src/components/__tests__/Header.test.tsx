import React from 'react';
import { render, screen } from '@testing-library/react';

// Mock the Link component before importing Header
const MockLink = ({ children, to }: { children: React.ReactNode; to: string }) => (
  <a href={to}>{children}</a>
);

jest.mock('react-router-dom', () => ({
  Link: MockLink,
}));

// Now import Header after mocking
import Header from '../Header';

const renderWithRouter = (component: React.ReactElement) => {
  return render(component);
};

describe('Header Component', () => {
  it('renders header with correct title', () => {
    renderWithRouter(<Header />);

    expect(screen.getByText('📈 투자 도우미')).toBeInTheDocument();
  });

  it('renders header with description', () => {
    renderWithRouter(<Header />);

    expect(
      screen.getByText('AI 기반 투자 분석 및 리포트 서비스'),
    ).toBeInTheDocument();
  });

  it('renders navigation link', () => {
    renderWithRouter(<Header />);

    const reportListLink = screen.getByText('리포트 목록');
    expect(reportListLink).toBeInTheDocument();
    expect(reportListLink.closest('a')).toHaveAttribute('href', '/');
  });

  it('has correct styling classes', () => {
    renderWithRouter(<Header />);

    const header = screen.getByRole('banner');
    expect(header).toHaveClass('bg-blue-600', 'text-white', 'shadow-lg');
  });

  it('title links to home page', () => {
    renderWithRouter(<Header />);

    const titleLink = screen.getByText('📈 투자 도우미').closest('a');
    expect(titleLink).toHaveAttribute('href', '/');
  });
});
