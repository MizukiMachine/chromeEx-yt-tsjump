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
const END_DELTA_THRESHOLD_SEC = 60;  // 終端変化での再測定しきい値
const DRIFT_THRESHOLD_SEC = 3;       // 実測ズレでの再測定しきい値
const MONITOR_INTERVAL_MS = 5000;    // 監視周期
const PERIODIC_RECAL_MS = 10 * 60 * 1000; // 10分ごと軽量再測定
const EFFECTIVE_END_PREFER_BUFFERED_DELTA_SEC = 120; // seekableとbufferedの差が大きい場合はbufferedを採用
const PROGRESS_EPS_SEC = 0.5; // 進行判定の微小閾値
const NEARLIVE_THRESHOLD_SEC = 30; // ライブ端付近の判定
const PHASE_MAX_SAMPLES = 12; // 位相サンプル最大数

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
  phaseSamples: number[];        // Delay = effectiveEnd - currentTime のサンプル
  phaseMedian: number | null;    // 位相補正（median）
  phaseMad: number | null;       // 位相の安定度
  phaseKey: string | null;       // 位相が有効な動画キー（動画ごとに分離）
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
  phaseSamples: [],
  phaseMedian: null,
  phaseMad: null,
  phaseKey: null,
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
    phaseMedian: state.phaseMedian,
    phaseMad: state.phaseMad,
    phaseSamples: state.phaseSamples.length,
  } as const;
}

/**
 * サンプリングを開始 非ブロッキング
 * 既存のサンプリングは停止して置き換え
 */
export function startCalibration(video: HTMLVideoElement): void {
  stopCalibration();
  // 動画キーを更新し、位相サンプルをリセット
  state.phaseKey = computeVideoKey(video);
  state.phaseSamples = [];
  state.phaseMedian = null;
  state.phaseMad = null;

  // サンプリング開始（多重開始を防ぐ）
  let started = false;
  const startNow = () => {
    if (started) return;
    started = true;
    startSampling(video, MAX_SAMPLES, SAMPLE_INTERVAL_MS, 'initial');
  };

  // メタデータを待てる環境ではリスナーを登録しつつ、
  // テストや疑似環境でも動くように即時フォールバック開始
  if (typeof (video as any)?.addEventListener === 'function') {
    const onMeta = () => {
      try { video.removeEventListener('loadedmetadata', onMeta); } catch {}
      startNow();
    };
    try { video.addEventListener('loadedmetadata', onMeta, { once: true } as any); } catch {}
  }
  // readyStateに関わらず、まずは開始（endが未準備ならtick内でスキップされる）
  startNow();

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

function startSampling(video: HTMLVideoElement, nSamples: number, intervalMs: number, label: 'initial' | 'seekable-change' | 'drift' | 'periodic') {
  state.status = 'sampling';
  state.samples = [];
  state.median = null;
  state.mad = null;
  // 既存のサンプルタイマーを停止
  if (state.timer != null) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }

  debugCal('start', { label, nSamples, intervalMs, ...snapshotVideoInfo(video) });

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
        if (isDebugCal()) {
          const dbg = debugEndParts(video);
          debugCal('sample', { i: count + 1, end, ...dbg, Ci, median: state.median, mad: state.mad, C: state.C });
        }
        // 位相サンプル（nearLiveのみ）
        samplePhase(video, end);
        // 有効サンプルのみカウント
        count += 1;
      }
    } catch {
      // 失敗は無視
    }

    if (count >= nSamples) {
      state.status = 'ready';
      state.timer = null;
      debugCal('ready', { label, samples: nSamples, C: state.C, mad: state.mad });
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
        const progressed = last != null && end - last > PROGRESS_EPS_SEC;
        // 終端の大きな変化
        if (last != null && Math.abs(end - last) >= END_DELTA_THRESHOLD_SEC) {
          if (state.status !== 'sampling') {
            debugCal('recal-trigger', { type: 'seekable-change', delta: Math.abs(end - last) });
            startSampling(video, LIGHT_SAMPLES, LIGHT_INTERVAL_MS, 'seekable-change');
          }
        }

        // 実測ズレ
        if (state.C != null && progressed) {
          const drift = Math.abs((Date.now() / 1000 - end) - state.C);
          if (drift > DRIFT_THRESHOLD_SEC && state.status !== 'sampling') {
            debugCal('recal-trigger', { type: 'drift', drift });
            startSampling(video, LIGHT_SAMPLES, LIGHT_INTERVAL_MS, 'drift');
          }
        }

        // 位相サンプル（進行時のみ）
        if (progressed) {
          samplePhase(video, end);
        }

        // 最後に更新
        state.lastEnd = end;
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
      debugCal('recal-trigger', { type: 'periodic' });
      startSampling(video, LIGHT_SAMPLES, LIGHT_INTERVAL_MS, 'periodic');
    }
  }, PERIODIC_RECAL_MS);
}

function safeEnd(video: HTMLVideoElement): number {
  const seek = getSeekableEnd(video);
  const buf = getBufferedEnd(video);
  // 大きく乖離している場合はbufferedを採用
  if (Number.isFinite(buf) && buf > 0) {
    if (!Number.isFinite(seek) || seek <= 0) return buf;
    if (seek - buf > EFFECTIVE_END_PREFER_BUFFERED_DELTA_SEC) return buf;
  }
  // それ以外はseekable優先（フォールバックはbuffered）
  if (Number.isFinite(seek) && seek > 0) return seek;
  if (Number.isFinite(buf) && buf > 0) return buf;
  return 0;
}

function getBufferedEnd(video: HTMLVideoElement): number {
  const r = video.buffered;
  if (r && r.length > 0) {
    try {
      const idx = r.length - 1;
      const e = r.end(idx);
      return Number.isFinite(e) ? e : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

function debugEndParts(video: HTMLVideoElement): Record<string, unknown> {
  try {
    const seek = getSeekableEnd(video);
    const buf = getBufferedEnd(video);
    const picked = safeEnd(video);
    const pickedSrc = (Number.isFinite(buf) && buf > 0 && (!Number.isFinite(seek) || seek - buf > EFFECTIVE_END_PREFER_BUFFERED_DELTA_SEC)) ? 'buffered' : (Number.isFinite(seek) ? 'seekable' : 'buffered');
    const delay = picked - safeCurrentTime(video);
    return { seekableEnd: seek, bufferedEnd: buf, effectiveEnd: picked, endSource: pickedSrc, delay };
  } catch {
    return {};
  }
}

function samplePhase(video: HTMLVideoElement, effectiveEnd: number): void {
  try {
    const ct = safeCurrentTime(video);
    const delay = effectiveEnd - ct;
    // nearLiveのみ採用（負値や極端な値は除外）
    if (delay >= 0 && delay <= NEARLIVE_THRESHOLD_SEC) {
      // 動画が切り替わっていたらキーを更新してサンプルをクリア
      const key = computeVideoKey(video);
      if (state.phaseKey !== key) {
        state.phaseKey = key;
        state.phaseSamples = [];
        state.phaseMedian = null;
        state.phaseMad = null;
      }
      state.phaseSamples.push(delay);
      if (state.phaseSamples.length > PHASE_MAX_SAMPLES) state.phaseSamples.shift();
      const { median, mad } = computeMedianMad(state.phaseSamples);
      state.phaseMedian = median;
      state.phaseMad = mad;
      debugCal('phase', { delay, phaseMedian: state.phaseMedian, phaseMad: state.phaseMad, samples: state.phaseSamples.length });
    }
  } catch {
    /* no-op */
  }
}

function safeCurrentTime(video: HTMLVideoElement): number {
  try { return video.currentTime; } catch { return 0; }
}

export function getPhaseFor(video: HTMLVideoElement): { phase: number | null; mad: number | null } {
  const key = computeVideoKey(video);
  if (state.phaseKey && state.phaseKey === key) {
    return { phase: state.phaseMedian, mad: state.phaseMad };
  }
  return { phase: null, mad: null };
}

function computeVideoKey(video: HTMLVideoElement): string {
  try {
    const url = new URL(window.location.href);
    const v = url.searchParams.get('v');
    if (v) return `yt:v=${v}`;
  } catch {}
  try {
    if (video.currentSrc) return `src:${String(video.currentSrc)}`;
  } catch {}
  return `ts:${Date.now()}`; // フォールバック（ほぼ即座に更新されうる）
}

function debugCal(event: string, payload?: Record<string, unknown>) {
  if (!isDebugCal()) return;
  try {
    // eslint-disable-next-line no-console
    console.debug(`[Cal] ${event}`, payload ?? {});
  } catch {}
}

function isDebugCal(): boolean {
  try {
    return localStorage.getItem('debug:cal') === '1';
  } catch {
    return false;
  }
}

function snapshotVideoInfo(v: HTMLVideoElement): Record<string, unknown> {
  const info: Record<string, unknown> = {};
  try { info.readyState = v.readyState; } catch {}
  try { info.currentTime = v.currentTime; } catch {}
  try { info.duration = v.duration; } catch {}
  try { info.currentSrc = v.currentSrc; } catch {}
  try { info.className = v.className?.toString?.() ?? ''; } catch {}
  try { info.seekableLength = v.seekable?.length ?? 0; } catch {}
  try {
    const arr: Array<{ i: number; start: number; end: number }> = [];
    const r = v.seekable;
    if (r && r.length > 0) {
      for (let i = 0; i < r.length; i++) {
        try { arr.push({ i, start: r.start(i), end: r.end(i) }); } catch {}
      }
    }
    info.seekableRanges = arr;
  } catch {}
  return info;
}
