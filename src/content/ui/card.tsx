import { render, h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PRESET_ZONES, DEFAULT_ZONE, getOffsetMinutesNow, formatOffsetHM, displayNameForZone } from '../core/timezone'
import { t, getLang } from '../i18n'
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
    // 既定は閉じた状態から開始（過去の保存は無視）
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState('')
    const [zone, setZone] = useState(localStorage.getItem(KEY_TZ) || DEFAULT_ZONE)
    // ステータス表示は廃止（カード内メッセージを出さない）
    const inputRef = useRef<HTMLInputElement>(null)
    const [typing, setTyping] = useState(false)
    // ピン留め機能は一旦廃止（オン/オフのみ）
    const [pos, setPos] = useState<{ x: number; y: number } | null>(() => {
      try { const raw = localStorage.getItem('card:pos'); if (raw) return JSON.parse(raw) } catch {}
      return null
    })
    const posRef = useRef<{ x:number; y:number } | null>(pos)
    useEffect(() => { posRef.current = pos }, [pos])
    const [showHelp, setShowHelp] = useState(false)
    const [lang, setLang] = useState(getLang())
    const [zonesOpen, setZonesOpen] = useState(false)
    const zonesBtnRef = useRef<HTMLButtonElement>(null)
    const cardRef = useRef<HTMLDivElement>(null)
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

    // 無操作フェードは廃止（シンプル運用）

    // 外側クリックで閉じる
    useEffect(() => {
      const el = cardRef.current
      if (!el) return
      const root = (el.getRootNode && el.getRootNode()) as ShadowRoot | Document
      const onDown = (e: Event) => {
        if (!open) return
        const path = (e as any).composedPath ? (e as any).composedPath() : []
        const inside = path.includes(el)
        if (!inside) { setOpen(false); setZonesOpen(false) }
      }
      root.addEventListener('mousedown', onDown as any, true)
      return () => root.removeEventListener('mousedown', onDown as any, true)
    }, [open])

    // 初回位置（Jumpボタン上・右寄り or 右下）。字幕帯90pxを避ける
    useEffect(() => {
      if (pos) return
      const btn = document.querySelector('.ytp-right-controls .yt-longseek-jump') as HTMLElement | null
      const r = btn?.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight
      let x = vw - 320, y = Math.max(0, vh - 200 - 90) // 右下寄り、字幕帯回避
      if (r) { x = Math.min(vw - 300, Math.max(0, r.right - 260)); y = Math.max(0, r.top - 140) }
      setPos({ x, y }); savePos({ x, y })
    }, [])

    function savePos(p: { x:number; y:number }) {
      try { localStorage.setItem('card:pos', JSON.stringify(p)) } catch {}
    }

    // ドラッグ（カード上のどこでも。入力やボタンなどのインタラクティブ要素は除外）
    useEffect(() => {
      const el = cardRef.current
      if (!el) return
      const draggingRef = { current: false }
      let sx = 0, sy = 0
      let startX = 0, startY = 0
      const onDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        // 入力系やボタン、リンク、TZメニュー内ではドラッグ開始しない
        const interactiveSel = 'input, textarea, select, button, a, [contenteditable="true"], .yt-dd-menu'
        if (target && (target.closest(interactiveSel))) return
        draggingRef.current = true
        sx = e.clientX; sy = e.clientY
        const p = posRef.current
        startX = p?.x ?? 0; startY = p?.y ?? 0
        e.preventDefault()
      }
      const onMove = (e: MouseEvent) => {
        if (!draggingRef.current) return
        const nx = startX + (e.clientX - sx)
        const ny = startY + (e.clientY - sy)
        const vw = window.innerWidth, vh = window.innerHeight
        const clamped = { x: Math.min(vw - 40, Math.max(0, nx)), y: Math.min(vh - 40, Math.max(0, ny)) }
        setPos(clamped); savePos(clamped)
      }
      const onUp = () => { draggingRef.current = false }
      el.addEventListener('mousedown', onDown)
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return () => { el.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    }, [])

    // 提交
    async function onSubmit(e?: Event) {
      e?.preventDefault()
      const v = getVideo()
      if (!v) {
        return
      }
      const r = jumpToLocalTime(v, input.trim(), zone)
      if (r.ok) {
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
    const stylePos: any = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : { right: '24px', bottom: '100px' }
    return (
      <div id="yt-card" ref={cardRef} onKeyDownCapture={(e: any) => e.stopPropagation()} onKeyUpCapture={(e: any) => e.stopPropagation()} style={{
        position: 'fixed', zIndex: '2147483647',
        background: 'rgba(17,17,17,.92)', color: '#fff', padding: '10px 12px', borderRadius: '10px',
        boxShadow: '0 2px 12px rgba(0,0,0,.4)', width: '300px', pointerEvents: 'auto', display,
        opacity: .85,
        cursor: 'move',
        ...stylePos
      }}>
        {/* 視覚フィードバック＆カーソル制御（ホバー時にわずかに持ち上げる） */}
        <style>{`
          #yt-card { transition: box-shadow .15s ease, transform .12s ease, background-color .15s ease; }
          #yt-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,.55); background: rgba(22,22,22,.96) !important; }
          #yt-card:active { transform: translateY(0); }
          #yt-card input, #yt-card textarea, #yt-card select { cursor: text; }
          #yt-card button, #yt-card a, #yt-card .yt-dd-menu, #yt-card [contenteditable="true"] { cursor: auto; }
        `}</style>
        {/* tools row (no title) */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:'6px' }}>
          <div style={{ marginLeft:'auto', display:'flex', gap:'6px' }}>
            <button onClick={() => setShowHelp((v) => !v)} title="Help" style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>?</button>
            <button onClick={() => { const next = lang === 'en' ? 'ja' : 'en'; try { localStorage.setItem('lang', next) } catch {}; setLang(next) }} title={lang === 'en' ? '日本語' : 'English'} style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>{lang === 'en' ? 'EN' : 'JA'}</button>
            <button onClick={() => api.close()} title="Close" style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        {showHelp && (
          <div style={{ fontSize: '11px', color: '#bbb', marginBottom: '6px', lineHeight: 1.5 }}>
            {t('help_text').split('\n').map((line) => (<>
              {line}
              <br/>
            </>))}
          </div>
        )}
        <form onSubmit={onSubmit as any} style={{ position: 'relative' }}>
          <style>{`
            .yt-dd { position: relative; }
            .yt-dd-btn {
              width: 100%;
              display: flex;
              align-items: center;
              box-sizing: border-box;
              height: 30px; /* fixed for consistent card height across locales */
              text-align: left;
              background:#111;
              color:#fff;
              border:1px solid #444;
              border-radius:6px;
              padding:0 30px 0 8px; /* space for caret */
              cursor:pointer;
              font-size:12px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }
            .yt-dd-btn:after { content:'▾'; position:absolute; right:8px; top:50%; transform:translateY(-50%); opacity:.8 }
            .yt-dd-menu { position:absolute; left:0; right:0; top:100%; margin-top:4px; background:#161616; border:1px solid #444; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.4); max-height:260px; overflow:auto; z-index: 10; }
            .yt-dd-item { padding:8px 10px; color:#fff; cursor:pointer; font-size:14px; }
            .yt-dd-item-row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
            .yt-dd-item-row .left { display:flex; align-items:center; gap:6px; }
            .yt-dd-item .tick { width:14px; text-align:center; opacity:.9 }
            .yt-dd-item .badge { background:#222; border:1px solid #444; color:#ddd; border-radius:6px; padding:1px 6px; font-size:11px; }
            .yt-dd-item:hover { background:#3a3a3a; }
            .yt-dd-group { padding:6px 10px; color:#aaa; font-size:11px; }
          `}</style>
          <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
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
            placeholder={'HH:mm:ss or HHmmss'}
            spellcheck={false}
            style={{ flex:'1 1 auto', minWidth:0, padding: '6px 8px', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
            <button type="submit" style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #444', background: 'rgba(17,17,17,.92)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}>Jump</button>
          </div>
          {/* TZ selector (small line, text smaller than main) */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', width: '100%' }}>
            <div class="yt-dd" style={{ flex:'1 1 auto', minWidth:0 }}>
              <button ref={zonesBtnRef} type="button" class="yt-dd-btn" style={{ fontSize:'11px' }} onClick={() => setZonesOpen(v=>!v)}>{labelTZ(zone)}</button>
              {zonesOpen && (
                <div class="yt-dd-menu" onMouseDown={(e: any) => e.stopPropagation()}>
                  {mru.length > 0 && <div class="yt-dd-group">{lang === 'ja' ? '最近使用したもの' : 'Recent'}</div>}
                  {mru.map((z) => (
                    <div class="yt-dd-item" onClick={() => { setZone(z); setZonesOpen(false) }}>
                      <div class="yt-dd-item-row"><span>{labelTZName(z)}</span><span class="badge">{labelTZOff(z)}</span></div>
                    </div>
                  ))}
                  <div class="yt-dd-group">{lang === 'ja' ? 'タイムゾーン' : 'Zones'}</div>
                  {others.map((z) => (
                    <div class="yt-dd-item" onClick={() => { setZone(z); setZonesOpen(false) }}>
                      <div class="yt-dd-item-row"><span>{labelTZName(z)}</span><span class="badge">{labelTZOff(z)}</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>
        {/* footer helper text removed; use ? button for help */}
      </div>
    )
  }

  render(h(App, {}), host)

  return api
}

function labelTZ(z: string): string {
  try {
    const lang = getLang()
    const jpMap: Record<string,string> = {
      'Asia/Tokyo': '日本:東京',
      'Asia/Seoul': '韓国:ソウル',
      'Europe/Amsterdam': 'オランダ:アムステルダム',
      'Africa/Windhoek': 'ナミビア:ウィントフック',
      'Africa/Nairobi': 'ケニア:ナイロビ',
      'America/New_York': '米国:ニューヨーク',
      'America/Los_Angeles': '米国:ロサンゼルス',
      'Pacific/Honolulu': '米国:ホノルル',
      'Europe/Copenhagen': 'デンマーク:コペンハーゲン',
      'Europe/London': '英国:ロンドン',
      'Europe/Berlin': 'ドイツ:ベルリン',
      'Europe/Rome': 'イタリア:ローマ',
      'Australia/Sydney': '豪州:シドニー',
      'Asia/Singapore': 'シンガポール',
      'UTC': 'UTC:UTC',
    }
    const enMap: Record<string,string> = {
      'Asia/Tokyo': 'Japan:Tokyo',
      'Asia/Seoul': 'Korea:Seoul',
      'Europe/Amsterdam': 'Netherlands:Amsterdam',
      'Africa/Windhoek': 'Namibia:Windhoek',
      'Africa/Nairobi': 'Kenya:Nairobi',
      'America/New_York': 'USA:New York',
      'America/Los_Angeles': 'USA:Los Angeles',
      'Pacific/Honolulu': 'USA:Honolulu',
      'Europe/Copenhagen': 'Denmark:Copenhagen',
      'Europe/London': 'UK:London',
      'Europe/Berlin': 'Germany:Berlin',
      'Europe/Rome': 'Italy:Rome',
      'Australia/Sydney': 'Australia:Sydney',
      'Asia/Singapore': 'Singapore:Singapore',
      'UTC': 'UTC:UTC',
    }
    const base = lang === 'ja' ? (jpMap[z] || displayNameForZone(z)) : (enMap[z] || displayNameForZone(z))
    const off = formatOffsetHM(getOffsetMinutesNow(z))
    return `${base} (${off})`
  } catch {
    return z
  }
}

function labelTZName(z: string): string {
  try {
    const lang = getLang()
    const jpMap: Record<string,string> = {
      'Asia/Tokyo': '日本:東京', 'Asia/Seoul': '韓国:ソウル', 'Europe/Amsterdam': 'オランダ:アムステルダム',
      'Africa/Windhoek': 'ナミビア:ウィントフック', 'Africa/Nairobi': 'ケニア:ナイロビ', 'America/New_York': '米国:ニューヨーク',
      'America/Los_Angeles': '米国:ロサンゼルス', 'Pacific/Honolulu': '米国:ホノルル', 'Europe/Copenhagen': 'デンマーク:コペンハーゲン',
      'Europe/London': '英国:ロンドン', 'Europe/Berlin': 'ドイツ:ベルリン', 'Europe/Rome': 'イタリア:ローマ',
      'Australia/Sydney': '豪州:シドニー', 'Asia/Singapore': 'シンガポール', 'UTC': 'UTC:UTC',
    }
    const enMap: Record<string,string> = {
      'Asia/Tokyo': 'Japan:Tokyo', 'Asia/Seoul': 'Korea:Seoul', 'Europe/Amsterdam': 'Netherlands:Amsterdam',
      'Africa/Windhoek': 'Namibia:Windhoek', 'Africa/Nairobi': 'Kenya:Nairobi', 'America/New_York': 'USA:New York',
      'America/Los_Angeles': 'USA:Los Angeles', 'Pacific/Honolulu': 'USA:Honolulu', 'Europe/Copenhagen': 'Denmark:Copenhagen',
      'Europe/London': 'UK:London', 'Europe/Berlin': 'Germany:Berlin', 'Europe/Rome': 'Italy:Rome', 'Australia/Sydney': 'Australia:Sydney',
      'Asia/Singapore': 'Singapore:Singapore', 'UTC': 'UTC:UTC',
    }
    return lang === 'ja' ? (jpMap[z] || displayNameForZone(z)) : (enMap[z] || displayNameForZone(z))
  } catch { return z }
}

function labelTZOff(z: string): string {
  try { return formatOffsetHM(getOffsetMinutesNow(z)) } catch { return '+00:00' }
}
