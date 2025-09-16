import { h, render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { tWithLang, getOptionsHelpSections, OptionHelpIcon, OptionHelpAction, type Lang } from '../content/utils/i18n'
import { formatTimeZoneLabel, isDisplayableZone } from '../content/utils/timezoneLabel'
import { setString, Keys } from '../content/store/local'

type State = {
  debugAll: boolean
  lang: 'en' | 'ja'
  tzEnabled: Set<string>
  allZones: string[]
  showAll: boolean
  filter: string
  useDefaults: boolean
  debugCopyFullN: number
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
    debugCopyFullN: 50,
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

      chrome.storage?.local?.get(['debug:all','lang','tz:enabled','debug:copyFullN'], (res) => {
        const normalize = (v: any) => v === true || v === '1' || v === 1
        const lang = (res?.['lang'] === 'ja' ? 'ja' : 'en') as 'en'|'ja'
        const displayableZones = filterDisplayableZones(allZones)
        const enabledArr = Array.isArray(res?.['tz:enabled']) ? res!['tz:enabled'].filter((x: any) => typeof x === 'string') : []
        let enabledList = enabledArr.length ? enabledArr : DEFAULT_ENABLED_TZ
        enabledList = enabledList.filter((z) => displayableZones.includes(z))
        if (!enabledList.length) {
          enabledList = displayableZones.length ? displayableZones.slice(0, DEFAULT_ENABLED_TZ.length) : [...DEFAULT_ENABLED_TZ]
        }
        const enabled = new Set<string>(enabledList)
        const defaultsSet = new Set(DEFAULT_ENABLED_TZ)
        const sameAsDefault = enabledList.length === DEFAULT_ENABLED_TZ.length && enabledList.every(z => defaultsSet.has(z))
        const copyFullNRaw = parseInt(String(res?.['debug:copyFullN'] ?? '50'), 10)
        const copyFullN = Number.isFinite(copyFullNRaw) ? Math.max(1, Math.min(200, copyFullNRaw)) : 50
        setState(prev => ({
          ...prev,
          debugAll: normalize(res?.['debug:all']),
          lang,
          tzEnabled: enabled,
          allZones: displayableZones,
          useDefaults: sameAsDefault,
          debugCopyFullN: copyFullN,
        }))
      })
    } catch {}
  }, [])

  // Update static header/title when language changes
  useEffect(() => {
    try {
      const h1 = document.querySelector('header h1')
      if (h1) h1.textContent = tWithLang(state.lang, 'options.header')
      document.title = tWithLang(state.lang, 'options.title')
    } catch {}
  }, [state.lang])

  function onSave() {
    const enabledList = Array.from(state.tzEnabled)
    if (enabledList.length === 0) { flash(tWithLang(state.lang, 'options.err_select_one')); return }
    chrome.storage?.local?.set({
      'debug:all': state.debugAll,
      'lang': state.lang,
      'tz:enabled': enabledList,
      'debug:copyFullN': state.debugCopyFullN
    }, () => {
      flash(tWithLang(state.lang, 'options.saved'))
      notifyTzUpdated()
    })
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
    }, () => {
      flash(tWithLang(state.lang, 'options.reset_done'))
      notifyTzUpdated()
    })
  }

  function notifyTzUpdated() {
    try { chrome.runtime?.sendMessage?.({ type: 'OPTIONS_TZ_UPDATED' }) } catch {}
  }

  function flash(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(''), 1500)
  }

  const visiblePool = state.showAll ? state.allZones : RECOMMENDED_TZ.filter(isDisplayableZone)
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


  const helpSections = getOptionsHelpSections(state.lang)
  const langForLabels = state.lang as Lang

  const renderIcon = (icon: OptionHelpIcon) => {
    const commonProps = {
      width: 20,
      height: 20,
      viewBox: '0 0 24 24',
      role: 'presentation' as const,
      'aria-hidden': 'true' as const,
    }
    switch (icon) {
      case 'focus':
        return (
          <svg {...commonProps}>
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" d="M4 9V5h4" strokeLinecap="round" strokeLinejoin="round" />
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" d="M20 15v4h-4" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="7" y="7" width="10" height="10" rx="2" ry="2" fill="none" stroke="#2563eb" strokeWidth="1.6" />
          </svg>
        )
      case 'keyboard':
        return (
          <svg {...commonProps}>
            <rect x="3.5" y="6" width="17" height="12" rx="2" ry="2" fill="none" stroke="#2563eb" strokeWidth="1.6" />
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" d="M6 10h1m2 0h1m2 0h1m2 0h1m-9 3h6" strokeLinecap="round" />
          </svg>
        )
      case 'shortcuts':
        return (
          <svg {...commonProps}>
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M6 8h4l-4 8h4" />
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M15 8h3m-3 4h4m-4 4h3" />
          </svg>
        )
      case 'live':
        return (
          <svg {...commonProps}>
            <circle cx="12" cy="12" r="8" fill="none" stroke="#2563eb" strokeWidth="1.6" />
            <path fill="#2563eb" d="M12 9.5 15.5 12 12 14.5Z" />
          </svg>
        )
      case 'refresh':
        return (
          <svg {...commonProps}>
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M7 7h4V3" />
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M17 17h-4v4" />
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M7.4 16.6A6 6 0 0 1 6 12a6 6 0 0 1 6-6 5.9 5.9 0 0 1 5.3 3.3" />
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M16.6 7.4A6 6 0 0 1 18 12a6 6 0 0 1-6 6 5.9 5.9 0 0 1-5.3-3.3" />
          </svg>
        )
      case 'edit':
        return (
          <svg {...commonProps}>
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" d="M14.5 4.5 19.5 9.5 9 20H4v-5z" />
          </svg>
        )
      case 'debug':
        return (
          <svg {...commonProps}>
            <circle cx="12" cy="12" r="7" fill="none" stroke="#2563eb" strokeWidth="1.6" />
            <circle cx="12" cy="12" r="2" fill="#2563eb" />
            <path fill="none" stroke="#2563eb" strokeWidth="1.6" strokeLinecap="round" d="m5.5 5.5 3 3M18.5 5.5l-3 3M5.5 18.5l3-3M18.5 18.5l-3-3" />
          </svg>
        )
      default:
        return null
    }
  }

  function handleActionClick(e: MouseEvent, action: OptionHelpAction) {
    e.preventDefault()
    const url = action.href
    try {
      if (url.startsWith('chrome://') && chrome?.tabs?.create) {
        chrome.tabs.create({ url })
        return
      }
    } catch {}
    try { window.open(url, '_blank', 'noopener') } catch {}
  }

  return (
    <div>
      {/* Help & Tips at top */}
      <div class="row" style={{ marginTop: '6px' }}>
        <h2 style={{ margin: '8px 0' }}>{tWithLang(state.lang, 'options.help_title')}</h2>
        <div class="help-grid">
          {helpSections.map((section) => (
            <section class="help-section" key={`help-${section.category}`}>
              <h3 class="help-section-title">{section.category}</h3>
              <div class="help-cards">
                {section.items.map((item) => (
                  <article class="help-card" key={`${section.category}-${item.title}`}>
                    <div class="help-card-head">
                      <span class="help-card-icon">{renderIcon(item.icon)}</span>
                      <div class="help-card-heading">
                        <span class="help-card-title">{item.title}</span>
                        {item.shortcut ? <code class="help-card-shortcut">{item.shortcut}</code> : null}
                      </div>
                    </div>
                    <p class="help-card-desc">{item.description}</p>
                    {item.action ? (
                      <a
                        class="help-card-action"
                        href={item.action.href}
                        onClick={(event) => handleActionClick(event, item.action!)}
                      >
                        {item.action.label}
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <hr style={{ border: '0', borderTop: '1px solid #ddd', margin: '16px 0' }} />
      <div class="row">
        <h2 style={{ margin: '0 0 12px 0' }}>{tWithLang(state.lang, 'options.settings_heading')}</h2>
      </div>
      <div class="settings-section">
        <label>
          {tWithLang(state.lang, 'options.default_language')}
          <select 
            value={state.lang} 
            onChange={(e: any) => {
              const v = e.currentTarget.value
              setState(s => ({ ...s, lang: v }))
              try { setString(Keys.Lang, v) } catch {}
            }} 
            style={{ marginLeft: '8px' }}>
            <option value="en">{tWithLang(state.lang, 'options.lang_en')}</option>
            <option value="ja">{tWithLang(state.lang, 'options.lang_ja')}</option>
          </select>
        </label>
      </div>
      <div class="settings-section">
        <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'6px' }}>
          <div>{tWithLang(state.lang, 'options.tz_title')}</div>
          <label style={{ display:'inline-flex', alignItems:'center', gap:'6px' }}>
            <input type="checkbox" checked={state.showAll} onChange={(e:any)=> setState(s => ({ ...s, showAll: !!e.currentTarget.checked }))} />
            {tWithLang(state.lang, 'options.show_all')}
          </label>
          <input 
            type="text" 
            placeholder={tWithLang(state.lang, 'options.filter_ph')} 
            value={state.filter}
            onInput={(e:any)=> setState(s => ({ ...s, filter: e.currentTarget.value }))}
            style={{ flex:'1', minWidth:'120px', padding:'4px 6px', border:'1px solid #ccc', borderRadius:'4px' }}
          />
          <span style={{ color:'#666', fontSize:'12px' }}>{tWithLang(state.lang, 'options.selected_visible', String(selectedCount), String(visibleCount))}</span>
        </div>
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
          {tWithLang(state.lang, 'options.defaults_label', String(DEFAULT_ENABLED_TZ.length))}
        </label>
        <div class="tz-list" style={{ opacity: state.useDefaults ? 0.6 : 1 }}>
          {filtered.map(z => (
            <label key={z} class="tz-item">
              <input
                type="checkbox"
                checked={state.tzEnabled.has(z)}
                disabled={state.useDefaults}
                onChange={(e:any) => {
                  const checked = !!e.currentTarget.checked
                  setState((s) => {
                    if (s.useDefaults) return s
                    const next = new Set(s.tzEnabled)
                    if (checked) {
                      next.add(z)
                    } else {
                      next.delete(z)
                      if (next.size === 0) {
                        flash(tWithLang(state.lang, 'options.err_must_remain'))
                        return s
                      }
                    }
                    return { ...s, tzEnabled: next }
                  })
                }}
              />
              <div class="tz-text">
                <span class="tz-label">{formatTimeZoneLabel(z, langForLabels)}</span>
                <span class="tz-code">{z}</span>
              </div>
            </label>
          ))}
        </div>
      </div>
      <div class="settings-section">
        <label>
          <input type="checkbox" checked={state.debugAll} onChange={(e: any) => setState(s => ({ ...s, debugAll: !!e.currentTarget.checked }))} />
          {tWithLang(state.lang, 'options.debug_mode')}
        </label>
        <div class="settings-description">
          {tWithLang(state.lang, 'options.debug_desc')}
        </div>
      </div>
      <div class="settings-section">
        <label>
          {tWithLang(state.lang, 'options.debug_copy_full')}
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            placeholder={tWithLang(state.lang, 'options.debug_copy_full_ph')}
            value={state.debugCopyFullN}
            onInput={(e: any) => {
              const v = parseInt(e.currentTarget.value, 10)
              setState(s => ({ ...s, debugCopyFullN: Number.isFinite(v) ? Math.max(1, Math.min(200, v)) : s.debugCopyFullN }))
            }}
            style={{ marginLeft: '8px', width: '90px' }}
          />
        </label>
      </div>
      <div class="actions">
        <button onClick={onSave}>{tWithLang(state.lang, 'options.save')}</button>
        <button class="secondary" onClick={onReset}>{tWithLang(state.lang, 'options.reset')}</button>
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

function filterDisplayableZones(zones: string[]): string[] {
  const uniq = Array.from(new Set(zones))
  const filtered = uniq.filter((z) => isDisplayableZone(z))
  if (filtered.length) return filtered
  return DEFAULT_ENABLED_TZ.slice()
}


render(h(App, {}), document.getElementById('root')!)
