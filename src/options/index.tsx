import { h, render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { t } from '../content/utils/i18n'
import { setString, Keys } from '../content/store/local'

type State = {
  debugAll: boolean
  lang: 'en' | 'ja'
  tzEnabled: Set<string>
  allZones: string[]
  showAll: boolean
  filter: string
  useDefaults: boolean
}

function App() {
  const [state, setState] = useState<State>({ 
    debugAll: false,
    lang: 'en', 
    tzEnabled: new Set(DEFAULT_ENABLED_TZ),
    allZones: [],
    showAll: false,
    filter: '',
    useDefaults: true,
  })
  const [status, setStatus] = useState<string>('')

  // use global i18n (content/utils/i18n) via options.* keys

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
        const enabledList = enabledArr.length ? enabledArr : DEFAULT_ENABLED_TZ
        const enabled = new Set<string>(enabledList)
        const defaultsSet = new Set(DEFAULT_ENABLED_TZ)
        const sameAsDefault = enabledList.length === DEFAULT_ENABLED_TZ.length && enabledList.every(z => defaultsSet.has(z))
        setState(prev => ({
          ...prev,
          debugAll: normalize(res?.['debug:all']),
          lang,
          tzEnabled: enabled,
          allZones,
          useDefaults: sameAsDefault,
        }))
      })
    } catch {}
  }, [])

  // Update static header/title when language changes
  useEffect(() => {
    try {
      const h1 = document.querySelector('header h1')
      if (h1) h1.textContent = t('options.header')
      document.title = t('options.title')
    } catch {}
  }, [state.lang])

  function onSave() {
    const enabledList = Array.from(state.tzEnabled)
    if (enabledList.length === 0) { flash(t('options.err_select_one')); return }
    chrome.storage?.local?.set({
      'debug:all': state.debugAll,
      'lang': state.lang,
      'tz:enabled': enabledList
    }, () => { flash(t('options.saved')) })
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
    }, () => { flash(t('options.reset_done')) })
  }

  function flash(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(''), 1500)
  }

  const visiblePool = state.showAll ? state.allZones : RECOMMENDED_TZ
  const filterText = state.filter.trim().toLowerCase()
  const filtered = (filterText
    ? visiblePool.filter(z => z.toLowerCase().includes(filterText))
    : visiblePool
  )
    .slice()
    .sort((a,b) => a.localeCompare(b))

  // bulk actions removed per UX decision; keep only filter + reset

  const selectedCount = state.tzEnabled.size
  const visibleCount = filtered.length


  return (
    <div>
      <div class="row">
        <label>
          <input type="checkbox" checked={state.debugAll} onChange={(e: any) => setState(s => ({ ...s, debugAll: !!e.currentTarget.checked }))} />
          {t('options.debug_mode')}
        </label>
        <div style={{ color:'#666', fontSize:'12px', marginTop:'4px' }}>
          {t('options.debug_desc')}
        </div>
      </div>
      <div class="row">
        <label>
          {t('options.default_language')}
          <select 
            value={state.lang} 
            onChange={(e: any) => {
              const v = e.currentTarget.value
              setState(s => ({ ...s, lang: v }))
              try { setString(Keys.Lang, v) } catch {}
            }} 
            style={{ marginLeft: '8px' }}>
            <option value="en">{t('options.lang_en')}</option>
            <option value="ja">{t('options.lang_ja')}</option>
          </select>
        </label>
      </div>
      <div class="row">
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
          <div>{t('options.tz_title')}</div>
          <label style={{ display:'inline-flex', alignItems:'center', gap:'6px' }}>
            <input type="checkbox" checked={state.showAll} onChange={(e:any)=> setState(s => ({ ...s, showAll: !!e.currentTarget.checked }))} />
            {t('options.show_all')}
          </label>
          <input 
            type="text" 
            placeholder={t('options.filter_ph')} 
            value={state.filter}
            onInput={(e:any)=> setState(s => ({ ...s, filter: e.currentTarget.value }))}
            style={{ flex:'1', minWidth:'120px', padding:'4px 6px', border:'1px solid #ccc', borderRadius:'4px' }}
          />
          <span style={{ color:'#666', fontSize:'12px' }}>{t('options.selected_visible', String(selectedCount), String(visibleCount))}</span>
        </div>
        {/* Reset helper placed where bulk actions were */}
        <label style={{ display:'inline-flex', alignItems:'center', gap:'6px', margin: '0 0 6px 0' }}>
          <input 
            type="checkbox" 
            checked={state.useDefaults}
            onChange={(e:any) => {
              const use = !!e.currentTarget.checked
              setState(s => ({
                ...s,
                useDefaults: use,
                tzEnabled: use ? new Set(DEFAULT_ENABLED_TZ) : new Set(s.tzEnabled)
              }))
            }}
          />
          {t('options.defaults_label', String(DEFAULT_ENABLED_TZ.length))}
        </label>
        <div style={{ maxHeight: '260px', overflow: 'auto', border: '1px solid #ccc', padding: '8px', borderRadius: '6px', opacity: state.useDefaults ? 0.6 : 1 }}>
          {filtered.map(z => (
            <label style={{ display: 'inline-flex', alignItems: 'center', width: '50%', boxSizing: 'border-box', padding: '2px 4px' }}>
              <input 
                type="checkbox" 
                checked={state.tzEnabled.has(z)}
                disabled={state.useDefaults}
                onChange={(e: any) => {
                  setState(s => {
                    const next = new Set(s.tzEnabled)
                    if (e.currentTarget.checked) next.add(z)
                    else {
                      next.delete(z)
                      if (next.size === 0) {
                        flash(t('err_must_remain'))
                        return s
                      }
                    }
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
        <button onClick={onSave}>{t('options.save')}</button>
        <button class="secondary" onClick={onReset}>{t('options.reset')}</button>
      </div>
      {status && <div class="status">{status}</div>}
    </div>
  )
}

// Default enabled = current PRESETs used in content UI
const DEFAULT_ENABLED_TZ = [
  'Asia/Tokyo','Asia/Seoul','Europe/Amsterdam','Africa/Windhoek','Africa/Nairobi','America/New_York','America/Los_Angeles','Pacific/Honolulu','Europe/Copenhagen','Europe/London','Europe/Berlin','Europe/Rome','Australia/Sydney','UTC','Asia/Singapore'
]

// Recommended subset for UI (reduced list)
const RECOMMENDED_TZ = DEFAULT_ENABLED_TZ

// Fallback list when Intl.supportedValuesOf is unavailable
const COMMON_TZ = [
  'UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Rome','Europe/Madrid','Europe/Amsterdam','Europe/Copenhagen','Europe/Stockholm','Europe/Helsinki','Europe/Athens',
  'Europe/Moscow','Asia/Tokyo','Asia/Seoul','Asia/Shanghai','Asia/Singapore','Asia/Taipei','Asia/Hong_Kong','Asia/Bangkok','Asia/Kuala_Lumpur','Asia/Jakarta','Asia/Dubai',
  'Africa/Windhoek','Africa/Nairobi','Africa/Cairo','Africa/Johannesburg',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles','America/Toronto','America/Vancouver','America/Mexico_City','America/Sao_Paulo','America/Bogota','America/Lima','America/Argentina/Buenos_Aires',
  'Pacific/Honolulu','Pacific/Auckland','Australia/Sydney','Australia/Perth'
]


render(h(App, {}), document.getElementById('root')!)
