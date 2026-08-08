import { logEvent } from '../events/emit';

const VERSION = 'seek-audit-2026-08-07.1';
const MAX_EVENTS = 120;
const events: unknown[] = [];

type Level = 'debug' | 'info' | 'warn' | 'error';

let started = false;
let lastSeekIntent: unknown = null;

function push(event: string, data: unknown, level: Level): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    href: safeHref(),
    data,
  };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();
  try { logEvent(`seek-audit:${event}`, entry); } catch {}
  try {
    const fn = console[level] ?? console.log;
    fn.call(console, '[TSJ:AUDIT]', VERSION, event, entry);
  } catch {}
}

function safeHref(): string {
  try { return location.href; } catch { return ''; }
}

function videoSnapshot(video: HTMLVideoElement | null): Record<string, unknown> {
  if (!video) return { hasVideo: false };
  let seekableStart: number | null = null;
  let seekableEnd: number | null = null;
  let bufferedEnd: number | null = null;
  try {
    if (video.seekable?.length) {
      seekableStart = video.seekable.start(0);
      seekableEnd = video.seekable.end(video.seekable.length - 1);
    }
  } catch {}
  try {
    if (video.buffered?.length) {
      bufferedEnd = video.buffered.end(video.buffered.length - 1);
    }
  } catch {}
  return {
    hasVideo: true,
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    playbackRate: video.playbackRate,
    readyState: video.readyState,
    seekableStart,
    seekableEnd,
    bufferedEnd,
    src: video.currentSrc || video.src || null,
  };
}

export function auditEvent(event: string, data: unknown = {}, level: Level = 'info'): void {
  push(event, data, level);
}

export function auditSeekIntent(source: string, video: HTMLVideoElement | null, data: unknown = {}): void {
  lastSeekIntent = {
    source,
    at: new Date().toISOString(),
    snapshot: videoSnapshot(video),
    data,
    stack: new Error().stack,
  };
  push('extension-seek-intent', lastSeekIntent, 'warn');
}

export function startSeekAudit(getVideo: () => HTMLVideoElement | null): void {
  if (started) return;
  started = true;

  try {
    (window as any).__TSJ_SEEK_AUDIT__ = {
      version: VERSION,
      events,
      copy: () => JSON.stringify(events, null, 2),
    };
  } catch {}

  push('audit-started', { version: VERSION }, 'info');

  let lastVideo: HTMLVideoElement | null = null;
  let lastHref = safeHref();
  let last = sample(getVideo());

  window.setInterval(() => {
    const video = getVideo();
    const next = sample(video);
    const href = safeHref();
    if (href !== lastHref) {
      push('url-changed', {
        previousHref: lastHref,
        currentHref: href,
        snapshot: videoSnapshot(video),
      }, 'warn');
      lastHref = href;
    }
    if (video !== lastVideo) {
      lastVideo = video;
      push('video-observed', { snapshot: videoSnapshot(video) }, 'info');
      last = next;
      return;
    }
    if (!last || !next || !video) {
      last = next;
      return;
    }

    const elapsedSec = Math.max(0.001, (next.wallMs - last.wallMs) / 1000);
    const delta = next.currentTime - last.currentTime;
    const rate = Number.isFinite(next.playbackRate) && next.playbackRate > 0 ? next.playbackRate : 1;
    const expected = elapsedSec * rate;
    const slack = Math.max(4, expected + 3);

    if (delta > slack) {
      push('unexpected-forward-jump-observed', {
        previous: last,
        current: next,
        elapsedSec,
        delta,
        expected,
        lastSeekIntent,
        snapshot: videoSnapshot(video),
      }, 'error');
    }
    last = next;
  }, 1000);
}

function sample(video: HTMLVideoElement | null): {
  wallMs: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
} | null {
  if (!video) return null;
  return {
    wallMs: Date.now(),
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    playbackRate: video.playbackRate,
  };
}
