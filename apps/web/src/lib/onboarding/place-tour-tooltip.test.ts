import { describe, it, expect } from 'vitest';
import { placeTourTooltip } from './place-tour-tooltip';

function rect(over: Partial<DOMRect>): DOMRect {
  const left = over.left ?? 0;
  const top = over.top ?? 0;
  const width = over.width ?? 100;
  const height = over.height ?? 40;
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return this;
    },
  };
}

describe('placeTourTooltip', () => {
  it('puts the tooltip to the left of a bottom-right save button instead of covering it', () => {
    const pos = placeTourTooltip(rect({ left: 900, top: 720, width: 140, height: 40 }), {
      vw: 1100,
      vh: 800,
      width: 320,
      height: 200,
    });
    expect(pos.left + 320).toBeLessThanOrEqual(900);
    expect(pos.top + 200).toBeLessThanOrEqual(800);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });

  it('places below a small top-left target when there is room', () => {
    const pos = placeTourTooltip(rect({ left: 24, top: 80, width: 120, height: 32 }), {
      vw: 1100,
      vh: 800,
      width: 320,
      height: 200,
    });
    expect(pos.top).toBeGreaterThanOrEqual(80 + 32);
    expect(pos.left).toBeGreaterThanOrEqual(8);
  });
});
