/* @vitest-environment happy-dom */
import { describe, it, expect } from 'vitest';
import {
  GUARD_SEC,
  clampToPlayable,
  getSeekableStart,
  getSeekableEnd,
  seek,
} from '../src/content/core/seek';

function createMockVideo(opts: {
  start?: number;
  end?: number;
  duration?: number;
  throwStart?: boolean;
  throwEnd?: boolean;
}) {
  const { start = 0, end = 600, duration = end, throwStart = false, throwEnd = false } = opts;
  const el = document.createElement('video') as HTMLVideoElement;

  let current = 0;

  Object.defineProperty(el, 'currentTime', {
    get() {
      return current;
    },
    set(v: number) {
      current = v;
    },
    configurable: true,
  });

  Object.defineProperty(el, 'duration', {
    get() {
      return duration;
    },
    configurable: true,
  });

  Object.defineProperty(el, 'seekable', {
    get() {
      return {
        length: 1,
        start(i: number) {
          if (i !== 0) throw new Error('index');
          if (throwStart) throw new Error('start');
          return start;
        },
        end(i: number) {
          if (i !== 0) throw new Error('index');
          if (throwEnd) throw new Error('end');
          return end;
        },
      } as unknown as TimeRanges;
    },
    configurable: true,
  });

  return el;
}

describe('clampToPlayable', () => {
  it('returns within unchanged', () => {
    const c = clampToPlayable(50, 0, 100, 3);
    expect(c.target).toBe(50);
    expect(c.clamped).toBe(false);
    expect(c.reason).toBe('within');
    expect(c.range.end).toBe(97);
  });

  it('clamps below start', () => {
    const c = clampToPlayable(-10, 5, 100, 3);
    expect(c.target).toBe(5);
    expect(c.clamped).toBe(true);
    expect(c.reason).toBe('start');
  });

  it('clamps above end minus guard', () => {
    const c = clampToPlayable(200, 0, 100, 3);
    expect(c.target).toBe(97);
    expect(c.clamped).toBe(true);
    expect(c.reason).toBe('end');
  });

  it('keeps end at least start when end-guard < start', () => {
    const c = clampToPlayable(200, 100, 101, 3);
    expect(c.range.end).toBe(100);
    expect(c.target).toBe(100);
    expect(c.reason).toBe('end');
  });
});

describe('getSeekableStart/End', () => {
  it('reads start/end from TimeRanges', () => {
    const v = createMockVideo({ start: 10, end: 200 });
    expect(getSeekableStart(v)).toBe(10);
    expect(getSeekableEnd(v)).toBe(200);
  });

  it('falls back to duration when end fails', () => {
    const v = createMockVideo({ end: 0, duration: 123, throwEnd: true });
    expect(getSeekableEnd(v)).toBe(123);
  });

  it('falls back to 0 when start fails', () => {
    const v = createMockVideo({ start: 50, throwStart: true });
    expect(getSeekableStart(v)).toBe(0);
  });
});

describe('seek', () => {
  it('applies guard at end and returns details', () => {
    const v = createMockVideo({ start: 0, end: 100 });
    v.currentTime = 40;
    const r = seek(v, 1000);
    expect(r.previous).toBe(40);
    expect(r.requested).toBe(1000);
    expect(r.target).toBe(100 - GUARD_SEC);
    expect(r.clamped).toBe(true);
    expect(v.currentTime).toBe(100 - GUARD_SEC);
  });

  it('clamps to start when negative', () => {
    const v = createMockVideo({ start: 5, end: 50 });
    v.currentTime = 10;
    const r = seek(v, -20);
    expect(r.target).toBe(5);
    expect(v.currentTime).toBe(5);
  });
});

