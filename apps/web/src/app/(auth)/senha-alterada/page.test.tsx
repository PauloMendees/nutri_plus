import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PasswordChangedPage from './page';

describe('PasswordChangedPage', () => {
  it('tells the patient to sign in on the app and opens it via the app scheme', () => {
    render(<PasswordChangedPage />);
    expect(screen.getByText(/senha alterada/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /abrir o app/i })).toHaveAttribute('href', 'nutriplus://login');
  });

  it('offers both store links and never the web login', () => {
    render(<PasswordChangedPage />);
    expect(screen.getByRole('link', { name: /app store/i })).toHaveAttribute(
      'href',
      'https://apps.apple.com/br/app/inutri-pacientes/id6789184541',
    );
    expect(screen.getByRole('link', { name: /google play/i })).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.inutri.app',
    );
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).not.toMatch(/^\/login/);
    }
  });
});
