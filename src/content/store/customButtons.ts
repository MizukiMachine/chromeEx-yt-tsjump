/**
 * カスタムシークボタン設定管理
 */

import { t } from '../utils/i18n'

export interface CustomButton {
  label: string;
  seconds: number;
  enabled: boolean;
}

export interface CustomButtonsConfig {
  buttons: CustomButton[];
}

const STORAGE_KEY = 'custom-buttons';

// デフォルト設定: -60, -10, -1, +1, +10, +60 (分換算)
const DEFAULT_BUTTONS: CustomButton[] = [
  { label: '-60m', seconds: -3600, enabled: true },
  { label: '-10m', seconds: -600, enabled: true },
  { label: '-30s', seconds: -30, enabled: true },
  { label: '+30s', seconds: 30, enabled: true },
  { label: '+10m', seconds: 600, enabled: true },
  { label: '+60m', seconds: 3600, enabled: true },
];

/**
 * ボタン設定のパースとバリデーション
 */
function parseButtonsConfig(parsed: any): CustomButtonsConfig {
  if (!parsed || !Array.isArray(parsed.buttons)) {
    return { buttons: [...DEFAULT_BUTTONS] };
  }
  
  // バリデーションとマイグレーション
  const buttons = parsed.buttons.map((btn: any, index: number) => {
    if (typeof btn !== 'object' || btn === null) {
      return DEFAULT_BUTTONS[index] || DEFAULT_BUTTONS[0];
    }
    
    return {
      label: typeof btn.label === 'string' ? btn.label : DEFAULT_BUTTONS[index]?.label || '',
      seconds: typeof btn.seconds === 'number' ? btn.seconds : DEFAULT_BUTTONS[index]?.seconds || 0,
      enabled: typeof btn.enabled === 'boolean' ? btn.enabled : true,
    };
  });
  
  // 常に6個のボタンを保証
  while (buttons.length < 6) {
    const defaultIndex = buttons.length;
    buttons.push(DEFAULT_BUTTONS[defaultIndex] || { label: '', seconds: 0, enabled: false });
  }
  
  return { buttons: buttons.slice(0, 6) };
}

/**
 * カスタムボタン設定をストレージから読み込み（同期版・フォールバック用）
 * 本来は非同期版を使用すべきだが、互換性のため残す
 */
export function loadCustomButtons(): CustomButtonsConfig {
  // chrome.storage.localが利用できない場合のみlocalStorageを使用
  try {
    const anyChrome = (globalThis as any).chrome;
    if (anyChrome?.storage?.local) {
      // chrome.storage.localが利用可能な場合はデフォルト設定を返す
      // （同期版では非同期読み込みができないため）
      return { buttons: [...DEFAULT_BUTTONS] };
    } else {
      // chrome.storage.localが利用できない場合のみlocalStorageを使用
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        return { buttons: [...DEFAULT_BUTTONS] };
      }
      
      const parsed = JSON.parse(stored);
      return parseButtonsConfig(parsed);
    }
  } catch (error) {
    console.warn('Failed to load custom buttons config:', error);
    return { buttons: [...DEFAULT_BUTTONS] };
  }
}

/**
 * カスタムボタン設定をchrome.storage.localから非同期で読み込み
 */
export async function loadCustomButtonsAsync(): Promise<CustomButtonsConfig> {
  try {
    const anyChrome = (globalThis as any).chrome;
    if (anyChrome?.storage?.local) {
      return new Promise((resolve) => {
        anyChrome.storage.local.get([STORAGE_KEY], (result: any) => {
          if (result && result[STORAGE_KEY]) {
            resolve(parseButtonsConfig(result[STORAGE_KEY]));
          } else {
            resolve({ buttons: [...DEFAULT_BUTTONS] });
          }
        });
      });
    }
  } catch {}
  
  // フォールバック
  return loadCustomButtons();
}

/**
 * カスタムボタン設定を保存（chrome.storage.local優先、フォールバックでlocalStorage）
 */
export function saveCustomButtons(config: CustomButtonsConfig): void {
  try {
    const anyChrome = (globalThis as any).chrome;
    if (anyChrome?.storage?.local) {
      // chrome.storage.localに保存（拡張機能削除時にクリアされる）
      anyChrome.storage.local.set({ [STORAGE_KEY]: config });
    } else {
      // chrome.storage.localが利用できない場合のみlocalStorageを使用
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  } catch (error) {
    // chrome.storage.localで失敗した場合のフォールバック
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (fallbackError) {
      console.error('Failed to save custom buttons config:', error, fallbackError);
      throw new Error('設定の保存に失敗しました');
    }
  }
}

/**
 * デフォルト設定にリセット
 */
export function resetCustomButtons(): CustomButtonsConfig {
  const config = { buttons: [...DEFAULT_BUTTONS] };
  saveCustomButtons(config);
  return config;
}

/**
 * 有効なボタンのみを取得
 */
export function getEnabledButtons(config: CustomButtonsConfig): CustomButton[] {
  return config.buttons.filter(btn => btn.enabled && btn.label.trim() !== '');
}

/**
 * ラベルのバリデーション
 */
export function validateLabel(label: string): { valid: boolean; error?: string } {
  // 空文字は無効化として許可
  if (label === '') return { valid: true };

  try {
    // 可視文字のみ許可（制御/不可視を含む場合はNG）
    if (/[\p{C}]/u.test(label)) {
      return { valid: false, error: t('toast.invalid_label_detail') };
    }
    // 文字数（コードポイント）上限
    const len = Array.from(label).length;
    if (len < 1 || len > 12) {
      return { valid: false, error: t('toast.invalid_label_detail') };
    }
  } catch {
    // 万一 Unicode 判定で例外が出た場合はフォールバックで英数±のみ
    const fallback = /^[A-Za-z0-9+\-]{1,12}$/;
    if (!fallback.test(label)) {
      return { valid: false, error: t('toast.invalid_label') };
    }
  }

  return { valid: true };
}

/**
 * 秒数のバリデーション
 */
export function validateSeconds(seconds: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(seconds)) {
    return { valid: false, error: t('toast.invalid_seconds_integer') };
  }
  
  if (Math.abs(seconds) > 86400) { // 24時間以内
    return { valid: false, error: t('toast.invalid_seconds_range') };
  }
  
  return { valid: true };
}

/**
 * 古いlocalStorage設定をクリア（マイグレーション用）
 */
export function clearLegacyStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore errors
  }
}
