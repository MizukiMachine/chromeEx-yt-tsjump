/**
 * ハイブリッドキャリブレーションシステム
 * Edge-Snap (bufferedEnd強キャリブ) + Live-PLL (seekableEnd観測微調整)
 * 
 * 設計方針:
 * - C値は基本固定（Edge-Snapで一度だけ確定、PLLで微調整のみ）
 * - ジャンプ時はCsnapで関数内固定（レース回避）
 * - seekableEndは観測専用、直接的なキャリブには使用しない
 */

import { getSeekableStart, getSeekableEnd, seek } from './seek';
import { getBool, getJSON, Keys } from '../store/local';
import { isAdActive } from './adsense';

// ===== 設定型定義 =====
export interface HybridCalibConfig {
  latencySec: number;          // L: 配信遅延 (デフォルト: 20)
  edgeSlackSec: number;        // 右端判定の余裕 (デフォルト: 2)
  nearLiveSlackSec: number;    // seekableEnd基準の近接判定 (デフォルト: 6)
  pll: {
    hysSec: number;            // HYS: 誤差ヒステリシス (デフォルト: 2.5)
    consecN: number;           // 連続一致回数 (デフォルト: 5)
    alpha: number;             // PLLゲイン (デフォルト: 0.02)
    maxRatePerSec: number;     // C変化速度上限 (デフォルト: 0.5/60)
    outlierESec: number;       // 外れ値上限 (デフォルト: 4000, ≈66分)
    intervalMs: number;        // PLL実行間隔 (デフォルト: 1000)
  };
}

// デフォルト設定
export const DEFAULT_HYBRID_CONFIG: HybridCalibConfig = {
  latencySec: 20,
  // QA観測から: UIがLIVEでも bufferedEnd 直前に張り付けないケースが多い
  // Edge判定の余裕を広げ、自然動作で Edge-Snap が通りやすい既定値に調整
  edgeSlackSec: 12,
  nearLiveSlackSec: 18,
  pll: {
    hysSec: 2.5,
    consecN: 5,
    alpha: 0.02,
    maxRatePerSec: 0.5 / 60,
    outlierESec: 4000,
    intervalMs: 1000,
  },
};

// ===== 内部状態型定義 =====
interface HybridState {
  C: number | null;            // timeline -> epoch 変換オフセット
  D: number;                   // bufferedEnd - seekableEnd の差分記録
  locked: boolean;             // シーク中/直後のロック状態
  consec: number;              // PLL連続検出回数
  timers: number[];            // タイマーID配列（クリーンアップ用）
  video: HTMLVideoElement | null; // 対象video要素
  config: HybridCalibConfig;   // 設定
  cleanups: Array<() => void>; // イベントクリーンアップ
  lastNudgeAt: number;         // 直近のnudge時刻(ms)
  // ---- D_fallback（短期・限定用途） ----
  dfallback: number | null;    // 暫定D（幅とPLLのみで使用、ジャンプ式やC再生成には使わない）
  dfallbackUntil: number;      // 有効期限（ms）
  leadSamples: number[];       // futureLeadSec の直近サンプル
}

// グローバル状態
let state: HybridState = {
  C: null,
  D: 0,
  locked: false,
  consec: 0,
  timers: [],
  video: null,
  config: { ...DEFAULT_HYBRID_CONFIG },
  cleanups: [],
  lastNudgeAt: 0,
  dfallback: null,
  dfallbackUntil: 0,
  leadSamples: [],
};

// ===== ヘルパー関数 =====

/**
 * 現在のUTC時刻（秒）
 */
const now = (): number => Date.now() / 1000;

/**
 * bufferedEndを安全に取得
 */
function getBufferedEnd(video: HTMLVideoElement): number {
  try {
    const buffered = video.buffered;
    if (buffered && buffered.length > 0) {
      const end = buffered.end(buffered.length - 1);
      return Number.isFinite(end) ? end : NaN;
    }
    return NaN;
  } catch {
    return NaN;
  }
}

/**
 * 右端にいるかの判定
 */
function isAtEdge(video: HTMLVideoElement, bufSlackSec: number = 2): boolean {
  try {
    const bufferedEnd = getBufferedEnd(video);
    const currentTime = video.currentTime;
    return Number.isFinite(bufferedEnd) && Number.isFinite(currentTime) && (bufferedEnd - currentTime) <= bufSlackSec;
  } catch {
    return false;
  }
}

/**
 * デバッグログ出力（デバッグモード時のみ）
 */
function debugLog(event: string, data: any = {}): void {
  // マスターデバッグ（debug:all）または個別（debug:hybridCalib）がONのときのみ出力
  if (getBool(Keys.DebugAll) || getBool(Keys.DebugHybridCalib)) {
    // eslint-disable-next-line no-console
  console.debug(`[HybridCalib] ${event}`, {
      C: state.C,
      D: state.D,
      locked: state.locked,
      consec: state.consec,
      ...data,
    });
  }
}

// ===== タイマー管理 =====

/**
 * タイマーを登録
 */
function addTimer(timerId: number): void {
  state.timers.push(timerId);
}

/**
 * 全タイマーをクリア
 */
function clearAllTimers(): void {
  state.timers.forEach(id => {
    try {
      window.clearTimeout(id);
      window.clearInterval(id);
    } catch {}
  });
  state.timers = [];
}

// ===== ロック（イベント）管理 =====

const LOCK_MS = 1500;

function attachPlaybackLockEvents(video: HTMLVideoElement): void {
  const onSeeking = () => { state.locked = true; debugLog('lock', { via: 'seeking' }); };
  const onSeeked = () => {
    const id = window.setTimeout(() => { state.locked = false; debugLog('unlock', { via: 'seeked+delay' }); }, LOCK_MS);
    addTimer(id);
  };
  const onWaiting = () => { state.locked = true; debugLog('lock', { via: 'waiting' }); };
  const onStalled = () => { state.locked = true; debugLog('lock', { via: 'stalled' }); };
  const onPlaying = () => {
    const id = window.setTimeout(() => { state.locked = false; debugLog('unlock', { via: 'playing+delay' }); }, 250);
    addTimer(id);
  };

  try { video.addEventListener('seeking', onSeeking); } catch {}
  try { video.addEventListener('seeked', onSeeked); } catch {}
  try { video.addEventListener('waiting', onWaiting); } catch {}
  try { video.addEventListener('stalled', onStalled); } catch {}
  try { video.addEventListener('playing', onPlaying); } catch {}

  state.cleanups.push(() => {
    try { video.removeEventListener('seeking', onSeeking); } catch {}
    try { video.removeEventListener('seeked', onSeeked); } catch {}
    try { video.removeEventListener('waiting', onWaiting); } catch {}
    try { video.removeEventListener('stalled', onStalled); } catch {}
    try { video.removeEventListener('playing', onPlaying); } catch {}
  });
}

// ===== Edge-Snap実装 =====

/**
 * Edge-Snap キャリブレーション（右端でのみ実行）
 * 一度だけbufferedEndでCを確定し、同時にD=bufferedEnd-seekableEndを記録
 */
function executeEdgeSnap(video: HTMLVideoElement): boolean {
  // 再生操作中や待機中は避ける
  if (state.locked) {
    debugLog('edge-snap-skip', { reason: 'locked' });
    try { console.log('[EdgeSnap:SKIP]', { reason: 'locked' }); } catch {}
    return false;
  }

  // メディアが十分に用意できているか（HAVE_FUTURE_DATA 以上を目安）
  try {
    if ((video as any).readyState != null && (video as any).readyState < 3) {
      debugLog('edge-snap-skip', { reason: 'not-ready', readyState: (video as any).readyState });
      try { console.log('[EdgeSnap:SKIP]', { reason: 'not-ready', readyState: (video as any).readyState }); } catch {}
      return false;
    }
  } catch {}

  // 広告中は避ける
  try {
    if (isAdActive()) {
      debugLog('edge-snap-skip', { reason: 'ad-active' });
      try { console.log('[EdgeSnap:SKIP]', { reason: 'ad-active' }); } catch {}
      return false;
    }
  } catch {}

  // 端の近接に応じてダイナミックに余裕を広げる（境界落ちを避けつつ過剰に広げすぎない）
  let dynamicSlack = state.config.edgeSlackSec;
  try {
    const be = getBufferedEnd(video);
    const lagToBuffered = Number.isFinite(be) ? ((be as number) - (video.currentTime || 0)) : NaN;
    if (Number.isFinite(lagToBuffered)) {
      // 以前は lag-1 だったが、境界で外れやすいため ceil に変更。上限も 45s に拡張。
      const need = Math.ceil(lagToBuffered as number);
      dynamicSlack = Math.min(45, Math.max(dynamicSlack, need));
    }
  } catch {}

  if (!isAtEdge(video, dynamicSlack)) {
    debugLog('edge-snap-skip', { reason: 'not-at-edge' });
    try {
      const seekableEnd = getSeekableEnd(video);
      const bufferedEnd = getBufferedEnd(video);
      const lagToBuffered = Number.isFinite(bufferedEnd) ? (bufferedEnd - (video.currentTime || 0)) : NaN;
      const futureLead = (Number.isFinite(seekableEnd) && Number.isFinite(bufferedEnd)) ? (seekableEnd - (bufferedEnd as number)) : NaN;
      console.log('[EdgeSnap:SKIP]', { reason: 'not-at-edge', lagToBuffered, futureLead, edgeSlackSec: state.config.edgeSlackSec, dynamicSlack });
    } catch {}
    return false;
  }

  const bufferedEnd = getBufferedEnd(video);
  const seekableEnd = getSeekableEnd(video);
  
  if (!Number.isFinite(bufferedEnd) || !Number.isFinite(seekableEnd)) {
    debugLog('edge-snap-skip', { reason: 'invalid-ends', bufferedEnd, seekableEnd });
    return false;
  }

  // 強キャリブレーション実行
  const prevC = state.C;
  state.C = (now() - state.config.latencySec) - bufferedEnd;
  state.D = bufferedEnd - seekableEnd;
  state.consec = 0; // PLL連続カウントリセット
  // 確定

  debugLog('edge-snap-success', {
    prevC,
    newC: state.C,
    D: state.D,
    bufferedEnd,
    seekableEnd,
    currentTime: video.currentTime,
    delay: bufferedEnd - video.currentTime,
  });

  // 重要イベントは常時コンソールにも出す
  try {
    // eslint-disable-next-line no-console
    console.log('[EdgeSnap:SUCCESS]', {
      ts: new Date().toISOString(),
      C: state.C,
      D: state.D,
      bufferedEnd,
      seekableEnd,
      currentTime: (() => { try { return video.currentTime; } catch { return NaN; } })(),
    });
  } catch {}

  return true;
}

// ===== Live-PLL実装 =====

/**
 * Live-PLL tick（1Hz程度で実行）
 * seekableEndを観測し、誤差に応じてCを超低速で微調整
 */
function executePllTick(): void {
  if (!state.video || state.locked || !Number.isFinite(state.C)) {
    if (state.locked) debugLog('pll-skip', { reason: 'locked' });
    return;
  }

  const seekableEnd = getSeekableEnd(state.video);
  if (!Number.isFinite(seekableEnd)) {
    debugLog('pll-skip', { reason: 'invalid-seekable' });
    return;
  }

  // ---- D_fallback 採否の評価（短期・限定用途） ----
  try {
    const be = getBufferedEnd(state.video);
    const futureLead = (Number.isFinite(seekableEnd) && Number.isFinite(be)) ? ((seekableEnd as number) - (be as number)) : NaN;
    // D が既に確定していれば D_fallback は不要
    if (state.D !== 0) {
      if (state.dfallback != null) {
        debugLog('dfallback-clear', { reason: 'D-confirmed', dfallback: state.dfallback });
        try { console.log('[DFallback:CLEAR]', { reason: 'D-confirmed', dfallback: state.dfallback }); } catch {}
      }
      state.dfallback = null; state.dfallbackUntil = 0; state.leadSamples = [];
    } else if (Number.isFinite(futureLead)) {
      // 観測帯（約50〜70分先行相当: 3000..4200s）に入っている連続サンプルを集める
      const inRange = (futureLead as number) >= 3000 && (futureLead as number) <= 4200;
      if (inRange) {
        state.leadSamples.push(futureLead as number);
        if (state.leadSamples.length > 5) state.leadSamples.shift();
      } else {
        // 外れたらリセット（安定してから再評価）
        state.leadSamples = [];
      }
      const enough = state.leadSamples.length >= 5;
      const nowMs = Date.now();
      const expired = state.dfallback != null && nowMs > state.dfallbackUntil;
      if (expired) {
        debugLog('dfallback-clear', { reason: 'ttl-expired', dfallback: state.dfallback });
        try { console.log('[DFallback:CLEAR]', { reason: 'ttl-expired', dfallback: state.dfallback }); } catch {}
        state.dfallback = null; state.dfallbackUntil = 0;
      }
      if (state.dfallback == null && enough) {
        // 中央値でロバストに推定し、負符号でDへ（D=buffered−seekable）
        const sorted = [...state.leadSamples].sort((a,b)=>a-b);
        const mid = Math.floor(sorted.length/2);
        const med = sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
        const df = -med; // D は負方向
        state.dfallback = df;
        state.dfallbackUntil = nowMs + 3 * 60 * 1000; // 3分TTL
        debugLog('dfallback-adopt', { dfallback: state.dfallback, samples: state.leadSamples });
        try { console.log('[DFallback:ADOPT]', { dfallback: state.dfallback, samples: state.leadSamples }); } catch {}
      }
    }
  } catch {}

  // 誤差計算: e = (seekableEnd + D + C) - (now - L)
  const nowEpoch = now();
  const dEff = state.D !== 0 ? state.D : ((state.dfallback != null && Date.now() <= state.dfallbackUntil) ? state.dfallback as number : 0);
  const e = (seekableEnd + dEff + state.C!) - (nowEpoch - state.config.latencySec);
  
  // 外れ値チェック
  if (Math.abs(e) > state.config.pll.outlierESec) {
    state.consec = 0;
    debugLog('pll-outlier', { e, threshold: state.config.pll.outlierESec });
    return;
  }

  // ヒステリシス（小さな誤差は無視）
  if (Math.abs(e) <= state.config.pll.hysSec) {
    state.consec = 0;
    return;
  }

  // 連続検出カウント
  state.consec++;
  if (state.consec < state.config.pll.consecN) {
    debugLog('pll-accumulating', { e, consec: state.consec, needed: state.config.pll.consecN });
    return;
  }

  // PLL補正実行
  state.consec = 0;
  const currentC = state.C!; // この時点で必ず数値
  const targetC = currentC - state.config.pll.alpha * e;
  const delta = Math.max(
    -state.config.pll.maxRatePerSec,
    Math.min(state.config.pll.maxRatePerSec, targetC - currentC)
  );
  const prevC = currentC;
  state.C = currentC + delta;

  debugLog('pll-adjust', {
    e,
    prevC,
    newC: state.C,
    delta,
    targetC,
    seekableEnd,
    dEff,
  });
}

// ===== 公開API =====

/**
 * ハイブリッドキャリブレーションシステムの初期化
 */
export function initHybrid(video: HTMLVideoElement, config: Partial<HybridCalibConfig> = {}): void {
  // 既存システムのクリーンアップ
  disposeHybrid();

  // 状態初期化
  state.video = video;
  state.config = { ...DEFAULT_HYBRID_CONFIG, ...config };
  // 上書き設定（上級者向け）: localStorageの cfg:hybrid を統合
  try {
    const override = getJSON<Partial<HybridCalibConfig>>(Keys.CfgHybrid);
    if (override) {
      state.config = {
        ...state.config,
        ...override,
        pll: { ...state.config.pll, ...(override.pll ?? {}) },
      } as HybridCalibConfig;
      debugLog('config-override', { override: state.config });
    }
  } catch {}
  state.C = null;
  state.D = 0;
  state.locked = false;
  state.consec = 0;

  debugLog('init', { config: state.config });
}

/**
 * キャリブレーション開始（Edge-Snap監視を開始）
 */
export function startCalibration(): void {
  if (!state.video) {
    debugLog('start-error', { reason: 'no-video' });
    return;
  }

  // 再生イベントロック
  attachPlaybackLockEvents(state.video);

  // 初期の暫定キャリブレーション（右端にいない/バッファ未整備でもCを仮置き）
  try {
    if (state.C === null && state.video) {
      const v = state.video;
      const L = state.config.latencySec;
      const seekEnd = getSeekableEnd(v);
      const bufEnd = getBufferedEnd(v);
      const preferBufferedThreshold = 120; // seconds
      // 品質ゲート: bufferedEnd が整備されていない間は恒久Cを作らない（フォールバック使用に誘導）
      if (Number.isFinite(bufEnd) && (bufEnd as number) > 0) {
        let endEff = Number.NaN;
        if (!Number.isFinite(seekEnd) || seekEnd <= 0 || (seekEnd - (bufEnd as number)) > preferBufferedThreshold) {
          endEff = bufEnd as number;
        }
        if (!Number.isFinite(endEff)) {
          endEff = Number.isFinite(seekEnd) && seekEnd > 0 ? seekEnd : (Number.isFinite(bufEnd) ? (bufEnd as number) : Number.NaN);
        }
        if (Number.isFinite(endEff)) {
          const prevC = state.C;
          state.C = (now() - L) - (endEff as number);
          // D は両方ある場合のみ記録
          if (Number.isFinite(bufEnd) && Number.isFinite(seekEnd)) {
            state.D = (bufEnd as number) - (seekEnd as number);
          } else {
            state.D = 0;
          }
          // 初期Cの異常値ガード（あまりに大きい誤差のCは捨ててフォールバックへ誘導）
          const e_raw = (Number.isFinite(seekEnd) && Number.isFinite(state.C as any)) ? ((seekEnd as number) + (state.C as number) - ((now()) - L)) : NaN;
          const abnormal = Number.isFinite(e_raw) && Math.abs(e_raw as number) > 600; // 10分超なら異常
          debugLog('provisional-init-calib', { prevC, newC: state.C, D: state.D, seekEnd, bufEnd, endEff, e_raw, abnormal });
          try { console.log('[HybridCalib] provisional-init-calib', { C: state.C, D: state.D, seekEnd, bufEnd, endEff, e_raw, abnormal }); } catch {}
          if (abnormal) {
            const bad = state.C;
            state.C = null;
            state.D = 0;
            debugLog('provisional-init-abort', { reason: 'abnormal-C', e_raw, badC: bad });
            try { console.warn('[HybridCalib] provisional-init-abort', { reason: 'abnormal-C', e_raw, badC: bad }); } catch {}
          }
        }
      } else {
        debugLog('provisional-init-skip', { reason: 'buffered-not-ready', seekEnd, bufEnd });
      }
    }
  } catch {}

  // Edge-Snap監視開始
  const edgeMonitorId = window.setInterval(() => {
    // Dが未確定の間もEdge-Snapを継続試行（C=null だけでなく D===0 も対象）
    const needSnap = (state.C === null) || (state.D === 0);
    if (needSnap) {
      if (executeEdgeSnap(state.video!)) {
        // 成功したらPLL開始
        const pllId = window.setInterval(executePllTick, state.config.pll.intervalMs);
        addTimer(pllId);
        debugLog('pll-started');
        try { console.log('[HybridCalib] pll-started'); } catch {}
      } else {
        // 端に近い場合は軽く端へ寄せてから再試行させる
        try { nudgeToLiveEdge(state.video!); } catch {}
      }
    }
  }, 1000); // 1秒間隔で右端監視

  addTimer(edgeMonitorId);
  debugLog('monitoring-started');
  try { console.log('[HybridCalib] monitoring-started'); } catch {}
}

/**
 * 右端へ軽く寄せる（近いときだけ実施、過剰に繰り返さない）
 */
function nudgeToLiveEdge(video: HTMLVideoElement): void {
  // ロック中はスキップ
  if (state.locked) { debugLog('nudge-skip', { reason: 'locked' }); return; }
  const nowMs = Date.now();
  if (nowMs - state.lastNudgeAt < 5000) { debugLog('nudge-skip', { reason: 'cooldown' }); return; }

  // メディアの準備状況を確認（HAVE_FUTURE_DATA 以上）
  try {
    if ((video as any).readyState != null && (video as any).readyState < 3) {
      debugLog('nudge-skip', { reason: 'not-ready', readyState: (video as any).readyState });
      return;
    }
  } catch {}

  // 近接しているか（buffered基準で判定する）
  const cur = video.currentTime;
  const be = getBufferedEnd(video);
  if (!Number.isFinite(cur) || !Number.isFinite(be)) { debugLog('nudge-skip', { reason: 'invalid-ends', cur, be }); return; }

  // lag（= bufferedEnd − currentTime）が小さいほど端に近い
  const lagToBuffered = (be as number) - cur;
  // 最大許容距離（厳しめに 30s、設定値がそれ以下なら 30 を優先。上限は 45s を目安）
  const maxLag = Math.min(45, Math.max(30, state.config.nearLiveSlackSec));
  if (lagToBuffered <= 0 || lagToBuffered > maxLag) {
    debugLog('nudge-skip', { reason: 'not-near-buffered', lagToBuffered, maxLag });
    return;
  }

  // 軽く端へ寄せる：bufferedEnd の直前に狙ってシーク（isAtEdge判定に入りやすくする）
  try {
    const start = getSeekableStart(video);
    const target = Math.max(start, (be as number) - 0.5);
    seek(video, target);
    debugLog('nudge', { to: target, lagToBuffered, be, maxLag });
    try { console.log('[HybridCalib] nudge', { to: target, lagToBuffered, be, maxLag }); } catch {}
    state.lastNudgeAt = nowMs;
  } catch {}
}

/**
 * 現在のC値を取得（スナップショット）
 */
export function getC(): number | null {
  return state.C;
}

/**
 * 指定epochへのジャンプ実行
 * 関数内でCsnapを固定してレース回避
 */
import type { SeekResult } from './seek';

export function jumpToEpoch(targetEpoch: number, CsnapArg?: number): SeekResult | null {
  if (!state.video) {
    debugLog('jump-error', { reason: 'no-video' });
    return null;
  }

  // 初回実行時、CもCsnapArgも無い場合のみEdge-Snapを試行
  if (!Number.isFinite(state.C) && !Number.isFinite(CsnapArg as any)) {
    if (!executeEdgeSnap(state.video)) {
      debugLog('jump-error', { reason: 'not-calibrated-and-not-at-edge' });
      return null;
    }
  }

  // この時点でCは必ず数値になっている
  if (!Number.isFinite(state.C) && !Number.isFinite(CsnapArg as any)) {
    debugLog('jump-error', { reason: 'C-still-not-available' });
    return null;
  }

  // ロック開始
  state.locked = true;

  // Cをスナップショット（関数内固定）
  const Csnap = (Number.isFinite(CsnapArg as any) ? (CsnapArg as number) : (state.C as number));
  const t = targetEpoch - Csnap;

  debugLog('jump-execute', {
    targetEpoch,
    Csnap,
    t,
  });

  // シーク実行
  try {
    // 統一クランプ・安全処理で実行
    const result = seek(state.video, t);

    // ロック解除タイマー
    const unlockId = window.setTimeout(() => {
      state.locked = false;
      debugLog('unlock');
    }, 1500);
    addTimer(unlockId);

    return result;
  } catch (error) {
    state.locked = false;
    debugLog('jump-error', { error });
    return null;
  }
}

/**
 * システムの破棄（全タイマー停止）
 */
export function disposeHybrid(): void {
  clearAllTimers();
  state.locked = false;
  state.consec = 0;
  // イベントクリーンアップ
  try { state.cleanups.forEach(fn => fn()); } catch {}
  state.cleanups = [];
  debugLog('disposed');
}

/**
 * 現在の状態を取得（デバッグ用）
 */
export function getHybridState(): Readonly<{
  C: number | null;
  D: number;
  locked: boolean;
  consec: number;
  hasVideo: boolean;
  isAtEdge: boolean;
  dfallback: number | null;
  dfallbackValid: boolean;
  dfallbackTtlSec: number;
}> {
  const nowMs = Date.now();
  const valid = state.dfallback != null && nowMs <= state.dfallbackUntil;
  const ttlSec = valid ? Math.max(0, Math.ceil((state.dfallbackUntil - nowMs) / 1000)) : 0;
  return {
    C: state.C,
    D: state.D,
    locked: state.locked,
    consec: state.consec,
    hasVideo: state.video !== null,
    isAtEdge: state.video ? isAtEdge(state.video, state.config.edgeSlackSec) : false,
    dfallback: valid ? (state.dfallback as number) : null,
    dfallbackValid: valid,
    dfallbackTtlSec: ttlSec,
  };
}

/**
 * 手動でEdge-Snapを実行（デバッグ/UI用）
 */
export function manualEdgeSnap(): boolean {
  if (!state.video) return false;
  return executeEdgeSnap(state.video);
}

// ===== jump.ts統合用ヘルパー =====

/**
 * epoch候補から最適なものを選択（既存ロジックをハイブリッド対応）
 * DVR窓（seekable範囲をepoch変換）に入る候補を優先、窓外なら最も近いものを選択
 */
export function resolveEpochFromCandidates(epochCandidates: number[], CsnapArg?: number): number | null {
  // 必須条件: video と 候補があること。C/Csnap は不要（窓は now−L と幅だけで決定）。
  if (!state.video || epochCandidates.length === 0) {
    debugLog('resolve-epoch-error', { hasVideo: !!state.video, candidates: epochCandidates.length });
    return null;
  }

  // 右端は常に「今 − L」に固定
  const L = state.config.latencySec;
  const E_end = now() - L;

  // タイムライン上の幅を算出
  const start = getSeekableStart(state.video);
  const end = getSeekableEnd(state.video);
  const epsilon = 0.5; // ごく小さなガード
  const endGuard = Math.max(start, end - epsilon);
  const widthSeekable = Math.max(0, endGuard - start);

  // Edge-Snap 測定済みなら D=bufferedEnd−seekableEnd を幅に反映（右端先行の補正）
  let width = widthSeekable;
  let dUse = 0;
  if (Number.isFinite(state.D) && state.D !== 0) {
    dUse = state.D;
  } else if (state.dfallback != null && Date.now() <= state.dfallbackUntil) {
    dUse = state.dfallback as number;
  }
  if (dUse !== 0) {
    const corrected = widthSeekable + dUse; // D は負方向（seekable が未来）なら幅を縮める
    if (corrected > 5) {
      width = corrected;
    }
  }

  const E_start = E_end - width;

  // デバッグ出力
  const Csnap = (Number.isFinite(CsnapArg as any) ? (CsnapArg as number) : (state.C as number));
  debugLog('resolve-epoch', {
    candidates: epochCandidates,
    DVR_window: { E_start, E_end, width },
    timeline_window: { start, endGuard, widthSeekable, D: state.D },
    Csnap,
    L,
  });
  // 目視しやすい簡易ログ（ネストしない）
  debugLog('window', {
    E_start,
    E_end,
    width,
    L,
    Csnap,
    D: state.D,
    start,
    endGuard,
    widthSeekable,
  });

  // 窓内に入る候補をフィルタリング
  const withinWindow = epochCandidates.filter(e => e >= E_start && e <= E_end);
  
  if (withinWindow.length > 0) {
    // 窓内に候補がある場合：現在時刻(now - L)に最も近いものを選択
    const currentEpochEstimate = E_end; // = now() - L
    const best = withinWindow.reduce((prev, curr) => 
      Math.abs(curr - currentEpochEstimate) < Math.abs(prev - currentEpochEstimate) ? curr : prev
    );
    
    debugLog('resolve-epoch-result', { selected: best, reason: 'within-window' });
    return best;
  }

  // 窓外の場合：DVR窓の中心に最も近い候補を選択
  const windowCenter = (E_start + E_end) / 2;
  const best = epochCandidates.reduce((prev, curr) =>
    Math.abs(curr - windowCenter) < Math.abs(prev - windowCenter) ? curr : prev
  );

  debugLog('resolve-epoch-result', { selected: best, reason: 'closest-to-window' });
  return best;
}

/** 現在のハイブリッド設定を取得（デバッグ用） */
export function getHybridConfig(): Readonly<HybridCalibConfig> {
  return { ...state.config, pll: { ...state.config.pll } };
}

/**
 * 暫定Cを設定（Edge-Snapまでの間、このCでジャンプ計算を安定化）
 */
// provisional C や即時Edge-Snapは採用しない（セッション内の近似はjump.ts側で管理）
