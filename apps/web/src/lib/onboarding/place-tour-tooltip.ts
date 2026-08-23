export function placeTourTooltip(
  target: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>,
  view: { vw: number; vh: number; width?: number; height?: number; gap?: number },
): { top: number; left: number } {
  const width = view.width ?? 320;
  const height = view.height ?? 220;
  const gap = view.gap ?? 12;
  const { vw, vh } = view;
  const min = 8;

  const targetOnRight = target.left > vw * 0.4;
  let left: number;
  let top: number;

  if (targetOnRight) {
    left = Math.max(min, target.left - width - gap);
    top = Math.min(Math.max(min, target.top), vh - height - min);
  } else {
    left = Math.max(min, Math.min(target.left, vw - width - min));
    if (target.bottom + gap + height <= vh - min) top = target.bottom + gap;
    else if (target.top - gap - height >= min) top = target.top - gap - height;
    else top = Math.max(min, vh - height - min);
  }

  const overlaps =
    left < target.right && left + width > target.left && top < target.bottom && top + height > target.top;
  if (overlaps && target.left > width + gap) {
    left = Math.max(min, target.left - width - gap);
  }

  return { top, left };
}
