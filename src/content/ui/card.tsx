import { render, h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PRESET_ZONES, DEFAULT_ZONE } from '../core/timezone'
import { jumpToLocalTime } from '../core/jump'
// シンプル化のため、startEpoch検知やレイテンシ手動キャリブは撤去

// ストレージキー
const KEY_OPEN = 'card:open'
const KEY_TZ = 'tz:current'
const KEY_MRU = 'tz:mru'

type GetVideo = () => HTMLVideoElement | null

export type CardAPI = { open: () => void; close: () => void; toggle: () => void; isTyping: () => boolean; isOpen: () => boolean }

// ルートの設置とレンダリング
export function mountCard(sr: ShadowRoot, getVideo: GetVideo): CardAPI {
  const hostId = 'yt-longseek-card-root'
  let host = sr.getElementById(hostId)
  if (!host) {
    host = document.createElement('div')
    host.id = hostId
    sr.appendChild(host)
  }

  let api: CardAPI = { open: () => {}, close: () => {}, toggle: () => {}, isTyping: () => false, isOpen: () => false }

  function App() {
    // 状態
    const [open, setOpen] = useState(localStorage.getItem(KEY_OPEN) === '1')
    const [input, setInput] = useState('')
    const [zone, setZone] = useState(localStorage.getItem(KEY_TZ) || DEFAULT_ZONE)
    const [status, setStatus] = useState<string>('')
    const inputRef = useRef<HTMLInputElement>(null)
    const [typing, setTyping] = useState(false)
    // 補助状態やデバッグ表示は撤去

    // MRUゾーンの一覧を用意
    const { mru, others } = useMemo(() => {
      let mru: string[] = []
      try {
        const raw = localStorage.getItem(KEY_MRU)
        if (raw) mru = JSON.parse(raw)
      } catch {}
      const uniq = Array.from(new Set([zone, ...mru]))
      const mru5 = uniq.filter(Boolean).slice(0, 5)
      const others = PRESET_ZONES.filter((z) => !mru5.includes(z))
      return { mru: mru5, others }
    }, [zone])

    // APIを外へ
    useEffect(() => {
      api.open = () => {
        setOpen(true)
        localStorage.setItem(KEY_OPEN, '1')
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      api.close = () => {
        setOpen(false)
        localStorage.setItem(KEY_OPEN, '0')
      }
      api.toggle = () => (open ? api.close() : api.open())
      api.isTyping = () => typing
      api.isOpen = () => open
    }, [open, typing])

    // 入力中フラグ
    useEffect(() => {
      const el = inputRef.current
      if (!el) return
      const onFocus = () => setTyping(true)
      const onBlur = () => setTyping(false)
      // YouTube側への伝播を止める 数字入力でのデフォルトシークを抑止
      const stop = (e: any) => e.stopPropagation()
      el.addEventListener('focus', onFocus)
      el.addEventListener('blur', onBlur)
      el.addEventListener('keydown', stop, true)
      el.addEventListener('keyup', stop, true)
      el.addEventListener('keypress', stop, true)
      return () => {
        el.removeEventListener('focus', onFocus)
        el.removeEventListener('blur', onBlur)
        el.removeEventListener('keydown', stop, true)
        el.removeEventListener('keyup', stop, true)
        el.removeEventListener('keypress', stop, true)
      }
    }, [])

    // 提交
    async function onSubmit(e?: Event) {
      e?.preventDefault()
      const v = getVideo()
      if (!v) {
        setStatus('No video found')
        return
      }
      const r = jumpToLocalTime(v, input.trim(), zone)
      if (!r.ok) {
        setStatus(r.reason || 'Failed')
      } else {
        setStatus(r.decision.replace('-', ' '))
        // 成功したら入力欄をクリア
        setInput('')
      }
      // MRU更新
      try {
        const raw = localStorage.getItem(KEY_MRU)
        const arr: string[] = raw ? JSON.parse(raw) : []
        const next = [zone, ...arr.filter((z) => z !== zone)]
        localStorage.setItem(KEY_MRU, JSON.stringify(next.slice(0, 5)))
        localStorage.setItem(KEY_TZ, zone)
      } catch {}
    }

    // 表示
    const display = open ? '' : 'none'
    return (
      <div id="yt-card" onKeyDownCapture={(e: any) => e.stopPropagation()} onKeyUpCapture={(e: any) => e.stopPropagation()} style={{
        position: 'fixed', bottom: '24px', right: '24px', zIndex: '2147483647',
        background: 'rgba(17,17,17,.96)', color: '#fff', padding: '10px 12px', borderRadius: '10px',
        boxShadow: '0 2px 12px rgba(0,0,0,.4)', width: '280px', pointerEvents: 'auto', display
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
          <strong style={{ fontSize: '13px' }}>Jump to local time</strong>
          <button onClick={() => api.close()} title="Close" style={{ marginLeft: 'auto', background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>×</button>
        </div>
        <form onSubmit={onSubmit as any}>
          <input
            ref={inputRef}
            value={input}
            onInput={(e: any) => {
              const raw = e.currentTarget.value as string
              // 数字とコロン以外を除去（Paste含む）
              const cleaned = raw.replace(/[^0-9:]/g, '')
              // 先頭のコロンは不可（連続コロンもまとめて除去）
              const noLeadingColon = cleaned.replace(/^:+/, '')
              if (noLeadingColon !== raw) e.currentTarget.value = noLeadingColon
              setInput(noLeadingColon)
            }}
            inputMode="numeric"
            pattern="[0-9:]*"
            placeholder="HH:mm or HHmm"
            spellcheck={false}
            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#fff', outline: 'none' }}
          />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center' }}>
            <select value={zone} onChange={(e: any) => setZone(e.currentTarget.value)} style={{ flex: 1, padding: '6px 8px', background: '#111', color: '#fff', border: '1px solid #444', borderRadius: '6px' }}>
              {mru.length > 0 && <optgroup label="Recent">{mru.map((z) => <option value={z}>{z}</option>)}</optgroup>}
              <optgroup label="Zones">{others.map((z) => <option value={z}>{z}</option>)}</optgroup>
            </select>
            <button type="submit" style={{ padding: '6px 10px', borderRadius: '6px', border: 0, background: '#2563eb', color: '#fff', cursor: 'pointer' }}>Jump</button>
          </div>
        </form>
        {status && <div style={{ marginTop: '6px', fontSize: '12px', color: '#bbb' }}>{status}</div>}
        {/* シンプル運用のため、補助UIは非表示 */}
        <div style={{ marginTop: '6px', fontSize: '11px', color: '#aaa' }}>Press Alt+Shift+J to toggle</div>
      </div>
    )
  }

  render(h(App, {}), host)

  return api
}
