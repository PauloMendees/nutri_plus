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

const VIEW = { vw: 1100, vh: 800, width: 320, height: 200 };

function expectInViewport(pos: { top: number; left: number }) {
  expect(pos.top).toBeGreaterThanOrEqual(8);
  expect(pos.left).toBeGreaterThanOrEqual(8);
  expect(pos.top + VIEW.height).toBeLessThanOrEqual(VIEW.vh - 8);
  expect(pos.left + VIEW.width).toBeLessThanOrEqual(VIEW.vw - 8);
}

function expectNoOverlap(pos: { top: number; left: number }, target: DOMRect) {
  const overlaps =
    pos.left < target.right &&
    pos.left + VIEW.width > target.left &&
    pos.top < target.bottom &&
    pos.top + VIEW.height > target.top;
  expect(overlaps).toBe(false);
}

describe('placeTourTooltip', () => {
  it('places below a centered target with room below, without overlapping it', () => {
    const target = rect({ left: 490, top: 300, width: 120, height: 40 });
    const pos = placeTourTooltip(target, VIEW);
    expect(pos.top).toBeGreaterThanOrEqual(target.bottom);
    expectNoOverlap(pos, target);
    expectInViewport(pos);
  });

  it('flips above when the target is pinned to the bottom edge', () => {
    const target = rect({ left: 800, top: 740, width: 140, height: 40 });
    const pos = placeTourTooltip(target, VIEW);
    expect(pos.top + VIEW.height).toBeLessThanOrEqual(target.top);
    expectNoOverlap(pos, target);
    expectInViewport(pos);
  });

  it('places above a full-width target pinned to the bottom (dialog form), without overlapping it', () => {
    const target = rect({ left: 0, top: 740, width: 1100, height: 56 });
    const pos = placeTourTooltip(target, VIEW);
    expect(pos.top + VIEW.height).toBeLessThanOrEqual(target.top);
    expectNoOverlap(pos, target);
    expectInViewport(pos);
  });

  it('stays adjacent to a top-right target instead of jumping to the opposite corner', () => {
    const target = rect({ left: 1000, top: 20, width: 80, height: 32 });
    const pos = placeTourTooltip(target, VIEW);
    const isOppositeCorner = pos.left <= 8 && pos.top >= VIEW.vh - VIEW.height - 8 - 1;
    expect(isOppositeCorner).toBe(false);
    expectNoOverlap(pos, target);
    expectInViewport(pos);
  });

  it('places below a small top-left target when there is room', () => {
    const target = rect({ left: 24, top: 80, width: 120, height: 32 });
    const pos = placeTourTooltip(target, VIEW);
    expect(pos.top).toBeGreaterThanOrEqual(target.bottom);
    expectNoOverlap(pos, target);
    expectInViewport(pos);
  });
});
