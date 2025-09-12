/**
 * 時刻ジャンプ計算の統合
 * 入力→正規化→TZ→epoch→t_target→範囲内ならseek 範囲外は端比較でジャンプ
 */

import { parseAndNormalize24h } from './timeparse';
import { getTodayInZone, toEpochInZone, type YMD } from './timezone';
import * as calibration from './calibration';
import { isAdActive } from './adsense';
import { showToast } from '../ui/toast';
import { getString } from '../store/local';
import { t } from '../utils/i18n';
// startEpoch/latency 補正は廃止（シンプル化）
import { getSeekableStart, getSeekableEnd, seek, GUARD_SEC } from './seek';
import { logJump } from '../events/emit';
// ハイブリッドキャリブレーション
import { jumpToEpoch, resolveEpochFromCandidates, getC as getHybridC, manualEdgeSnap, getHybridState, getHybridConfig } from './hybridCalibration';

export interface JumpOptions {
  date?: YMD;       // テストや特殊用途で日付を固定
  cOverride?: number; // テスト用にCを固定
}

// セッション中に一度だけ計算した暫定Csnapを保持
let fallbackCsnap: number | null = null;

export type JumpDecision =
  | 'seek-in-range'
  | 'jump-start'
  | 'jump-end'
  | 'parse-error';

export interface JumpResult {
  ok: boolean;
  decision: JumpDecision;
  reason?: string;
  normalized?: string;
  epoch?: number;
  target?: number; // 適用したt
  range?: { start: number; end: number };
  flags?: { ambiguous: boolean; gap: boolean };
}

/**
 * 指定ゾーンの今日のローカル時刻へジャンプ
 */
export function jumpToLocalTime(
  video: HTMLVideoElement,
  input: string,
  zone: string,
  opts: JumpOptions = {}
): JumpResult {
  if (isAdActive()) {
    showToast(t('toast.ad_paused'), 'warn');
    return { ok: false, decision: 'parse-error', reason: 'ad-active' };
  }
  const DEBUG = safeGetLocal('debug:jump') === '1';
  const parsed = parseAndNormalize24h(input);
  if (!parsed.ok) {
    return { ok: false, decision: 'parse-error', reason: parsed.error };
  }

  // 候補日（today / yesterday / tomorrow）を用意し、最適な候補を選ぶ
  const today = opts.date ?? getTodayInZone(zone);
  const yesterday = shiftYMD(today, -1);
  const tomorrow = shiftYMD(today, +1);
  const tzToday = toEpochInZone(zone, { hh: parsed.hh, mm: parsed.mm, ss: parsed.ss }, { date: today });
  const tzYest = toEpochInZone(zone, { hh: parsed.hh, mm: parsed.mm, ss: parsed.ss }, { date: yesterday });
  const tzTmrw = toEpochInZone(zone, { hh: parsed.hh, mm: parsed.mm, ss: parsed.ss }, { date: tomorrow });

  // startEpoch を使った直写像は廃止（シンプル化）

  // Cの取得 暫定が無ければフォールバックで計算
  let C = opts.cOverride ?? (typeof calibration.getC === 'function' ? calibration.getC() : null);
  if (C == null) {
    const end = effectiveEndForJump(video);
    if (end > 0) C = Date.now() / 1000 - end;
  }

  if (C == null) {
    return { ok: false, decision: 'parse-error', reason: 'C not available yet' };
  }

  const start = getSeekableStart(video);
  const end = getSeekableEnd(video);
  const endGuard = Math.max(start, end - GUARD_SEC);

  // 再生範囲
  const E_start = C + start;
  const E_end = C + endGuard;

  // today/yesterday/tomorrow のうち 範囲内に入る候補を選択（近い将来/過去の順に）
  const candidates = [
    { tag: 'today', E: tzToday.epochSec, tz: tzToday },
    { tag: 'yesterday', E: tzYest.epochSec, tz: tzYest },
    { tag: 'tomorrow', E: tzTmrw.epochSec, tz: tzTmrw },
  ];
  const within = candidates.filter((c) => c.E >= E_start && c.E <= E_end);
  // 範囲内があれば end（=“今”）に近い方を選ぶ
  // 範囲外しか無ければ、区間 [E_start, E_end] への距離が最小の候補を選ぶ（today固定をやめる）
  function distToInterval(E: number): number {
    if (E < E_start) return E_start - E;
    if (E > E_end) return E - E_end;
    return 0;
  }
  const best = within.length
    ? within.sort((a, b) => Math.abs(E_end - a.E) - Math.abs(E_end - b.E))[0]
    : candidates
        .map((c) => ({ c, d: distToInterval(c.E) }))
        .sort((a, b) => a.d - b.d)[0].c;

  const E_target = best.E;
  let t_endBased = E_target - C;

  // レイテンシ補正（手動/自動）は廃止。t_endBased をそのまま用いる

  // 位相補正（phase）は廃止。t_target は t_endBased をそのまま用いる
  const t_target = t_endBased;

  if (DEBUG) {
    const now = Math.floor(Date.now() / 1000);
    const cal = typeof calibration.getCalibration === 'function' ? calibration.getCalibration() : ({} as any);
    // 概要を出力（本番でも読みやすいように整形）
    // eslint-disable-next-line no-console
    console.debug('[Jump] request', {
      input,
      normalized: parsed.normalized,
      zone,
      todayInZone: today,
      picked: best.tag,
      tzWallPicked: best.tz.wall,
      tzWallToday: tzToday.wall,
      tzWallYesterday: tzYest.wall,
      tzWallTomorrow: tzTmrw.wall,
      E_target,
      now,
      C,
      calStatus: cal.status,
      mad: cal.mad,
      t_endBased,
      start,
      end,
      endGuard,
      E_start,
      E_end,
      t_target,
    });
  }

  // 範囲内ならそのままseek
  if (t_target >= start && t_target <= endGuard) {
    const r = seek(video, t_target);
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[Jump] seek-in-range', r);
    }
    try { logJump({ decision: 'seek-in-range', input, zone, normalized: parsed.normalized, epoch: E_target, result: r, flags: { ambiguous: best.tz.ambiguous, gap: best.tz.gap } }); } catch {}
    return {
      ok: true,
      decision: 'seek-in-range',
      normalized: parsed.normalized,
      epoch: E_target,
      target: r.target,
      range: r.range,
      flags: { ambiguous: best.tz.ambiguous, gap: best.tz.gap },
    };
  }

  // 範囲外は epoch 距離で端比較 同距離は live edge を優先
  const dStart = Math.abs(E_target - E_start);
  const dEnd = Math.abs(E_target - E_end);
  if (dEnd <= dStart) {
    const r = seek(video, endGuard);
    showToast(t('toast.moved_current'), 'info');
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[Jump] jump-end', { dStart, dEnd, r });
    }
    try { logJump({ decision: 'jump-end', input, zone, normalized: parsed.normalized, epoch: E_target, result: r, distances: { dStart, dEnd }, flags: { ambiguous: best.tz.ambiguous, gap: best.tz.gap } }); } catch {}
    return {
      ok: true,
      decision: 'jump-end',
      normalized: parsed.normalized,
      epoch: E_target,
      target: r.target,
      range: r.range,
      flags: { ambiguous: best.tz.ambiguous, gap: best.tz.gap },
    };
  } else {
    const r = seek(video, start);
    showToast(t('toast.moved_start'), 'info');
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[Jump] jump-start', { dStart, dEnd, r });
    }
    try { logJump({ decision: 'jump-start', input, zone, normalized: parsed.normalized, epoch: E_target, result: r, distances: { dStart, dEnd }, flags: { ambiguous: best.tz.ambiguous, gap: best.tz.gap } }); } catch {}
    return {
      ok: true,
      decision: 'jump-start',
      normalized: parsed.normalized,
      epoch: E_target,
      target: r.target,
      range: r.range,
      flags: { ambiguous: best.tz.ambiguous, gap: best.tz.gap },
    };
  }
}

/**
 * ハイブリッドキャリブレーション版の時刻ジャンプ
 * Edge-Snap + Live-PLL システムを使用してドリフト問題を解決
 */
export function jumpToLocalTimeHybrid(
  _video: HTMLVideoElement,
  input: string,
  zone: string,
  opts: JumpOptions = {}
): JumpResult {
  if (isAdActive()) {
    showToast(t('toast.ad_paused'), 'warn');
    return { ok: false, decision: 'parse-error', reason: 'ad-active' };
  }

  const DEBUG = safeGetLocal('debug:jump') === '1' || safeGetLocal('debug:hybridCalib') === '1';
  const parsed = parseAndNormalize24h(input);
  if (!parsed.ok) {
    return { ok: false, decision: 'parse-error', reason: parsed.error };
  }

  // 候補日（today / yesterday / tomorrow）のepoch値を生成
  const today = opts.date ?? getTodayInZone(zone);
  const yesterday = shiftYMD(today, -1);
  const tomorrow = shiftYMD(today, +1);

  const tzToday = toEpochInZone(zone, { hh: parsed.hh, mm: parsed.mm, ss: parsed.ss }, { date: today });
  const tzYest = toEpochInZone(zone, { hh: parsed.hh, mm: parsed.mm, ss: parsed.ss }, { date: yesterday });
  const tzTmrw = toEpochInZone(zone, { hh: parsed.hh, mm: parsed.mm, ss: parsed.ss }, { date: tomorrow });

  const epochCandidates = [tzToday.epochSec, tzYest.epochSec, tzTmrw.epochSec];

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.debug('[Jump:Hybrid] candidates', {
      input,
      normalized: parsed.normalized,
      zone,
      today: { date: today, epoch: tzToday.epochSec, wall: tzToday.wall },
      yesterday: { date: yesterday, epoch: tzYest.epochSec, wall: tzYest.wall },
      tomorrow: { date: tomorrow, epoch: tzTmrw.epochSec, wall: tzTmrw.wall },
      C: getHybridC(),
    });
  }

  // ハイブリッドCがあればそれを使い、無ければセッション内の暫定Csnapを使う
  let Csnap = getHybridC();
  if (!Number.isFinite(Csnap as any) && Number.isFinite(fallbackCsnap as any)) {
    Csnap = fallbackCsnap as number;
  }
  // 通常の候補選択（折り畳みや日付固定は行わない）
  let targetEpoch = resolveEpochFromCandidates(epochCandidates, Csnap ?? undefined);
  if (targetEpoch === null) {
    // まだCが無い場合などは、まずEdge-Snapを試みる
    try {
      const st = getHybridState();
      if (st.hasVideo && st.isAtEdge) {
        manualEdgeSnap();
        Csnap = getHybridC();
        if (Number.isFinite(Csnap as any)) fallbackCsnap = null; // 実キャリブに切替
        targetEpoch = resolveEpochFromCandidates(epochCandidates, Csnap ?? undefined);
      }
    } catch {}
  }

  // 自動キャリブは行わない（端に近づいたときのみ手動のEdge-Snap許容）

  if (targetEpoch === null) {
    // フォールバック: 暫定Csnapで窓を作り、近い候補にapprox jump（state.Cは更新しない）
    try {
      const v = _video;
      const cfg = getHybridConfig();
      const L = cfg?.latencySec ?? 20;
      const endEff = effectiveEndForJump(v);
      if (endEff > 0) {
        const CsnapTemp = (Date.now() / 1000 - L) - endEff;
        // セッション内で固定（以降のジャンプの基準が動かないように）
        if (!Number.isFinite(fallbackCsnap as any)) { fallbackCsnap = CsnapTemp; }
        const start = getSeekableStart(v);
        const end = getSeekableEnd(v);
        const endGuard = Math.max(start, end - GUARD_SEC);
        const E_start = start + CsnapTemp;
        const E_end = endGuard + CsnapTemp;
        function distToInterval(E: number): number { if (E < E_start) return E_start - E; if (E > E_end) return E - E_end; return 0; }
        const within = epochCandidates.filter((E) => E >= E_start && E <= E_end);
        const currentEpochEstimate = Date.now() / 1000 - L;
        const picked = within.length > 0
          ? within.reduce((p,c) => Math.abs(c - currentEpochEstimate) < Math.abs(p - currentEpochEstimate) ? c : p)
          : epochCandidates.reduce((prev, curr) => (distToInterval(curr) < distToInterval(prev) ? curr : prev));
        const tTarget = picked - (fallbackCsnap as number);
        const r = seek(v, tTarget);
        // 軽い通知で案内
        showToast(t('toast.moved_current'), 'info');
        try { logJump({ decision: 'seek-in-range', input, zone, normalized: parsed.normalized, epoch: picked, result: r, flags: { ambiguous: false, gap: false } }); } catch {}
        return { ok: true, decision: 'seek-in-range', normalized: parsed.normalized, epoch: picked, target: r.target, range: r.range, flags: { ambiguous: false, gap: false } };
      }
    } catch {}
    return { ok: false, decision: 'parse-error', reason: 'hybrid system not ready' };
  }

  // 選択されたepochに対応する候補を特定（ログ用）
  let selectedCandidate = 'today';
  let selectedTz = tzToday;
  if (targetEpoch === tzYest.epochSec) {
    selectedCandidate = 'yesterday';
    selectedTz = tzYest;
  } else if (targetEpoch === tzTmrw.epochSec) {
    selectedCandidate = 'tomorrow';
    selectedTz = tzTmrw;
  }
  // 日付固定は行わない（元のロジックに戻す）

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.debug('[Jump:Hybrid] selected', {
      targetEpoch,
      candidate: selectedCandidate,
      wall: selectedTz.wall,
    });
  }

  // ハイブリッドシステムでジャンプ実行
  const success = jumpToEpoch(targetEpoch, Csnap ?? undefined);
  if (!success) {
    return { ok: false, decision: 'parse-error', reason: 'jump execution failed' };
  }

  // 成功時のログ出力
  try {
    logJump({
      decision: 'seek-in-range', // ハイブリッドシステムでは内部でクランプ処理済み
      input,
      zone,
      normalized: parsed.normalized,
      epoch: targetEpoch,
      result: { target: targetEpoch, clamped: false, reason: 'within' as const, range: { start: 0, end: 0 } },
      flags: { ambiguous: selectedTz.ambiguous, gap: selectedTz.gap }
    });
  } catch {}

  return {
    ok: true,
    decision: 'seek-in-range',
    normalized: parsed.normalized,
    epoch: targetEpoch,
    target: targetEpoch,
    range: { start: 0, end: 0 }, // ハイブリッドシステムで内部処理済み
    flags: { ambiguous: selectedTz.ambiguous, gap: selectedTz.gap },
  };
}

function safeGetLocal(key: string): string | null { return getString(key); }

function shiftYMD(d: YMD, deltaDays: number): YMD {
  try {
    const dt = new Date(Date.UTC(d.year, d.month - 1, d.day));
    dt.setUTCDate(dt.getUTCDate() + deltaDays);
    return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
  } catch {
    // フォールバック（雑だが壊さない）
    return d;
  }
}

// Prefer buffered end when it is far behind seekable end (e.g., ~59min anomaly),
// otherwise use seekable end. This mirrors calibration's safeEnd behavior.
function effectiveEndForJump(video: HTMLVideoElement): number {
  try {
    const seekEnd = getSeekableEnd(video);
    let bufEnd = 0;
    const r = video.buffered;
    if (r && r.length > 0) {
      try { bufEnd = r.end(r.length - 1); } catch { bufEnd = 0; }
    }
    const preferBufferedThreshold = 120; // seconds
    if (Number.isFinite(bufEnd) && bufEnd > 0) {
      if (!Number.isFinite(seekEnd) || seekEnd <= 0) return bufEnd;
      if (seekEnd - bufEnd > preferBufferedThreshold) return bufEnd;
    }
    return Number.isFinite(seekEnd) && seekEnd > 0 ? seekEnd : (Number.isFinite(bufEnd) ? bufEnd : 0);
  } catch {
    return getSeekableEnd(video);
  }
}
