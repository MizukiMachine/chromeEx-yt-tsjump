/* @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeHybrid, initHybrid, startCalibration } from '../src/content/core/hybridCalibration';

function createMockVideo(opts: {
  current?: number;
  seekableEnd?: number;
  bufferedEnd?: number;
  readyState?: number;
} = {}) {
  const {
    current = 0,
    seekableEnd = 20,
    bufferedEnd = seekableEnd,
    readyState = 4,
  } = opts;
  const el = document.createElement('video') as HTMLVideoElement;
  let currentTime = current;

  Object.defineProperty(el, 'currentTime', {
    get() {
      return currentTime;
    },
    set(value: number) {
      currentTime = value;
    },
    configurable: true,
  });
  Object.defineProperty(el, 'readyState', {
    get() {
      return readyState;
    },
    configurable: true,
  });
  Object.defineProperty(el, 'duration', {
    get() {
      return seekableEnd;
    },
    configurable: true,
  });
  Object.defineProperty(el, 'seekable', {
    get() {
      return {
        length: 1,
        start: () => 0,
        end: () => seekableEnd,
      } as unknown as TimeRanges;
    },
    configurable: true,
  });
  Object.defineProperty(el, 'buffered', {
    get() {
      return {
        length: 1,
        start: () => 0,
        end: () => bufferedEnd,
      } as unknown as TimeRanges;
    },
    configurable: true,
  });

  return el;
}

afterEach(() => {
  disposeHybrid();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('hybrid calibration monitor', () => {
  it('does not seek while waiting for a natural edge snap', () => {
    vi.useFakeTimers();
    const video = createMockVideo({ current: 0, seekableEnd: 20, bufferedEnd: 20 });
    document.body.append(video);

    initHybrid(video);
    startCalibration();
    vi.advanceTimersByTime(6_000);

    expect(video.currentTime).toBe(0);
  });
});
