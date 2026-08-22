import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const usePathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }));
vi.mock('next/script', () => ({
  default: ({
    id,
    dangerouslySetInnerHTML,
  }: {
    id?: string;
    dangerouslySetInnerHTML?: { __html: string };
  }) => <script data-testid="meta-pixel-script" id={id} dangerouslySetInnerHTML={dangerouslySetInnerHTML} />,
}));

import { MetaPixel } from './meta-pixel';

const PIXEL_ID = '1633275874982739';

beforeEach(() => {
  usePathname.mockReturnValue('/');
  window.fbq = vi.fn();
});

describe('MetaPixel', () => {
  it('renders nothing when no pixel id is provided', () => {
    const { container } = render(<MetaPixel pixelId="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('loads the pixel snippet with init and PageView for the given id', () => {
    render(<MetaPixel pixelId={PIXEL_ID} />);
    const script = screen.getByTestId('meta-pixel-script');
    expect(script.innerHTML).toContain(`fbq('init', '${PIXEL_ID}')`);
    expect(script.innerHTML).toContain("fbq('track', 'PageView')");
  });

  it('tracks PageView on client-side route changes, not on the first paint', () => {
    const { rerender } = render(<MetaPixel pixelId={PIXEL_ID} />);
    expect(window.fbq).not.toHaveBeenCalled();
    usePathname.mockReturnValue('/signup');
    rerender(<MetaPixel pixelId={PIXEL_ID} />);
    expect(window.fbq).toHaveBeenCalledWith('track', 'PageView');
    expect(window.fbq).toHaveBeenCalledTimes(1);
  });
});
