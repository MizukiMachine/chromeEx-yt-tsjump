/**
 * タイマー管理ユーティリティ
 * 呼び出し元が保持する配列に対して、登録/一括クリアを行う。
 */

/** タイマーIDを登録 */
export function addTimer(timers: number[], timerId: number): void {
  timers.push(timerId);
}

/** すべてのタイマーをクリアし、配列を空にする */
export function clearAllTimers(timers: number[]): void {
  for (const id of timers) {
    try { window.clearTimeout(id); } catch {}
    try { window.clearInterval(id); } catch {}
  }
  timers.length = 0;
}

