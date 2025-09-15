/**
 * ハイブリッド校正ユーティリティ（ステートレス関数）
 */

/** 現在のUTC時刻（秒） */
export const now = (): number => Date.now() / 1000;

/** bufferedEndを安全に取得 */
export function getBufferedEnd(video: HTMLVideoElement): number {
  try {
    const buffered = video.buffered;
    if (buffered && buffered.length > 0) {
      const end = buffered.end(buffered.length - 1);
      return Number.isFinite(end) ? end : NaN;
    }
    return NaN;
  } catch {
    return NaN;
  }
}

/** 右端にいるかの判定（buffered基準） */
export function isAtEdge(video: HTMLVideoElement, bufSlackSec: number = 2): boolean {
  try {
    const bufferedEnd = getBufferedEnd(video);
    const currentTime = video.currentTime;
    return Number.isFinite(bufferedEnd) && Number.isFinite(currentTime) && (bufferedEnd - currentTime) <= bufSlackSec;
  } catch {
    return false;
  }
}

