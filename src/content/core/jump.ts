/**
 * 時刻ジャンプ計算の統合
 * 入力→正規化→TZ→epoch→t_target→範囲内ならseek 範囲外は端比較でジャンプ
 */

import { parseAndNormalize24h } from './timeparse';
import { getTodayInZone, toEpochInZone, type YMD } from './timezone';
import * as calibration from './calibration';
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

  // Cの取得 暫定が無ければフォールバックで計算
  let C = opts.cOverride ?? (typeof calibration.getC === 'function' ? calibration.getC() : null);
  if (C == null) {
    const end = getSeekableEnd(video);
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
  // 範囲内があれば end（=“今”）に近い方を選ぶ。なければ today を使って従来ロジックへ
  const best = within.length
    ? within.sort((a, b) => Math.abs(E_end - a.E) - Math.abs(E_end - b.E))[0]
    : candidates[0];

  const E_target = best.E;
  const t_endBased = E_target - C;

  // 位相補正（nearLiveで推定したphaseを常に適用）
  let phase: number | null = null;
  let phaseMad: number | null = null;
  try {
    const info = typeof calibration.getPhaseFor === 'function' ? calibration.getPhaseFor(video) : { phase: null, mad: null };
    phase = info.phase;
    phaseMad = info.mad;
  } catch {}
  // 注意: C は (now - effectiveEnd) を基準に推定しているため、
  // 実際のフレームのエポックは `now - latency` だけ手前にあり、
  // その近似としての位相(phase = effectiveEnd - currentTime)を
  // t に「足す」方向で補正するのが妥当。
  const usePhase = phase != null && (phaseMad == null || phaseMad <= 2.0);
  const t_target = usePhase ? t_endBased + (phase as number) : t_endBased;

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
      phase,
      phaseMad,
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
      flags: { ambiguous: tz.ambiguous, gap: tz.gap },
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
      flags: { ambiguous: tz.ambiguous, gap: tz.gap },
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
      flags: { ambiguous: tz.ambiguous, gap: tz.gap },
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
