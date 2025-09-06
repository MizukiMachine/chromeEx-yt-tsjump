/**
 * タイムゾーン変換とDSTの扱い
 * - getTodayInZone(zone): そのゾーンの今日の日付を返す
 * - toEpochInZone(zone, hms, { date }): 入力時刻をそのゾーンの今日に当てはめてepoch秒へ
 *   ルール DSTギャップは前方スナップ 曖昧はearlierを選択
 */

import { Temporal } from '@js-temporal/polyfill';

// デフォルトTZと初期リスト
export const DEFAULT_ZONE = 'Europe/Amsterdam';
export const PRESET_ZONES: string[] = [
  'Asia/Tokyo',
  'Asia/Seoul',
  'Europe/Amsterdam',
  'Africa/Windhoek',
  'Africa/Nairobi',
  'America/New_York',
  'America/Los_Angeles',
  'Pacific/Honolulu',
  'Europe/Copenhagen',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Rome',
  'Australia/Sydney',
  'UTC',
  'Asia/Singapore',
];

export type Hms = { hh: number; mm: number; ss: number };
export type YMD = { year: number; month: number; day: number };

export function getTodayInZone(zone: string): YMD {
  const now = Temporal.Now.zonedDateTimeISO(zone);
  return { year: now.year, month: now.month, day: now.day };
}

export interface ToEpochOptions {
  date?: YMD; // 指定が無い場合はそのゾーンの今日
}

export function toEpochInZone(
  zone: string,
  hms: Hms,
  opts: ToEpochOptions = {}
): { epochSec: number; ambiguous: boolean; gap: boolean; wall: string } {
  const { year, month, day } = opts.date ?? getTodayInZone(zone);
  const tz = Temporal.TimeZone.from(zone);

  const pdt = new Temporal.PlainDateTime(year, month, day, hms.hh, hms.mm, hms.ss);
  // 可能なInstantを調べ 曖昧/ギャップを検出
  const instants = tz.getPossibleInstantsFor(pdt);
  const ambiguous = instants.length === 2;
  const gap = instants.length === 0;

  // disambiguation: 'compatible' は DSTギャップで前方スナップ 曖昧はearlier
  const zdt = pdt.toZonedDateTime(tz, { disambiguation: 'compatible' });
  const epochSec = Math.floor(zdt.epochSeconds);
  const wall = zdt.toPlainDateTime().toString(); // YYYY-MM-DDTHH:mm:ss

  return { epochSec, ambiguous, gap, wall };
}

// ---- Helpers for UI labeling ----

/**
 * Get current UTC offset minutes for the zone (now), e.g. +540 for Asia/Tokyo
 */
export function getOffsetMinutesNow(zone: string): number {
  const tz = Temporal.TimeZone.from(zone);
  const inst = Temporal.Now.instant();
  const ns = tz.getOffsetNanosecondsFor(inst);
  // convert to minutes (ns -> s -> min)
  return Math.trunc(ns / 1_000_000_000 / 60);
}

/** Format minutes into "+HH:MM" or "-HH:MM" */
export function formatOffsetHM(mins: number): string {
  const sign = mins >= 0 ? '+' : '-';
  const a = Math.abs(mins);
  const hh = Math.floor(a / 60).toString().padStart(2, '0');
  const mm = (a % 60).toString().padStart(2, '0');
  return `${sign}${hh}:${mm}`;
}

/** Human-friendly zone display name */
export function displayNameForZone(zone: string): string {
  const map: Record<string, string> = {
    'Africa/Windhoek': 'Namibia:Windhoek',
    'Africa/Nairobi': 'Kenya:Nairobi',
  };
  if (map[zone]) return map[zone];
  // default: use last path component with spaces
  try {
    const last = zone.split('/').pop() || zone;
    return last.replace(/_/g, ' ');
  } catch {
    return zone;
  }
}
