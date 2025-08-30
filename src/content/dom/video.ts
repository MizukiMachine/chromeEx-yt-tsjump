/**
 * Video DOM utility
 * 目的 S2 YouTube内の<video>を確実に検出
 * 提供 getVideoElement observeVideo
 * 注意 SPAでvideoが動的に差し替わるためMutationObserverで監視
 */

export interface GetVideoOptions {
  /** タイムアウトms 省略時10000 */
  timeoutMs?: number;
  /** 中断用AbortSignal 任意 */
  signal?: AbortSignal;
}

/**
 * 接続済み<video>が現れるまで待つ
 * 最初に見つかった<video>を返す タイムアウトか中断で失敗
 */
export function getVideoElement(opts: GetVideoOptions = {}): Promise<HTMLVideoElement> {
  const { timeoutMs = 10_000, signal } = opts;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const pick = (): HTMLVideoElement | null => {
      const v = document.querySelector('video') as HTMLVideoElement | null;
      return v && v.isConnected ? v : null;
    };

    const existing = pick();
    if (existing) {
      resolve(existing);
      return;
    }

    const cleanup = () => {
      observer.disconnect();
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) signal.addEventListener('abort', onAbort);

    const observer = new MutationObserver(() => {
      const v = pick();
      if (v) {
        cleanup();
        resolve(v);
      }
    });
    // 文書全体の子リスト変化を監視
    observer.observe(document.documentElement, { childList: true, subtree: true });

    let timeoutId: number | undefined;
    if (timeoutMs > 0) {
      timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for <video>'));
      }, timeoutMs);
    }
  });
}

export type VideoChangeReason = 'existing' | 'added' | 'removed' | 'replaced';

export interface VideoObserverHandle {
  /** 監視を停止 */
  disconnect(): void;
  /** 直近の<video> ない場合null */
  getCurrent(): HTMLVideoElement | null;
}

/**
 * 現在の<video>参照の変化を監視
 * 参照が変わったときのみコールバックを呼ぶ
 */
export function observeVideo(
  cb: (video: HTMLVideoElement | null, reason: VideoChangeReason) => void
): VideoObserverHandle {
  const pick = (): HTMLVideoElement | null => {
    const v = document.querySelector('video') as HTMLVideoElement | null;
    return v && v.isConnected ? v : null;
  };

  let current: HTMLVideoElement | null = pick();
  if (current) cb(current, 'existing');

  const observer = new MutationObserver((_mutations) => {
    const next = pick();
    if (next !== current) {
      let reason: VideoChangeReason;
      if (current && !next) reason = 'removed';
      else if (!current && next) reason = 'added';
      else reason = 'replaced';
      current = next;
      cb(current, reason);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  return {
    disconnect() {
      observer.disconnect();
    },
    getCurrent() {
      const v = current;
      return v && v.isConnected ? v : null;
    },
  };
}
