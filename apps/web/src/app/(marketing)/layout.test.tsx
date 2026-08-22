import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/analytics/meta-pixel', () => ({
  MetaPixel: () => <div data-testid="meta-pixel" />,
}));

import MarketingLayout from './layout';

describe('MarketingLayout', () => {
  it('mounts the Meta Pixel', () => {
    render(
      <MarketingLayout>
        <p>landing</p>
      </MarketingLayout>,
    );
    expect(screen.getByTestId('meta-pixel')).toBeInTheDocument();
  });
});
