type Lang = 'en' | 'ja'
import { getString, Keys } from '../store/local'

interface I18nDict {
  // Main UI
  ui: {
    jump_header: string
    jump_button: string
    placeholder_time: string
    help_text: string
  }
  // Edit popup
  popup: {
    label_with_max: string
    seconds_to_seek: string
    save: string
    cancel: string
  }
  // Tooltips
  tooltip: {
    click_edit: string
    add_button: string
    edit_buttons: string
    show_buttons: string
    hide_buttons: string
    help: string
    close: string
    seconds_format: string // Template for {±N} seconds display
  }
  // Toast messages
  toast: {
    moved_current: string
    moved_start: string
    ad_paused: string
    clamped: string
  }
}

const dict: Record<Lang, I18nDict> = {
  en: {
    ui: {
      jump_header: 'Jump to timestamp',
      jump_button: 'Jump',
      placeholder_time: 'HH:mm:ss or HHmmss',
      help_text: '・ Toggle Jump panel: Alt+Shift+J\n・ Customize shortcuts: chrome://extensions/shortcuts',
    },
    popup: {
      label_with_max: 'Label (A-Z, 0-9, +, -, 12max)',
      seconds_to_seek: 'Seconds to seek',
      save: 'Save',
      cancel: 'Cancel',
    },
    tooltip: {
      click_edit: 'Click to edit',
      add_button: 'Add new button',
      edit_buttons: 'Edit custom buttons',
      show_buttons: 'Show custom buttons',
      hide_buttons: 'Hide custom buttons',
      help: 'Help',
      close: 'Close',
      seconds_format: '{0} seconds', // {0} will be replaced with ±N
    },
    toast: {
      moved_current: 'That time isn\'t available — moved to current time.',
      moved_start: 'That time isn\'t available — moved to the start.',
      ad_paused: 'An ad is playing, so seeking is paused.',
      clamped: 'Clamped to playable range.',
    },
  },
  ja: {
    ui: {
      jump_header: 'タイムスタンプへジャンプ',
      jump_button: 'Jump',
      placeholder_time: 'HH:mm:ss または HHmmss',
      help_text: '・ [ Alt+Shift+J ] 操作パネルの表示/非表示\n・ [ショートカットキー登録] chrome://extensions/shortcuts',
    },
    popup: {
      label_with_max: '表示ラベル（英数字, +, -, 12文字まで）',
      seconds_to_seek: '移動秒数',
      save: '保存',
      cancel: 'キャンセル',
    },
    tooltip: {
      click_edit: 'クリックして編集',
      add_button: '新しいボタンを追加',
      edit_buttons: 'カスタムボタンを編集',
      show_buttons: 'カスタムボタンを表示',
      hide_buttons: 'カスタムボタンを非表示',
      help: 'ヘルプ',
      close: '閉じる',
      seconds_format: '{0}秒', // {0} will be replaced with ±N
    },
    toast: {
      moved_current: '指定時刻は範囲外のため、現在時刻に移動しました。',
      moved_start: '指定時刻は範囲外のため、開始位置に移動しました。',
      ad_paused: '広告再生中のため、機能を一時停止しています。',
      clamped: '再生可能範囲に調整しました。',
    },
  },
}

export function getLang(): Lang {
  try {
    const v = (getString(Keys.Lang) || 'en') as Lang
    return v === 'ja' ? 'ja' : 'en'
  } catch { return 'en' }
}

export function t(key: string, ...args: string[]): string {
  const lang = getLang()
  const d = dict[lang]
  
  // Support nested keys like 'ui.jump_header' or 'tooltip.help'
  const keys = key.split('.')
  if (keys.length === 2) {
    const [category, subkey] = keys
    const categoryData = (d as any)[category]
    if (categoryData && categoryData[subkey]) {
      let result = categoryData[subkey]
      // Replace {0}, {1}, etc. with provided arguments
      args.forEach((arg, index) => {
        result = result.replace(`{${index}}`, arg)
      })
      return result
    }
  }
  
  // Fallback to old format for backwards compatibility
  let result = (d as any)[key] ?? key
  args.forEach((arg, index) => {
    result = result.replace(`{${index}}`, arg)
  })
  return result
}

// Helper functions for common usage patterns
export function formatSeconds(seconds: number): string {
  const sign = seconds > 0 ? '+' : ''
  return t('tooltip.seconds_format', `${sign}${seconds}`)
}
