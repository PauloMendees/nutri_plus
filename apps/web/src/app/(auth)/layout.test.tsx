import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/analytics/meta-pixel', () => ({
  MetaPixel: () => <div data-testid="meta-pixel" />,
}));
vi.mock('@/components/auth/auth-layout', () => ({
  AuthLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import Layout from './layout';

describe('Auth layout', () => {
  it('mounts the Meta Pixel', () => {
    render(
      <Layout>
        <p>login</p>
      </Layout>,
    );
    expect(screen.getByTestId('meta-pixel')).toBeInTheDocument();
  });
});
