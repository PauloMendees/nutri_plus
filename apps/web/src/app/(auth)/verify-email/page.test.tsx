import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/analytics/meta-pixel', () => ({ MetaPixel: () => null }));

import VerifyEmailPage from './page';

describe('VerifyEmailPage', () => {
  it('shows the address and a fixed hint to also check the spam folder', async () => {
    render(await VerifyEmailPage({ searchParams: Promise.resolve({ email: 'ana@clinica.com' }) }));
    expect(screen.getByText('ana@clinica.com')).toBeInTheDocument();
    expect(screen.getByText(/não encontrou o e-mail/i)).toHaveTextContent(/caixa de spam ou de lixo eletrônico/i);
  });
});
