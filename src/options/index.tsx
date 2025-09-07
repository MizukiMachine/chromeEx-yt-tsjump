import { h, render } from 'preact'
import { useEffect, useState } from 'preact/hooks'

type State = {
  calAuto: boolean
  debugCal: boolean
  lang: 'en' | 'ja'
  tzPresetText: string
}

function App() {
  const [state, setState] = useState<State>({ calAuto: false, debugCal: false, lang: 'en', tzPresetText: defaultTZText })
  const [status, setStatus] = useState<string>('')

  // Load from chrome.storage.local
  useEffect(() => {
    try {
      chrome.storage?.local?.get(['cfg:cal:auto','debug:cal','lang','tz:preset'], (res) => {
        const normalize = (v: any) => v === true || v === '1' || v === 1
        const lang = (res?.['lang'] === 'ja' ? 'ja' : 'en') as 'en'|'ja'
        const arr = Array.isArray(res?.['tz:preset']) ? res!['tz:preset'].filter((x: any) => typeof x === 'string') : []
        setState({
          calAuto: normalize(res?.['cfg:cal:auto']),
          debugCal: normalize(res?.['debug:cal']),
          lang,
          tzPresetText: (arr.length ? arr : defaultTZ).join('\n')
        })
      })
    } catch {}
  }, [])

  function onSave() {
    const tzList = linesToList(state.tzPresetText)
    chrome.storage?.local?.set({
      'cfg:cal:auto': state.calAuto,
      'debug:cal': state.debugCal,
      'lang': state.lang,
      'tz:preset': tzList
    }, () => {
      flash('Saved')
    })
  }

  function onReset() {
    setState({ calAuto: false, debugCal: false, lang: 'en', tzPresetText: defaultTZText })
    chrome.storage?.local?.set({
      'cfg:cal:auto': false,
      'debug:cal': false,
      'lang': 'en',
      'tz:preset': defaultTZ
    }, () => {
      flash('Reset to defaults')
    })
  }

  function flash(msg: string) {
    setStatus(msg)
    setTimeout(() => setStatus(''), 1500)
  }

  return (
    <div>
      <div class="row">
        <label>
          <input type="checkbox" checked={state.calAuto} onChange={(e: any) => setState(s => ({ ...s, calAuto: !!e.currentTarget.checked }))} />
          Enable calibration on page load
        </label>
      </div>
      <div class="row">
        <label>
          <input type="checkbox" checked={state.debugCal} onChange={(e: any) => setState(s => ({ ...s, debugCal: !!e.currentTarget.checked }))} />
          Enable calibration debug logs
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
        <div>Initial timezone list (one per line)</div>
        <textarea value={state.tzPresetText} onInput={(e: any) => setState(s => ({ ...s, tzPresetText: e.currentTarget.value }))}></textarea>
      </div>
      <div class="actions">
        <button onClick={onSave}>Save</button>
        <button class="secondary" onClick={onReset}>Reset</button>
      </div>
      {status && <div class="status">{status}</div>}
    </div>
  )
}

const defaultTZ = [
  'Asia/Tokyo','Asia/Seoul','Europe/Amsterdam','Africa/Windhoek','Africa/Nairobi','America/New_York','America/Los_Angeles','Pacific/Honolulu','Europe/Copenhagen','Europe/London','Europe/Berlin','Europe/Rome','Australia/Sydney','UTC','Asia/Singapore'
]
const defaultTZText = defaultTZ.join('\n')

function linesToList(text: string): string[] {
  return (text || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

render(h(App, {}), document.getElementById('root')!)

