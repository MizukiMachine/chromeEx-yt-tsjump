/**
 * 非ブロッキングキャリブレーション
 * 目的 Cの暫定推定と安定化 MADで外れ値を緩く除去
 */

import { getSeekableEnd } from './seek';

// 設定値
const MAX_SAMPLES = 6;               // 最大サンプル数（初回）
const SAMPLE_INTERVAL_MS = 1000;     // 取得間隔ms
const LIGHT_SAMPLES = 3;             // 軽量再測定サンプル数
const LIGHT_INTERVAL_MS = 1000;      // 軽量再測定間隔
const END_DELTA_THRESHOLD_SEC = 60;  // seekable変化での再測定しきい値
const DRIFT_THRESHOLD_SEC = 3;       // 実測ズレでの再測定しきい値
const MONITOR_INTERVAL_MS = 5000;    // 監視周期
const PERIODIC_RECAL_MS = 10 * 60 * 1000; // 10分ごと軽量再測定

// 内部状態
type Status = 'idle' | 'sampling' | 'ready';

interface State {
  status: Status;
  samples: number[];   // Ci = epochSec − end
  median: number | null;
  mad: number | null;
  C: number | null;    // 推定オフセット C
  timer: number | null;
  monitorTimer: number | null;   // 監視タイマー（seekable変化/ドリフト）
  periodicTimer: number | null;  // 10分ごとの軽量再測定
  lastEnd: number | null;        // 直近のseekable end
}

const state: State = {
  status: 'idle',
  samples: [],
  median: null,
  mad: null,
  C: null,
  timer: null,
  monitorTimer: null,
  periodicTimer: null,
  lastEnd: null,
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
  startSampling(video, MAX_SAMPLES, SAMPLE_INTERVAL_MS);
  // 監視を開始
  try {
    state.lastEnd = safeEnd(video);
  } catch { state.lastEnd = null; }
  startMonitors(video);
}

/**
 * サンプリング停止
 */
export function stopCalibration(): void {
  if (state.timer != null) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
  if (state.monitorTimer != null) {
    window.clearInterval(state.monitorTimer);
    state.monitorTimer = null;
  }
  if (state.periodicTimer != null) {
    window.clearInterval(state.periodicTimer);
    state.periodicTimer = null;
  }
  state.status = 'idle';
}

/**
 * 暫定のCを即時取得 サンプル不足時はnull
 */
export function getC(): number | null {
  return state.C;
}

// ---- 内部ヘルパー ----

function startSampling(video: HTMLVideoElement, nSamples: number, intervalMs: number) {
  state.status = 'sampling';
  state.samples = [];
  state.median = null;
  state.mad = null;
  // 既存のサンプルタイマーを停止
  if (state.timer != null) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }

  let count = 0;
  const tick = () => {
    try {
      const end = safeEnd(video);
      const epochSec = Date.now() / 1000;
      if (Number.isFinite(end) && end > 0) {
        const Ci = epochSec - end;
        state.samples.push(Ci);
        const { median } = computeMedianMad(state.samples);
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
    if (count >= nSamples) {
      state.status = 'ready';
      state.timer = null;
      return;
    }
    state.timer = window.setTimeout(tick, intervalMs);
  };

  state.timer = window.setTimeout(tick, intervalMs);
}

function startMonitors(video: HTMLVideoElement) {
  // seekableの変化・ドリフト監視
  if (state.monitorTimer != null) {
    window.clearInterval(state.monitorTimer);
  }
  state.monitorTimer = window.setInterval(() => {
    try {
      const end = safeEnd(video);
      const last = state.lastEnd;
      if (Number.isFinite(end) && end > 0) {
        // endの大きな変化
        if (last != null && Math.abs(end - last) >= END_DELTA_THRESHOLD_SEC) {
          if (state.status !== 'sampling') {
            startSampling(video, LIGHT_SAMPLES, LIGHT_INTERVAL_MS);
          }
        }
        state.lastEnd = end;

        // 実測ズレ
        if (state.C != null) {
          const drift = Math.abs((Date.now() / 1000 - end) - state.C);
          if (drift > DRIFT_THRESHOLD_SEC && state.status !== 'sampling') {
            startSampling(video, LIGHT_SAMPLES, LIGHT_INTERVAL_MS);
          }
        }
      }
    } catch {
      /* no-op */
    }
  }, MONITOR_INTERVAL_MS);

  // 10分ごと軽量再測定
  if (state.periodicTimer != null) {
    window.clearInterval(state.periodicTimer);
  }
  state.periodicTimer = window.setInterval(() => {
    if (state.status !== 'sampling') {
      startSampling(video, LIGHT_SAMPLES, LIGHT_INTERVAL_MS);
    }
  }, PERIODIC_RECAL_MS);
}

function safeEnd(video: HTMLVideoElement): number {
  return getSeekableEnd(video);
}
