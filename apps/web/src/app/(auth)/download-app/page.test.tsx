import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DownloadAppPage from './page';

describe('DownloadAppPage', () => {
  it('renders the success heading and both store download links', () => {
    render(<DownloadAppPage />);
    expect(screen.getByText(/tudo pronto/i)).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);

    const appStore = screen.getByRole('link', { name: /app store/i });
    expect(appStore).toHaveAttribute(
      'href',
      'https://apps.apple.com/br/app/inutri-pacientes/id6789184541',
    );

    const playStore = screen.getByRole('link', { name: /google play/i });
    expect(playStore).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.inutri.app',
    );
  });
});
