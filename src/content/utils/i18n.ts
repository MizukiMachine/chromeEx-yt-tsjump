export type Lang = 'en' | 'ja'
import { getString, Keys } from '../store/local'

export type OptionHelpIcon = 'focus' | 'keyboard' | 'shortcuts' | 'live' | 'refresh' | 'edit' | 'debug'

export interface OptionHelpAction {
  label: string
  href: string
}

export interface OptionHelpItem {
  icon: OptionHelpIcon
  title: string
  description: string
  shortcut?: string
  action?: OptionHelpAction
}

export interface OptionHelpSection {
  category: string
  items: OptionHelpItem[]
}

interface I18nDict {
  // Main UI
  ui: {
    jump_header: string
    jump_button: string
    placeholder_time: string
    help_text: string
    open_options: string
    options_hint: string
    help_redirect: string
  }
  // Edit popup
  popup: {
    label_with_max: string
    label_ph: string
    seconds_to_seek: string
    seconds_ph: string
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
    button_updated: string
    button_not_found: string
    failed_update: string
    max_buttons?: string
    add_button_failed?: string
    hybrid_not_ready?: string
    invalid_label?: string
    invalid_seconds?: string
    invalid_label_detail?: string
    invalid_seconds_integer?: string
    invalid_seconds_range?: string
  }
  // Debug panel
  debug: {
    search_ph: string
  }
  // Options page
  options: {
    header: string
    title: string
    debug_mode: string
    debug_desc: string
    default_language: string
    lang_en: string
    lang_ja: string
    tz_title: string
    show_all: string
    filter_ph: string
    defaults_label: string // uses {0} for count
    selected_visible: string // uses {0} selected • {1} visible
    save: string
    reset: string
    saved: string
    reset_done: string
    err_select_one: string
    err_must_remain: string
    help_title: string
    help_sections: OptionHelpSection[]
    debug_copy_full: string
    debug_copy_full_ph: string
    settings_heading: string
  }
}

const dict: Record<Lang, I18nDict> = {
  en: {
    ui: {
      jump_header: 'Jump to timestamp',
      jump_button: 'Jump',
      placeholder_time: 'HH:mm:ss or HHmmss',
      help_text: '・ Toggle Jump panel: Alt+Shift+J\n・ Customize shortcuts: chrome://extensions/shortcuts\n• If timestamp jump accuracy is significantly off, please reload the page.',
      open_options: 'Open Options',
      options_hint: 'More help and tips are in Options.',
      help_redirect: 'The operation guide and time zone settings are available in Options.',
    },
    popup: {
      label_with_max: 'Label (A-Z, 0-9, +, -, 12max)',
      label_ph: 'e.g. +30',
      seconds_to_seek: 'Seconds to skip',
      seconds_ph: 'e.g. 30 or -30',
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
      button_updated: 'Button updated!',
      button_not_found: 'Button not found!',
      failed_update: 'Failed to update button',
      max_buttons: 'Maximum 6 buttons allowed',
      add_button_failed: 'Failed to add new button',
      hybrid_not_ready: 'Hybrid system not ready. Try moving to live edge.',
      invalid_label: 'Invalid label',
      invalid_seconds: 'Invalid seconds',
      invalid_label_detail: 'Only A-Z, 0-9, +, - allowed (max 12 chars)',
      invalid_seconds_integer: 'Enter an integer value',
      invalid_seconds_range: 'Must be within 24 hours (±86400 seconds)',
    },
    debug: {
      search_ph: 'Search...',
    },
    options: {
      header: 'TS Jump Options',
      title: 'TS Jump on Youtube — Options',
      debug_mode: 'Enable debug mode',
      debug_desc: 'Shows debug logs and enables the debug panel shortcut.',
      default_language: 'Default language',
      lang_en: 'English',
      lang_ja: '日本語',
      tz_title: 'Time zones to show',
      show_all: 'Show all',
      filter_ph: 'Filter...',
      defaults_label: 'Use default time zones ({0})',
      selected_visible: '{0} selected • {1} visible',
      save: 'Save',
      reset: 'Reset',
      saved: 'Saved',
      reset_done: 'Reset to defaults',
      err_select_one: 'Select at least one time zone',
      err_must_remain: 'At least one time zone must remain selected',
      help_title: 'Help & Tips',
      help_sections: [
        {
          category: 'Keyboard control',
          items: [
            {
              icon: 'focus',
              title: 'Exit time input instantly',
              description: 'Press Esc while the timestamp field is focused to return control to the page.',
              shortcut: 'Esc',
            },
            {
              icon: 'keyboard',
              title: 'Toggle Jump panel',
              description: 'Open or close the Jump panel from anywhere on the player.',
              shortcut: 'Alt+Shift+J',
            },
          ],
        },
        {
          category: 'Keyboard control',
          items: [
            {
              icon: 'focus',
              title: 'Exit time input instantly',
              description: 'Press Esc while the timestamp field is focused to return control to the page.',
              shortcut: 'Esc',
            },
            {
              icon: 'keyboard',
              title: 'Toggle Jump panel',
              description: 'Open or close the Jump panel from anywhere on the player.',
              shortcut: 'Alt+Shift+J',
            },
            {
              icon: 'shortcuts',
              title: 'Remap shortcuts',
              description: 'Chrome lets you assign your own keys on the extensions shortcuts page.',
              action: {
                label: 'Open shortcut settings',
                href: 'chrome://extensions/shortcuts',
              },
            },
          ],
        },
        {
          category: 'Custom skip buttons',
          items: [
            {
              icon: 'edit',
              title: 'Edit custom buttons',
              description: 'Use the ✎ icon on the card to rename buttons or adjust skip intervals.',
            },
          ],
        },
        {
          category: 'Accuracy & diagnostics',
          items: [
            {
              icon: 'refresh',
              title: 'Reload if timestamps drift',
              description: 'If timestamp jump accuracy drifts significantly, please reload the page.',
            },
            {
              icon: 'debug',
              title: 'Toggle the debug panel when needed',
              description: 'Inspect seek ranges, calibration state, and recent events with the debug panel.',
              shortcut: 'Alt+Shift+L',
            },
          ],
        },
      ],
      debug_copy_full: 'Copy Full: recent events count',
      debug_copy_full_ph: '50 (1–200)',
      settings_heading: 'Settings',
    },
  },
  ja: {
    ui: {
      jump_header: 'タイムスタンプへジャンプ',
      jump_button: 'Jump',
      placeholder_time: 'HH:mm:ss または HHmmss',
      help_text: '・ [ Alt+Shift+J ] 操作パネルの表示/非表示\n・ [ショートカットキー登録] chrome://extensions/shortcuts\n・時刻ジャンプの精度が大きくズレたら、ページを再読み込みしてください',
      open_options: 'オプションを開く',
      options_hint: '詳しいヘルプやTipsはオプションにあります。',
      help_redirect: '操作ガイドやタイムゾーン設定',
    },
    popup: {
      label_with_max: '表示ラベル（英数字, +, -, 12文字まで）',
      label_ph: '例: +30',
      seconds_to_seek: '移動秒数',
      seconds_ph: '例: 30 または -30',
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
      button_updated: 'ボタンを更新しました',
      button_not_found: 'ボタンが見つかりません',
      failed_update: 'ボタンの更新に失敗しました',
      max_buttons: 'ボタンは最大6個までです',
      add_button_failed: 'ボタンの追加に失敗しました',
      hybrid_not_ready: 'ハイブリッドシステムの準備が完了していません。ライブ端へ寄せてからお試しください。',
      invalid_label: 'ラベルが不正です',
      invalid_seconds: '秒数が不正です',
      invalid_label_detail: '英数字と記号（+,-）のみ、最大12文字まで設定できます',
      invalid_seconds_integer: '整数値を入力してください',
      invalid_seconds_range: '24時間（±86400秒）以内で設定してください',
    },
    debug: {
      search_ph: '検索…',
    },
    options: {
      header: 'TS Jump オプション',
      title: 'TS Jump on Youtube — オプション',
      debug_mode: 'デバッグモードを有効にする',
      debug_desc: 'ログにデバッグ情報を表示し、ショートカットでデバッグパネルを開けるようになります。',
      default_language: '表示言語',
      lang_en: 'English',
      lang_ja: '日本語',
      tz_title: '表示するタイムゾーン',
      show_all: 'すべて表示',
      filter_ph: '絞り込み…',
      defaults_label: '初期設定タイムゾーン{0}個に設定する',
      selected_visible: '選択中 {0} 件 • 表示 {1} 件',
      save: '保存',
      reset: 'リセット',
      saved: '保存しました',
      reset_done: '初期設定に戻しました',
      err_select_one: '最低1件は選択してください',
      err_must_remain: '最低1件は選択されたままにしてください',
      help_title: 'ヘルプ＆Tips',
      help_sections: [
        {
          category: 'キーボード操作',
          items: [
            {
              icon: 'focus',
              title: '時刻入力のフォーカス解除',
              description: '時刻入力欄にフォーカスがあるときは Esc キーで素早く解除できます。',
              shortcut: 'Esc',
            },
            {
              icon: 'keyboard',
              title: 'Jump パネルの開閉',
              description: 'Alt+Shift+J でプレイヤー上の Jump パネルをどこからでも開閉できます。',
              shortcut: 'Alt+Shift+J',
            },
            {
              icon: 'shortcuts',
              title: 'ショートカットの割り当て変更',
              description: 'Chrome の拡張機能ショートカット設定ページで好みのキーに変更できます。',
              action: {
                label: 'ショートカット設定を開く',
                href: 'chrome://extensions/shortcuts',
              },
            },
          ],
        },
        {
          category: 'カスタムSkipボタン',
          items: [
            {
              icon: 'edit',
              title: 'カスタムボタンの編集',
              description: 'カード内の ✎ アイコンからラベルや移動秒数を編集できます。',
            },
          ],
        },
        {
          category: '精度と診断',
          items: [
            {
              icon: 'refresh',
              title: 'ズレが大きいときは再読み込み',
              description: '時刻ジャンプが大きくズレだした場合はページを再読み込みしてください。',
            },
            {
              icon: 'debug',
              title: '必要に応じてデバッグパネル表示',
              description: 'シーク範囲やキャリブレーションの状態、最近のイベントを確認できます（デバッグモード時）。',
              shortcut: 'Alt+Shift+L',
            },
          ],
        },
      ],
      debug_copy_full: 'Copy Full の件数（直近イベント）',
      debug_copy_full_ph: '50（1〜200）',
      settings_heading: '設定',
    },
  },
}

export function t(key: string, ...args: string[]): string {
  return tWithLang(getLang(), key, ...args)
}

function translateFromDict(language: Lang, key: string, args: string[]): string {
  const d = dict[language]

  const keys = key.split('.')
  if (keys.length === 2) {
    const [category, subkey] = keys
    const categoryData = (d as any)[category]
    if (categoryData && categoryData[subkey]) {
      let result = categoryData[subkey]
      args.forEach((arg, index) => {
        result = result.replace(`{${index}}`, arg)
      })
      return result
    }
  }

  let result = (d as any)[key] ?? key
  args.forEach((arg, index) => {
    result = result.replace(`{${index}}`, arg)
  })
  return result
}

export function tWithLang(lang: Lang, key: string, ...args: string[]): string {
  return translateFromDict(lang, key, args)
}

export function getLang(): Lang {
  try {
    const v = (getString(Keys.Lang) || 'en') as Lang
    return v === 'ja' ? 'ja' : 'en'
  } catch { return 'en' }
}

export function getOptionsHelpSections(langOverride?: Lang): OptionHelpSection[] {
  const lang = langOverride ?? getLang()
  return dict[lang].options.help_sections
}

// Helper functions for common usage patterns
export function formatSeconds(seconds: number): string {
  const sign = seconds > 0 ? '+' : ''
  return t('tooltip.seconds_format', `${sign}${seconds}`)
}
