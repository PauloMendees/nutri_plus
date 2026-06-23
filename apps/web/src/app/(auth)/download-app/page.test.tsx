import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DownloadAppPage from './page';

describe('DownloadAppPage', () => {
  it('renders the success heading and disabled store badges', () => {
    render(<DownloadAppPage />);
    expect(screen.getByText(/tudo pronto/i)).toBeInTheDocument();
    expect(screen.getByText('App Store')).toBeInTheDocument();
    expect(screen.getByText('Google Play')).toBeInTheDocument();
    expect(screen.getAllByText(/em breve/i)).toHaveLength(2);
  });
});
