/**
 * 時刻ジャンプ計算の統合
 * 入力→正規化→TZ→epoch→t_target→範囲内ならseek 範囲外は端比較でジャンプ
 */

import { parseAndNormalize24h } from './timeparse';
import { getTodayInZone, toEpochInZone, type YMD } from './timezone';
import * as calibration from './calibration';
// startEpoch/latency 補正は廃止（シンプル化）
import { getSeekableStart, getSeekableEnd, seek, GUARD_SEC } from './seek';

export interface JumpOptions {
  date?: YMD;       // テストや特殊用途で日付を固定
  cOverride?: number; // テスト用にCを固定
}

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
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[Jump] jump-end', { dStart, dEnd, r });
    }
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
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.debug('[Jump] jump-start', { dStart, dEnd, r });
    }
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

function safeGetLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

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
