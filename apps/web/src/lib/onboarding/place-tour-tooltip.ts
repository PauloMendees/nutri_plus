export function placeTourTooltip(
  target: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>,
  view: { vw: number; vh: number; width?: number; height?: number; gap?: number },
): { top: number; left: number } {
  const width = view.width ?? 320;
  const height = view.height ?? 220;
  const gap = view.gap ?? 12;
  const { vw, vh } = view;
  const min = 8;

  function clampAxis(value: number, size: number, viewportSize: number): number {
    const max = Math.max(min, viewportSize - size - min);
    return Math.min(Math.max(value, min), max);
  }

  function clamp(pos: { top: number; left: number }): { top: number; left: number } {
    return {
      top: clampAxis(pos.top, height, vh),
      left: clampAxis(pos.left, width, vw),
    };
  }

  function overlapsTarget(pos: { top: number; left: number }): boolean {
    return (
      pos.left < target.right &&
      pos.left + width > target.left &&
      pos.top < target.bottom &&
      pos.top + height > target.top
    );
  }

  // Preference order: below, above, left, right of the target — each
  // candidate clamped to the viewport before the overlap test.
  const candidates = [
    clamp({ top: target.bottom + gap, left: target.left }),
    clamp({ top: target.top - gap - height, left: target.left }),
    clamp({ top: target.top, left: target.left - gap - width }),
    clamp({ top: target.top, left: target.right + gap }),
  ];

  // Fallback (giant target): "below", clamped.
  return candidates.find((pos) => !overlapsTarget(pos)) ?? candidates[0];
}
