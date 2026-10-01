import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useHorizontalOverflow } from './use-horizontal-overflow';

function Probe() {
  const [ref, overflowing] = useHorizontalOverflow<HTMLDivElement>();
  return <div ref={ref} data-testid="box" data-overflowing={String(overflowing)} />;
}

// jsdom não faz layout: as larguras e o ResizeObserver são simulados.
function setWidths(scrollWidth: number, clientWidth: number) {
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(scrollWidth);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
}

afterEach(() => vi.restoreAllMocks());

describe('useHorizontalOverflow', () => {
  it('is false when the content fits', () => {
    setWidths(800, 800);
    render(<Probe />);
    expect(screen.getByTestId('box')).toHaveAttribute('data-overflowing', 'false');
  });

  it('is true when the content is wider than the box', () => {
    setWidths(1200, 800);
    render(<Probe />);
    expect(screen.getByTestId('box')).toHaveAttribute('data-overflowing', 'true');
  });

  it('updates when the box is resized', () => {
    let notify: () => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          notify = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    setWidths(800, 800);
    render(<Probe />);
    expect(screen.getByTestId('box')).toHaveAttribute('data-overflowing', 'false');

    setWidths(1200, 800);
    act(() => notify());
    expect(screen.getByTestId('box')).toHaveAttribute('data-overflowing', 'true');
    vi.unstubAllGlobals();
  });
});
