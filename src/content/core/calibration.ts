/**
 * 非ブロッキングキャリブレーション
 * 目的 Cの暫定推定と安定化 MADで外れ値を緩く除去
 */

import { getSeekableEnd } from './seek';

// 設定値
const MAX_SAMPLES = 6;             // 最大サンプル数
const SAMPLE_INTERVAL_MS = 1000;   // 取得間隔ms

// 内部状態
type Status = 'idle' | 'sampling' | 'ready';

interface State {
  status: Status;
  samples: number[];   // Ci = epochSec − end
  median: number | null;
  mad: number | null;
  C: number | null;    // 推定オフセット C
  timer: number | null;
}

const state: State = {
  status: 'idle',
  samples: [],
  median: null,
  mad: null,
  C: null,
  timer: null,
};

/**
 * 中央値とMADを計算
 */
export function computeMedianMad(values: number[]): { median: number; mad: number } {
  if (values.length === 0) return { median: 0, mad: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const dev = sorted.map((v) => Math.abs(v - median)).sort((a, b) => a - b);
  const midD = Math.floor(dev.length / 2);
  const mad = dev.length % 2 ? dev[midD] : (dev[midD - 1] + dev[midD]) / 2;
  return { median, mad };
}

/**
 * 状態を取得 UIやデバッグ用
 */
export function getCalibration() {
  const quality = !state.C
    ? 'none'
    : state.mad != null && state.mad <= 0.75
    ? 'high'
    : state.samples.length >= 3
    ? 'medium'
    : 'low';
  return {
    status: state.status,
    C: state.C,
    median: state.median,
    mad: state.mad,
    samples: state.samples.length,
    quality,
  } as const;
}

/**
 * サンプリングを開始 非ブロッキング
 * 既存のサンプリングは停止して置き換え
 */
export function startCalibration(video: HTMLVideoElement): void {
  stopCalibration();
  state.status = 'sampling';
  state.samples = [];
  state.median = null;
  state.mad = null;
  state.C = null;

  let count = 0;

  const tick = () => {
    try {
      // endを取得 E=epochSec サンプルCi=E−end
      const end = getSeekableEnd(video);
      const epochSec = Date.now() / 1000;
      if (Number.isFinite(end) && end > 0) {
        const Ci = epochSec - end;
        state.samples.push(Ci);
        // 緩い外れ値除去 median±0.75 を採用
        const { median, mad } = computeMedianMad(state.samples);
        const filtered = state.samples.filter((c) => Math.abs(c - median) <= 0.75);
        const center = computeMedianMad(filtered);
        state.median = center.median;
        state.mad = center.mad;
        state.C = center.median;
      }
    } catch {
      // 失敗は無視
    }

    count += 1;
    if (count >= MAX_SAMPLES) {
      state.status = 'ready';
      state.timer = null;
      return;
    }
    state.timer = window.setTimeout(tick, SAMPLE_INTERVAL_MS);
  };

  state.timer = window.setTimeout(tick, SAMPLE_INTERVAL_MS);
}

/**
 * サンプリング停止
 */
export function stopCalibration(): void {
  if (state.timer != null) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
  state.status = 'idle';
}

/**
 * 暫定のCを即時取得 サンプル不足時はnull
 */
export function getC(): number | null {
  return state.C;
}

