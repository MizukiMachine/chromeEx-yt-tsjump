/**
 * 時刻ジャンプ計算の統合
 * 入力→正規化→TZ→epoch→t_target→範囲内ならseek 範囲外は端比較でジャンプ
 */

import { parseAndNormalize24h } from './timeparse';
import { getTodayInZone, toEpochInZone, type YMD } from './timezone';
import { getC, getCalibration } from './calibration';
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

  const date = opts.date ?? getTodayInZone(zone);
  const tz = toEpochInZone(zone, { hh: parsed.hh, mm: parsed.mm, ss: parsed.ss }, { date });

  // Cの取得 暫定が無ければフォールバックで計算
  let C = opts.cOverride ?? getC();
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

  const E_target = tz.epochSec;
  const E_start = C + start;
  const E_end = C + endGuard;

  const t_target = E_target - C;

  if (DEBUG) {
    const now = Math.floor(Date.now() / 1000);
    const cal = getCalibration();
    // 概要を出力（本番でも読みやすいように整形）
    // eslint-disable-next-line no-console
    console.debug('[Jump] request', {
      input,
      normalized: parsed.normalized,
      zone,
      todayInZone: date,
      tzWall: tz.wall,
      E_target,
      now,
      C,
      calStatus: cal.status,
      mad: cal.mad,
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
