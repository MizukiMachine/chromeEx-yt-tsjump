/**
 * window.localStorage 用の薄いラッパ（コンテンツスクリプト側）
 * 目的: キーの集中管理、JSON 変換、真偽値の取り扱いの一元化
 * メリット:
 *  - 直接 localStorage を触らずに済む（重複やタイプミスを防ぐ）
 *  - 型付きのヘルパで安全に読む/書く
 *  - 将来 chrome.storage など別ストレージへ切り替える際に差し替えが容易
 */

/** 設定で使用するストレージキーの定義 */
export const Keys = {
  CardOpen: 'card:open',
  CardPos: 'card:pos',
  TzCurrent: 'tz:current',
  TzMru: 'tz:mru',
  Lang: 'lang',
  CalAuto: 'cfg:cal:auto',
  DebugCal: 'debug:cal',
  DebugHybridCalib: 'debug:hybridCalib',
  DebugSeekableProbe: 'debug:seekableProbe',
  DebugJump: 'debug:jump',
  QALog: 'qa:log',
  ShortcutsHelpDismissed: 'shortcutsHelpDismissed',
  CfgHybrid: 'cfg:hybrid',
} as const;

/** 文字列値を取得（存在しなければ null） */
export function getString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 文字列値を書き込み */
export function setString(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** 真偽値を取得（既定は '1' を true とみなす） */
export function getBool(key: string, truthy: string = '1'): boolean {
  try {
    return localStorage.getItem(key) === truthy;
  } catch {
    return false;
  }
}

/** 真偽値を書き込み（true/false を truthy/falsy に変換して保存） */
export function setBool(key: string, value: boolean, truthy: string = '1', falsy: string = '0'): void {
  try {
    localStorage.setItem(key, value ? truthy : falsy);
  } catch {
    /* ignore */
  }
}

/** JSON をパースして取得（失敗時は null） */
export function getJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** JSON をシリアライズして保存 */
export function setJSON<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// よく使う設定向けのショートカット
export function getTZCurrent(): string | null { return getString(Keys.TzCurrent); }
export function setTZCurrent(zone: string): void { setString(Keys.TzCurrent, zone); }

export function getTZMru(): string[] {
  return getJSON<string[]>(Keys.TzMru) ?? [];
}

/** TZ の MRU を先頭に追加（重複排除し、既定で5件まで保持） */
export function addTZMru(zone: string, limit = 5): string[] {
  const cur = getTZMru();
  const next = [zone, ...cur.filter((z) => z !== zone)].filter(Boolean).slice(0, limit);
  setJSON(Keys.TzMru, next);
  return next;
}

export type CardPos = { x: number; y: number };
/** カード位置の取得 */
export function getCardPos(): CardPos | null { return getJSON<CardPos>(Keys.CardPos); }
/** カード位置の保存 */
export function setCardPos(pos: CardPos): void { setJSON(Keys.CardPos, pos); }
