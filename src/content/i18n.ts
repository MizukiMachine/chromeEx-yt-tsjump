type Lang = 'en' | 'ja'

const dict: Record<Lang, Record<string, string>> = {
  en: {
    jump_header: 'Jump to timestamp',
    jump_button: 'Jump',
    placeholder_time: 'HH:mm:ss or HHmmss',
    help_text:
      '・ Toggle Jump panel: Alt+Shift+J\n・ Customize shortcuts: chrome://extensions/shortcuts',
  },
  ja: {
    jump_header: 'タイムスタンプへジャンプ',
    jump_button: 'Jump',
    placeholder_time: 'HH:mm:ss または HHmmss',
    help_text:
     '・ [ Alt+Shift+J ] 操作パネルの表示/非表示を切り替え\n・ [ショートカットキー登録] chrome://extensions/shortcuts',
  },
}

export function getLang(): Lang {
  try {
    const v = (localStorage.getItem('lang') || 'en') as Lang
    return v === 'ja' ? 'ja' : 'en'
  } catch { return 'en' }
}

export function t(key: string): string {
  const lang = getLang()
  const m = dict[lang]
  return m[key] ?? key
}
