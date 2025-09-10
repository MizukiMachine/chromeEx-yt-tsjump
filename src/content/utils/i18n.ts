type Lang = 'en' | 'ja'
import { getString, Keys } from '../store/local'

const dict: Record<Lang, Record<string, string>> = {
  en: {
    jump_header: 'Jump to timestamp',
    jump_button: 'Jump',
    placeholder_time: 'HH:mm:ss or HHmmss',
    help_text:
      '・ Toggle Jump panel: Alt+Shift+J\n・ Customize shortcuts: chrome://extensions/shortcuts',
    // Toast messages
    toast_moved_current: 'That time isn\'t available — moved to current time.',
    toast_moved_start: 'That time isn\'t available — moved to the start.',
    toast_ad_paused: 'An ad is playing, so seeking is paused.',
    toast_clamped: 'Clamped to playable range.',
  },
  ja: {
    jump_header: 'タイムスタンプへジャンプ',
    jump_button: 'Jump',
    placeholder_time: 'HH:mm:ss または HHmmss',
    help_text:
     '・ [ Alt+Shift+J ] 操作パネルの表示/非表示を切り替え\n・ [ショートカットキー登録] chrome://extensions/shortcuts',
    // Toast messages
    toast_moved_current: '指定時刻は範囲外のため、現在時刻に移動しました。',
    toast_moved_start: '指定時刻は範囲外のため、開始位置に移動しました。',
    toast_ad_paused: '広告再生中のため、機能を一時停止しています。',
    toast_clamped: '再生可能範囲に調整しました。',
  },
}

export function getLang(): Lang {
  try {
    const v = (getString(Keys.Lang) || 'en') as Lang
    return v === 'ja' ? 'ja' : 'en'
  } catch { return 'en' }
}

export function t(key: string): string {
  const lang = getLang()
  const m = dict[lang]
  return m[key] ?? key
}
