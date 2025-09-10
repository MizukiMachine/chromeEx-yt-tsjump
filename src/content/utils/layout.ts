/**
 * Layout helpers for UI positioning and viewport clamping.
 */

export type Point = { x: number; y: number };

/** Clamp a point into viewport with simple margins. */
export function clampToViewport(p: Point, vw: number, vh: number, margin = 40): Point {
  const x = Math.min(vw - margin, Math.max(0, p.x));
  const y = Math.min(vh - margin, Math.max(0, p.y));
  return { x, y };
}

/**
 * Clamp a rectangle (x,y,width,height) to viewport so that it stays fully visible
 * with the given margin from edges.
 */
export function clampRectToViewport(p: Point, w: number, h: number, vw: number, vh: number, margin = 16): Point {
  const maxX = Math.max(0, vw - w - margin);
  const maxY = Math.max(0, vh - h - margin);
  const x = Math.min(maxX, Math.max(margin, p.x));
  const y = Math.min(maxY, Math.max(margin, p.y));
  return { x, y };
}

/** Clamp a rectangle to an arbitrary DOMRect bounds (e.g., video area). */
export function clampRectToBounds(p: Point, w: number, h: number, bounds: DOMRect, marginX = 8, marginY = 8): Point {
  const minX = bounds.left + marginX;
  const minY = bounds.top + marginY;
  const maxX = bounds.right - w - marginX;
  const maxY = bounds.bottom - h - marginY;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // If bounds smaller than rect, place at bounds' top-left with margins
  if (spanX < 0 || spanY < 0) {
    return { x: Math.max(minX, bounds.left + 4), y: Math.max(minY, bounds.top + 4) };
  }
  const x = Math.min(maxX, Math.max(minX, p.x));
  const y = Math.min(maxY, Math.max(minY, p.y));
  return { x, y };
}
