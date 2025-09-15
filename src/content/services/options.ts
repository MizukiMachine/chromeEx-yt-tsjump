import { setBool, setString, setJSON, Keys } from '../store/local'

export function loadOptionsFromStorage(): void {
  try {
    const anyChrome = (globalThis as any).chrome
    if (!anyChrome?.storage?.local) return
    anyChrome.storage.local.get(['debug:all','lang','tz:enabled','debug:copyFullN'], (res: any) => {
      const normalize = (v: any) => v === '1' || v === 1 || v === true
      try { if (res && res['debug:all'] != null) setBool(Keys.DebugAll, normalize(res['debug:all'])) } catch {}
      try { if (typeof res?.['lang'] === 'string') setString(Keys.Lang, res['lang']) } catch {}
      try {
        const arr = Array.isArray(res?.['tz:enabled']) ? (res['tz:enabled'] as any[]).filter((x) => typeof x === 'string') : []
        if (arr.length > 0) setJSON(Keys.TzEnabled, arr as string[])
      } catch {}
      try {
        const n = parseInt(String(res?.['debug:copyFullN'] ?? ''), 10)
        if (Number.isFinite(n) && n > 0) setString(Keys.DebugCopyFullN, String(n))
      } catch {}
    })
  } catch {}
}
