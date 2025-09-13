/**
 * Seekable anomaly probe
 * 目的: seekable.end が恒常的に +60 分先を指しているかを観測・記録する
 * - 5 秒間隔で以下を測定し、リングバッファとコンソールへ出力
 *   - seekable.start/end, buffered.end, currentTime
 *   - D_cur = bufferedEnd - seekableEnd（正ならbufferedが右、負ならseekableが未来）
 *   - C_hybrid, D_hybrid（ハイブリッド較正のC/D）
 *   - C_classic（従来較正のC）
 *   - e_raw = (seekableEnd + C_*) − (now − L)
 *   - e_withD = (seekableEnd + D_hybrid + C_hybrid) − (now − L)
 *   - 60分仮説判定: |e_raw − 3600| < tol
 */

import { getSeekableStart, getSeekableEnd } from './seek';
import { logEvent } from '../events/emit';
import { getHybridConfig, getHybridState } from './hybridCalibration';

let timer: number | null = null;
let attachedVideo: HTMLVideoElement | null = null;
let initialized = false;
let prevDcur: number | null = null;
let prevApprox60: boolean | null = null;
let lastSummaryMs = 0;

function nowSec(): number { return Date.now() / 1000; }

function getBufferedEndSafe(v: HTMLVideoElement): number {
  try {
    const r = v.buffered;
    if (r && r.length > 0) {
      const e = r.end(r.length - 1);
      return Number.isFinite(e) ? e : NaN;
    }
  } catch {}
  return NaN;
}

export function startSeekableAnomalyProbe(video: HTMLVideoElement): void {
  attachedVideo = video;
  stopSeekableAnomalyProbe();

  const cfg = safe(() => getHybridConfig(), null as any);
  const L = cfg?.latencySec ?? 20;
  const intervalMs = 5000;
  const tolSec = 180; // 60分仮説の許容誤差（±3分）

  const tick = () => {
    try {
      const v = attachedVideo;
      if (!v || !v.isConnected) return;

      const start = getSeekableStart(v);
      const end = getSeekableEnd(v);
      const bufEnd = getBufferedEndSafe(v);
      const cur = safe(() => v.currentTime, NaN);

      const st = safe(() => getHybridState(), { C: null, D: 0, locked: false, consec: 0, hasVideo: false, isAtEdge: false });
      const C_h = Number.isFinite(st.C as any) ? (st.C as number) : NaN;
      const D_h = Number.isFinite(st.D as any) ? (st.D as number) : 0;

      const E_live = nowSec() - L;
      const e_raw_h = Number.isFinite(C_h) ? (end + C_h) - E_live : NaN;
      const e_withD = Number.isFinite(C_h) ? (end + D_h + C_h) - E_live : NaN;

      const D_cur = Number.isFinite(bufEnd) && Number.isFinite(end) ? (bufEnd - end) : NaN;
      const approx60 = Number.isFinite(e_raw_h) ? Math.abs(e_raw_h - 3600) <= tolSec : null;

      const futureLeadSec = (Number.isFinite(end) && Number.isFinite(bufEnd)) ? (end - (bufEnd as number)) : NaN;
      const lagToBufferedSec = (Number.isFinite(bufEnd) && Number.isFinite(cur)) ? ((bufEnd as number) - (cur as number)) : NaN;

      const payload = {
        L,
        start,
        end,
        bufferedEnd: bufEnd,
        currentTime: cur,
        D_cur,
        futureLeadSec,
        lagToBufferedSec,
        C_hybrid: C_h,
        D_hybrid: D_h,
        e_raw_h,
        e_withD,
        approx60_hypothesis: approx60,
        url: safe(() => location.href, ''),
      };

      logEvent('seekable-probe', payload);

      // 初回スナップショット
      if (!initialized) {
        initialized = true;
        try {
          // eslint-disable-next-line no-console
          console.info('[SeekProbe:START]', {
            ts: new Date().toISOString(), url: safe(() => location.href, ''), L,
            videoReadyState: safe(() => v.readyState, 0), currentSrc: safe(() => (v as any).currentSrc, ''),
          });
        } catch {}
      }

      // 1分ごとに要約サマリのみ出力（通常のTICKはリングバッファへ）
      const nowMs = Date.now();
      if (nowMs - lastSummaryMs >= 60_000) {
        lastSummaryMs = nowMs;
        try {
          // eslint-disable-next-line no-console
          console.info('[SeekProbe:SUMMARY]', new Date(nowMs).toISOString(), {
            D_cur,
            futureLeadSec,
            lagToBufferedSec,
            end,
            bufferedEnd: bufEnd,
            currentTime: cur,
          });
        } catch {}
      }

      // 重要変化のサマリ（D_curやapprox60の変化）
      const significantD = Number.isFinite(D_cur) && (prevDcur == null || Math.abs((D_cur as number) - prevDcur) >= 60);
      const approxChanged = approx60 !== prevApprox60;
      if (significantD || approxChanged) {
        try {
          // eslint-disable-next-line no-console
          console.info('[SeekProbe:UPDATE]', {
            ts: new Date().toISOString(),
            D_cur,
            approx60_hypothesis: approx60,
            e_raw_h,
            e_withD,
          });
        } catch {}
      }

      prevDcur = Number.isFinite(D_cur) ? (D_cur as number) : prevDcur;
      prevApprox60 = approx60 as any;
    } catch {}
  };

  // 初回即時 + 周期
  tick();
  timer = window.setInterval(tick, intervalMs);
}

export function stopSeekableAnomalyProbe(): void {
  if (timer != null) {
    try { window.clearInterval(timer); } catch {}
    timer = null;
  }
}

function safe<T>(fn: () => T, fallback: T): T { try { return fn(); } catch { return fallback; } }
