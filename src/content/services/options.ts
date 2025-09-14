import { setBool, setString, Keys } from '../store/local'

export function loadOptionsFromStorage(): void {
  try {
    const anyChrome = (globalThis as any).chrome
    if (!anyChrome?.storage?.local) return
    anyChrome.storage.local.get(['cfg:cal:auto','debug:cal','lang'], (res: any) => {
      const normalize = (v: any) => v === '1' || v === 1 || v === true
      try { if (res && res['cfg:cal:auto'] != null) setBool(Keys.CalAuto, normalize(res['cfg:cal:auto'])) } catch {}
      try { if (res && res['debug:cal'] != null) setBool(Keys.DebugCal, normalize(res['debug:cal'])) } catch {}
      try { if (typeof res?.['lang'] === 'string') setString(Keys.Lang, res['lang']) } catch {}
    })
  } catch {}
}
