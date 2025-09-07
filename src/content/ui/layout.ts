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

