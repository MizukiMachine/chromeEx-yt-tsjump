/**
 * commandsハンドラ
 * ±10 ±60 を実装
 */
import { seek } from '../core/seek';
import { isAdActive } from '../core/adsense';
import { showToast } from '../ui/toast';

export type SeekCommand =
  | 'seek-backward-60'
  | 'seek-backward-10'
  | 'seek-forward-60'
  | 'seek-forward-10';

export function handleSeekCommand(video: HTMLVideoElement, command: SeekCommand): void {
  if (isAdActive()) {
    showToast('An ad is playing, so seeking is paused.', 'warn');
    return;
  }
  const MIN = 60;
  const deltas: Record<SeekCommand, number> = {
    'seek-backward-60': -60 * MIN,
    'seek-backward-10': -10 * MIN,
    'seek-forward-60': 60 * MIN,
    'seek-forward-10': 10 * MIN,
  };

  const delta = deltas[command];
  const requested = video.currentTime + delta;
  const result = seek(video, requested);

  console.log('[Content] Seek result', {
    command,
    delta,
    requested: result.requested,
    applied: result.target,
    clamped: result.clamped,
    reason: result.reason,
    range: result.range,
  });
}
