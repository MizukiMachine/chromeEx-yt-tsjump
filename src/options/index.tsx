import { h, render } from 'preact'
import { useEffect, useState } from 'preact/hooks'

type State = {
  debugAll: boolean
  lang: 'en' | 'ja'
  tzEnabled: Set<string>
  allZones: string[]
}

function App() {
  const [state, setState] = useState<State>({ 
    debugAll: false,
    lang: 'en', 
    tzEnabled: new Set(DEFAULT_ENABLED_TZ),
    allZones: []
  })
  const [status, setStatus] = useState<string>('')

  // Load from chrome.storage.local
  useEffect(() => {
    try {
      // Build allZones: prefer Intl.supportedValuesOf('timeZone'), fallback to COMMON_TZ
      let allZones: string[] = []
      try {
        const anyIntl: any = (Intl as any)
        if (anyIntl?.supportedValuesOf) {
          const list = anyIntl.supportedValuesOf('timeZone') as string[]
          if (Array.isArray(list) && list.length) allZones = list
        }
      } catch {}
      if (!allZones.length) allZones = COMMON_TZ

      chrome.storage?.local?.get(['debug:all','lang','tz:enabled'], (res) => {
        const normalize = (v: any) => v === true || v === '1' || v === 1
        const lang = (res?.['lang'] === 'ja' ? 'ja' : 'en') as 'en'|'ja'
        const enabledArr = Array.isArray(res?.['tz:enabled']) ? res!['tz:enabled'].filter((x: any) => typeof x === 'string') : []
        const enabled = new Set<string>(enabledArr.length ? enabledArr : DEFAULT_ENABLED_TZ)
        setState(prev => ({
          ...prev,
          debugAll: normalize(res?.['debug:all']),
          lang,
          tzEnabled: enabled,
          allZones,
        }))
      })
    } catch {}
  }, [])

  function onSave() {
    const enabledList = Array.from(state.tzEnabled)
    if (enabledList.length === 0) { flash('Select at least one time zone'); return }
    chrome.storage?.local?.set({
      'debug:all': state.debugAll,
      'lang': state.lang,
      'tz:enabled': enabledList
    }, () => { flash('Saved') })
  }

  function onReset() {
    setState(prev => ({ 
      ...prev,
      debugAll: false, 
      lang: 'en', 
      tzEnabled: new Set(DEFAULT_ENABLED_TZ)
    }))
    chrome.storage?.local?.set({
      'debug:all': false,
      'lang': 'en',
      'tz:enabled': DEFAULT_ENABLED_TZ
    }, () => { flash('Reset to defaults') })
  }

  function flash(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(''), 1500)
  }


  return (
    <div>
      <div class="row">
        <label>
          <input type="checkbox" checked={state.debugAll} onChange={(e: any) => setState(s => ({ ...s, debugAll: !!e.currentTarget.checked }))} />
          Enable debug mode
        </label>
      </div>
      <div class="row">
        <label>
          Default language
          <select value={state.lang} onChange={(e: any) => setState(s => ({ ...s, lang: e.currentTarget.value }))} style={{ marginLeft: '8px' }}>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
      </div>
      <div class="row">
        <div>Time zones to show</div>
        <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid #ccc', padding: '8px', borderRadius: '6px' }}>
          {state.allZones.map(z => (
            <label style={{ display: 'inline-flex', alignItems: 'center', width: '50%', boxSizing: 'border-box', padding: '2px 4px' }}>
              <input 
                type="checkbox" 
                checked={state.tzEnabled.has(z)} 
                onChange={(e: any) => {
                  setState(s => {
                    const next = new Set(s.tzEnabled)
                    if (e.currentTarget.checked) next.add(z)
                    else next.delete(z)
                    return { ...s, tzEnabled: next }
                  })
                }}
                style={{ marginRight: '6px' }}
              />
              {z}
            </label>
          ))}
        </div>
      </div>
      <div class="actions">
        <button onClick={onSave}>Save</button>
        <button class="secondary" onClick={onReset}>Reset</button>
      </div>
      {status && <div class="status">{status}</div>}
    </div>
  )
}

// Default enabled = current PRESETs used in content UI
const DEFAULT_ENABLED_TZ = [
  'Asia/Tokyo','Asia/Seoul','Europe/Amsterdam','Africa/Windhoek','Africa/Nairobi','America/New_York','America/Los_Angeles','Pacific/Honolulu','Europe/Copenhagen','Europe/London','Europe/Berlin','Europe/Rome','Australia/Sydney','UTC','Asia/Singapore'
]

// Fallback list when Intl.supportedValuesOf is unavailable
const COMMON_TZ = [
  'UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Rome','Europe/Madrid','Europe/Amsterdam','Europe/Copenhagen','Europe/Stockholm','Europe/Helsinki','Europe/Athens',
  'Europe/Moscow','Asia/Tokyo','Asia/Seoul','Asia/Shanghai','Asia/Singapore','Asia/Taipei','Asia/Hong_Kong','Asia/Bangkok','Asia/Kuala_Lumpur','Asia/Jakarta','Asia/Dubai',
  'Africa/Windhoek','Africa/Nairobi','Africa/Cairo','Africa/Johannesburg',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Vancouver','America/Mexico_City','America/Sao_Paulo','America/Bogota','America/Lima','America/Argentina/Buenos_Aires',
  'Pacific/Honolulu','Pacific/Auckland','Australia/Sydney','Australia/Perth'
]


render(h(App, {}), document.getElementById('root')!)
