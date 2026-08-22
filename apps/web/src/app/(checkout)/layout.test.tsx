import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/analytics/meta-pixel', () => ({
  MetaPixel: () => <div data-testid="meta-pixel" />,
}));
vi.mock('../providers', () => ({
  Providers: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/brand/logo', () => ({
  Logo: () => <div>logo</div>,
}));

import CheckoutLayout from './layout';

describe('Checkout layout', () => {
  it('mounts the Meta Pixel', () => {
    render(
      <CheckoutLayout>
        <p>assinatura</p>
      </CheckoutLayout>,
    );
    expect(screen.getByTestId('meta-pixel')).toBeInTheDocument();
  });
});
