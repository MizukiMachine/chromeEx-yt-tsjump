/**
 * 再生イベントに基づくロック管理（seeking/waiting/stalled/playing）
 * 呼び出し元の状態を直接は持たず、コールバックで反映する
 */

export const DEFAULT_LOCK_MS = 1500;

interface AttachLockOpts {
  video: HTMLVideoElement;
  setLocked: (v: boolean) => void;
  addTimer: (id: number) => void;
  addCleanup: (fn: () => void) => void;
  lockMs?: number;
  onDebug?: (event: string, data?: any) => void;
}

export function attachPlaybackLockEvents({
  video,
  setLocked,
  addTimer,
  addCleanup,
  lockMs = DEFAULT_LOCK_MS,
  onDebug,
}: AttachLockOpts): void {
  const dbg = (e: string, d?: any) => { try { onDebug?.(e, d); } catch {} };

  const onSeeking = () => { setLocked(true); dbg('lock', { via: 'seeking' }); };
  const onSeeked = () => {
    const id = window.setTimeout(() => { setLocked(false); dbg('unlock', { via: 'seeked+delay' }); }, lockMs);
    addTimer(id);
  };
  const onWaiting = () => { setLocked(true); dbg('lock', { via: 'waiting' }); };
  const onStalled = () => { setLocked(true); dbg('lock', { via: 'stalled' }); };
  const onPlaying = () => {
    const id = window.setTimeout(() => { setLocked(false); dbg('unlock', { via: 'playing+delay' }); }, 250);
    addTimer(id);
  };

  try { video.addEventListener('seeking', onSeeking); } catch {}
  try { video.addEventListener('seeked', onSeeked); } catch {}
  try { video.addEventListener('waiting', onWaiting); } catch {}
  try { video.addEventListener('stalled', onStalled); } catch {}
  try { video.addEventListener('playing', onPlaying); } catch {}

  addCleanup(() => {
    try { video.removeEventListener('seeking', onSeeking); } catch {}
    try { video.removeEventListener('seeked', onSeeked); } catch {}
    try { video.removeEventListener('waiting', onWaiting); } catch {}
    try { video.removeEventListener('stalled', onStalled); } catch {}
    try { video.removeEventListener('playing', onPlaying); } catch {}
  });
}

