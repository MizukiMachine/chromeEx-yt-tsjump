import { describe, it, expect } from 'vitest';
import { updateStatus, pickFrame, clearTab, _debugDump } from '../src/background/route';

describe('background route', () => {
  it('video-foundでframeを登録し video-lostで解除', () => {
    updateStatus(1, 3, 'video-found');
    expect(pickFrame(1)).toBe(3);
    // 別frameのlostは無視
    updateStatus(1, 4, 'video-lost');
    expect(pickFrame(1)).toBe(3);
    // 同一frameのlostで解除
    updateStatus(1, 3, 'video-lost');
    expect(pickFrame(1)).toBeUndefined();
  });

  it('clearTabで解放', () => {
    updateStatus(2, 7, 'video-found');
    expect(pickFrame(2)).toBe(7);
    clearTab(2);
    expect(pickFrame(2)).toBeUndefined();
  });

  it('デバッグダンプが配列を返す', () => {
    updateStatus(10, 1, 'video-found');
    const dump = _debugDump();
    expect(Array.isArray(dump)).toBe(true);
    expect(dump.some((e) => e.tabId === 10 && e.frameId === 1)).toBe(true);
  });
});

