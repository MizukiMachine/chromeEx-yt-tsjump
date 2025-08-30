/**
 * シーク基盤とガード
 * GUARD=3s 端での意図しない停止を防ぐ
 */

export const GUARD_SEC = 3;

/**
 * seekable の開始位置を返す
 * フォールバックは0
 */
export function getSeekableStart(video: HTMLVideoElement): number {
  const r = video.seekable;
  if (r && r.length > 0) {
    try {
      const s = r.start(0);
      return Number.isFinite(s) ? s : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * seekable の終端を返す
 * フォールバックは duration
 */
export function getSeekableEnd(video: HTMLVideoElement): number {
  const r = video.seekable;
  if (r && r.length > 0) {
    try {
      const e = r.end(0);
      if (Number.isFinite(e)) return e;
    } catch {
      /* no-op */
    }
  }
  const d = video.duration;
  return Number.isFinite(d) ? d : 0;
}

export interface ClampResult {
  target: number;        // 実際に適用するt
  clamped: boolean;      // クランプが発生したか
  reason: 'within' | 'start' | 'end';
  range: { start: number; end: number }; // 使用した範囲 endはガード適用後
}

/**
 * 再生可能範囲にクランプ
 * endは常にGUARDを差し引く
 */
export function clampToPlayable(
  t: number,
  start: number,
  end: number,
  guardSec: number = GUARD_SEC
): ClampResult {
  const maxEnd = Math.max(start, end - guardSec);
  if (t < start) {
    return { target: start, clamped: true, reason: 'start', range: { start, end: maxEnd } };
  }
  if (t > maxEnd) {
    return { target: maxEnd, clamped: true, reason: 'end', range: { start, end: maxEnd } };
  }
  return { target: t, clamped: false, reason: 'within', range: { start, end: maxEnd } };
}

export interface SeekResult extends ClampResult {
  requested: number;     // リクエストしたt
  previous: number;      // 変更前のcurrentTime
}

/**
 * シークを実行 クランプを適用してからcurrentTimeを更新
 */
export function seek(video: HTMLVideoElement, t: number): SeekResult {
  const start = getSeekableStart(video);
  const end = getSeekableEnd(video);
  const prev = video.currentTime;
  const cr = clampToPlayable(t, start, end, GUARD_SEC);
  try {
    video.currentTime = cr.target;
  } catch {
    // 稀に範囲外で例外が出るため無視
  }
  return { ...cr, requested: t, previous: prev };
}

