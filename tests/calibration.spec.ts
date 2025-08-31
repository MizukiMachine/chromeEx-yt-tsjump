/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeMedianMad, startCalibration, getCalibration, getC, stopCalibration } from '../src/content/core/calibration';

function makeVideoWithEnd(end: number): HTMLVideoElement {
  const v = document.createElement('video') as HTMLVideoElement;
  Object.defineProperty(v, 'seekable', {
    get() {
      return { length: 1, end: () => end } as unknown as TimeRanges;
    },
  });
  return v;
}

describe('computeMedianMad', () => {
  it('中央値とMADを返す', () => {
    const { median, mad } = computeMedianMad([1, 2, 2, 3, 100]);
    expect(median).toBe(2);
    expect(mad).toBe(0);
  });
});

describe('startCalibration', () => {
  const realNow = Date.now;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000_000_000); // 固定
  });
  afterEach(() => {
    stopCalibration();
    vi.useRealTimers();
    (Date.now as any) = realNow;
  });

  it('6サンプル取得後にreadyになりCが入る', () => {
    const v = makeVideoWithEnd(1000);
    startCalibration(v);
    // 6回分進める
    vi.advanceTimersByTime(6000);
    const g = getCalibration();
    expect(g.status).toBe('ready');
    expect(getC()).not.toBeNull();
    expect(typeof getC()).toBe('number');
  });
});

