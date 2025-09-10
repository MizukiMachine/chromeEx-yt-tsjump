/**
 * カスタムシークボタン設定管理
 */

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
  { label: '-60', seconds: -3600, enabled: true },
  { label: '-10', seconds: -600, enabled: true },
  { label: '-1', seconds: -60, enabled: true },
  { label: '+1', seconds: 60, enabled: true },
  { label: '+10', seconds: 600, enabled: true },
  { label: '+60', seconds: 3600, enabled: true },
];

/**
 * カスタムボタン設定をローカルストレージから読み込み
 */
export function loadCustomButtons(): CustomButtonsConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { buttons: [...DEFAULT_BUTTONS] };
    }
    
    const parsed = JSON.parse(stored);
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
    
    return { buttons: buttons.slice(0, 6) }; // 6個まで
  } catch (error) {
    console.warn('Failed to load custom buttons config:', error);
    return { buttons: [...DEFAULT_BUTTONS] };
  }
}

/**
 * カスタムボタン設定をローカルストレージに保存
 */
export function saveCustomButtons(config: CustomButtonsConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save custom buttons config:', error);
    throw new Error('設定の保存に失敗しました');
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
  if (label === '') {
    return { valid: true }; // 空文字は無効化として許可
  }
  
  const labelPattern = /^[A-Za-z0-9+\-]{1,4}$/;
  if (!labelPattern.test(label)) {
    return {
      valid: false,
      error: 'アルファベットと数字、記号(+,-)のみ、最大4文字まで設定できます'
    };
  }
  
  return { valid: true };
}

/**
 * 秒数のバリデーション
 */
export function validateSeconds(seconds: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(seconds)) {
    return { valid: false, error: '整数値を入力してください' };
  }
  
  if (Math.abs(seconds) > 86400) { // 24時間以内
    return { valid: false, error: '24時間（86400秒）以内で設定してください' };
  }
  
  return { valid: true };
}