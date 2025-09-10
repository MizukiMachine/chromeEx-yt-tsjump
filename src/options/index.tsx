import { h, render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { loadCustomButtons, saveCustomButtons, resetCustomButtons, validateLabel, validateSeconds, CustomButton } from '../content/store/customButtons'

type State = {
  calAuto: boolean
  debugCal: boolean
  lang: 'en' | 'ja'
  tzPresetText: string
  customButtons: CustomButton[]
}

type ValidationError = {
  buttonIndex: number
  field: 'label' | 'seconds'
  message: string
}

function App() {
  const [state, setState] = useState<State>({ 
    calAuto: false, 
    debugCal: false, 
    lang: 'en', 
    tzPresetText: defaultTZText,
    customButtons: loadCustomButtons().buttons
  })
  const [status, setStatus] = useState<string>('')
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])

  // Load from chrome.storage.local
  useEffect(() => {
    try {
      chrome.storage?.local?.get(['cfg:cal:auto','debug:cal','lang','tz:preset'], (res) => {
        const normalize = (v: any) => v === true || v === '1' || v === 1
        const lang = (res?.['lang'] === 'ja' ? 'ja' : 'en') as 'en'|'ja'
        const arr = Array.isArray(res?.['tz:preset']) ? res!['tz:preset'].filter((x: any) => typeof x === 'string') : []
        setState(prevState => ({
          ...prevState,
          calAuto: normalize(res?.['cfg:cal:auto']),
          debugCal: normalize(res?.['debug:cal']),
          lang,
          tzPresetText: (arr.length ? arr : defaultTZ).join('\n'),
          customButtons: loadCustomButtons().buttons
        }))
      })
    } catch {}
  }, [])

  function validateCustomButtons(): ValidationError[] {
    const errors: ValidationError[] = []
    
    state.customButtons.forEach((button, index) => {
      const labelValidation = validateLabel(button.label)
      if (!labelValidation.valid && labelValidation.error) {
        errors.push({
          buttonIndex: index,
          field: 'label',
          message: labelValidation.error
        })
      }
      
      const secondsValidation = validateSeconds(button.seconds)
      if (!secondsValidation.valid && secondsValidation.error) {
        errors.push({
          buttonIndex: index,
          field: 'seconds',
          message: secondsValidation.error
        })
      }
    })
    
    return errors
  }

  function onSave() {
    // カスタムボタンのバリデーション
    const errors = validateCustomButtons()
    setValidationErrors(errors)
    
    if (errors.length > 0) {
      flash('設定にエラーがあります。修正してください。')
      return
    }
    
    const tzList = linesToList(state.tzPresetText)
    
    try {
      // カスタムボタン設定を保存
      saveCustomButtons({ buttons: state.customButtons })
      
      // その他の設定を保存
      chrome.storage?.local?.set({
        'cfg:cal:auto': state.calAuto,
        'debug:cal': state.debugCal,
        'lang': state.lang,
        'tz:preset': tzList
      }, () => {
        flash('Saved')
      })
    } catch (error) {
      console.error('Save failed:', error)
      flash('保存に失敗しました')
    }
  }

  function onReset() {
    const resetButtons = resetCustomButtons()
    setState({ 
      calAuto: false, 
      debugCal: false, 
      lang: 'en', 
      tzPresetText: defaultTZText,
      customButtons: resetButtons.buttons
    })
    setValidationErrors([])
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

  function updateCustomButton(index: number, updates: Partial<CustomButton>) {
    setState(prevState => ({
      ...prevState,
      customButtons: prevState.customButtons.map((button, i) => 
        i === index ? { ...button, ...updates } : button
      )
    }))
  }

  function resetCustomButtonsToDefault() {
    const resetConfig = resetCustomButtons()
    setState(prevState => ({
      ...prevState,
      customButtons: resetConfig.buttons
    }))
    setValidationErrors([])
    flash('カスタムボタンをデフォルトに戻しました')
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
      
      {/* カスタムシークボタン設定 */}
      <div class="section">
        <h3>カスタムシークボタン設定</h3>
        <div class="custom-buttons-grid">
          {state.customButtons.map((button, index) => {
            const labelError = validationErrors.find(e => e.buttonIndex === index && e.field === 'label')
            const secondsError = validationErrors.find(e => e.buttonIndex === index && e.field === 'seconds')
            
            return (
              <div key={index} class="custom-button-row">
                <div class="button-number">ボタン {index + 1}</div>
                <div class="input-group">
                  <label>
                    ラベル
                    <input
                      type="text"
                      value={button.label}
                      onInput={(e: any) => updateCustomButton(index, { label: e.currentTarget.value })}
                      placeholder="例: +60"
                      maxLength={4}
                      class={labelError ? 'error' : ''}
                    />
                    {labelError && <div class="error-message">{labelError.message}</div>}
                  </label>
                </div>
                <div class="input-group">
                  <label>
                    移動秒数
                    <input
                      type="number"
                      value={button.seconds}
                      onInput={(e: any) => updateCustomButton(index, { seconds: parseInt(e.currentTarget.value) || 0 })}
                      placeholder="3600"
                      class={secondsError ? 'error' : ''}
                    />
                    {secondsError && <div class="error-message">{secondsError.message}</div>}
                  </label>
                </div>
                <div class="checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={button.enabled}
                      onChange={(e: any) => updateCustomButton(index, { enabled: !!e.currentTarget.checked })}
                    />
                    有効
                  </label>
                </div>
              </div>
            )
          })}
        </div>
        <div class="custom-buttons-actions">
          <button class="secondary" onClick={resetCustomButtonsToDefault}>デフォルトに戻す</button>
        </div>
        <div class="help-text">
          <p>・ラベル: 英数字と記号(+,-)のみ、最大4文字</p>
          <p>・移動秒数: 正の値=早送り、負の値=巻き戻し</p>
          <p>・無効化: ラベルを空にするか、有効のチェックを外してください</p>
        </div>
      </div>

      <div class="actions">
        <button onClick={onSave}>Save</button>
        <button class="secondary" onClick={onReset}>Reset All</button>
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

// スタイル追加
const style = document.createElement('style')
style.textContent = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; }
  .row { margin-bottom: 16px; }
  .section { margin-bottom: 32px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  .section h3 { margin-top: 0; margin-bottom: 16px; }
  .custom-buttons-grid { display: flex; flex-direction: column; gap: 12px; }
  .custom-button-row { display: grid; grid-template-columns: 80px 1fr 1fr 80px; gap: 12px; align-items: start; padding: 8px; border: 1px solid #eee; border-radius: 4px; }
  .button-number { font-weight: bold; color: #666; align-self: center; }
  .input-group { display: flex; flex-direction: column; }
  .input-group label { font-size: 12px; color: #666; margin-bottom: 4px; }
  .input-group input { padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; }
  .input-group input.error { border-color: #e74c3c; }
  .checkbox-group { display: flex; align-items: center; justify-content: center; }
  .checkbox-group label { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .error-message { color: #e74c3c; font-size: 11px; margin-top: 2px; }
  .custom-buttons-actions { margin: 16px 0; }
  .help-text { font-size: 12px; color: #666; line-height: 1.4; }
  .help-text p { margin: 4px 0; }
  .actions { margin-top: 24px; display: flex; gap: 8px; }
  .actions button { padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }
  .actions button:not(.secondary) { background: #007cba; color: white; border-color: #007cba; }
  .actions button.secondary { background: #f7f7f7; }
  .status { margin-top: 12px; padding: 8px; background: #e8f5e8; border: 1px solid #4caf50; border-radius: 4px; color: #2e7d32; }
  textarea { width: 100%; height: 120px; font-family: monospace; }
  select, input, textarea { font-size: 14px; }
`
document.head.appendChild(style)

render(h(App, {}), document.getElementById('root')!)

