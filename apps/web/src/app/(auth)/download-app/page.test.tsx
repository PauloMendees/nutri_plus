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

    const android = screen.getByRole('link', { name: /android/i });
    expect(android).toHaveAttribute(
      'href',
      'https://expo.dev/accounts/paulo-mendes-tecnologia/projects/nutri-plus-mobile/builds/b5903c35-7462-4d67-8ce6-15e22d2beeea',
    );
  });
});
