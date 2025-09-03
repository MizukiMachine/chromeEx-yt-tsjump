/**
 * シーク基盤とガード
 * GUARD=3s 端での意図しない停止を防ぐ
 */

export const GUARD_SEC = 3;
export const EDGE_BACKOFF_SEC = 0.75; // live edge直前での安全余白

/**
 * seekable の開始位置を返す
 * フォールバックは0
 */
export function getSeekableStart(video: HTMLVideoElement): number {
  const r = video.seekable;
  if (r && r.length > 0) {
    try {
      // すべての範囲から最小値を選ぶ（順序保証に依存しない）
      let min = Number.POSITIVE_INFINITY;
      for (let i = 0; i < r.length; i++) {
        const s = r.start(i);
        if (Number.isFinite(s) && s < min) min = s;
      }
      return Number.isFinite(min) ? min : 0;
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
      // すべての範囲から最大値を選ぶ（順序保証に依存しない）
      let max = Number.NEGATIVE_INFINITY;
      for (let i = 0; i < r.length; i++) {
        const e = r.end(i);
        if (Number.isFinite(e) && e > max) max = e;
      }
      if (Number.isFinite(max)) return max;
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
  let cr = clampToPlayable(t, start, end, GUARD_SEC);

  // bufferedの終端も考慮し 安全な着地点に調整
  // 端クランプ時だけでなく target がbuffered終端より先のときも手前へずらす
  if (video.buffered && video.buffered.length > 0) {
    try {
      const idx = video.buffered.length - 1;
      const bufEnd = video.buffered.end(idx);
      if (Number.isFinite(bufEnd)) {
        const safeMax = bufEnd - EDGE_BACKOFF_SEC;
        const safe = Math.max(start, Math.min(cr.target, safeMax));
        if (safe < cr.target) {
          cr = { ...cr, target: safe };
        }
      }
    } catch {
      // buffered参照失敗は無視
    }
  }
  try {
    const anyVideo: any = video as any;
    if (typeof anyVideo.fastSeek === 'function') {
      anyVideo.fastSeek(cr.target);
    } else {
      video.currentTime = cr.target;
    }
    // 端付近で停止しがちなので軽くplayを促す
    if (cr.reason === 'end') {
      void video.play().catch(() => {});
      // 短時間後にまだ停止なら再度促す
      setTimeout(() => {
        if (isNearLiveEdge(video) && video.paused) {
          void video.play().catch(() => {});
        }
      }, 250);
    }
  } catch {
    // 稀に範囲外で例外が出るため無視
  }
  return { ...cr, requested: t, previous: prev };
}

/**
 * live edgeに近いかの簡易判定
 */
export function isNearLiveEdge(video: HTMLVideoElement, thresholdSec = 5): boolean {
  const end = getSeekableEnd(video);
  return end > 0 && end - video.currentTime <= thresholdSec;
}
