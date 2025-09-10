import { render, h } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PRESET_ZONES, DEFAULT_ZONE, getOffsetMinutesNow, formatOffsetHM, displayNameForZone } from '../core/timezone'
import { t, getLang } from '../utils/i18n'
import { jumpToLocalTime } from '../core/jump'
import { getString, setString, getJSON, addTZMru, Keys } from '../store/local'
import { clampRectToViewport, clampRectToBounds } from '../utils/layout'
import { loadCustomButtons, getEnabledButtons } from '../store/customButtons'
import { seekBySeconds } from '../core/seek'
// シンプル化のため、startEpoch検知やレイテンシ手動キャリブは撤去

// ストレージキー
const KEY_OPEN = Keys.CardOpen

type GetVideo = () => HTMLVideoElement | null

export type CardAPI = {
  open: () => void
  openAt: (x: number, y: number) => void
  openSmart: () => void  // posが無ければボタン近く、あれば最後の位置
  close: () => void
  toggle: () => void
  isTyping: () => boolean
  isOpen: () => boolean
}

// ルートの設置とレンダリング
export function mountCard(sr: ShadowRoot, getVideo: GetVideo): CardAPI {
  const hostId = 'yt-longseek-card-root'
  let host = sr.getElementById(hostId)
  if (!host) {
    host = document.createElement('div')
    host.id = hostId
    sr.appendChild(host)
  }

  let api: CardAPI = { open: () => {}, openAt: () => {}, openSmart: () => {}, close: () => {}, toggle: () => {}, isTyping: () => false, isOpen: () => false }

  function App() {
    // 状態
    // 既定は閉じた状態から開始（過去の保存は無視）
    const [open, setOpen] = useState(false)
    const [input, setInput] = useState('')
    const [zone, setZone] = useState(getString(Keys.TzCurrent) || DEFAULT_ZONE)
    // ステータス表示は廃止（カード内メッセージを出さない）
    const inputRef = useRef<HTMLInputElement>(null)
    const [typing, setTyping] = useState(false)
    // ピン留め機能は一旦廃止（オン/オフのみ）
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
    const posRef = useRef<{ x:number; y:number } | null>(pos)
    useEffect(() => { posRef.current = pos }, [pos])
    const [showHelp, setShowHelp] = useState(false)
    const [lang, setLang] = useState(getLang())
    const [zonesOpen, setZonesOpen] = useState(false)
    const [presets, setPresets] = useState<string[]>(PRESET_ZONES)
    const zonesBtnRef = useRef<HTMLButtonElement>(null)
    const cardRef = useRef<HTMLDivElement>(null)
    // カスタムボタン設定
    const [customButtons, setCustomButtons] = useState(() => getEnabledButtons(loadCustomButtons()))
    // 補助状態やデバッグ表示は撤去

    // MRUゾーンの一覧を用意
    const { mru, others } = useMemo(() => {
      const rawMru = getJSON<string[]>(Keys.TzMru) ?? []
      const uniq = Array.from(new Set([zone, ...rawMru]))
      const mru5 = uniq.filter(Boolean).slice(0, 5)
      const others = presets.filter((z) => !mru5.includes(z))
      return { mru: mru5, others }
    }, [zone, presets])

    // APIを外へ
    useEffect(() => {
      api.open = () => {
        setOpen(true)
        setString(KEY_OPEN, '1')
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      api.openSmart = () => {
        // 保存位置があるかチェック
        const savedPos = posRef.current
        
        // 保存位置が画面外かチェック
        let needRecalculate = !savedPos
        if (savedPos) {
          const vw = window.innerWidth
          const vh = window.innerHeight
          const CARD_W = 300, CARD_H = 160
          const outOfBounds = (
            savedPos.x < 0 || 
            savedPos.y < 0 || 
            savedPos.x + CARD_W > vw || 
            savedPos.y + CARD_H > vh
          )
          needRecalculate = outOfBounds
        }
        
        if (!needRecalculate) { 
          api.open(); 
          return 
        }
        try {
          const btn = document.querySelector('#ytp-jump') as HTMLElement | null
          const r = btn?.getBoundingClientRect()
          const v = getVideo()
          const videoRect = (v?.getBoundingClientRect?.() as DOMRect | undefined)
            ?? (document.querySelector('.html5-video-player') as HTMLElement | null)?.getBoundingClientRect()
          if (r) {
            const CARD_W = 300, CARD_H = 160
            const SHIFT_INNER = 24 // 右端から内側へ
            let x = r.right - SHIFT_INNER - CARD_W
            let y = r.top - CARD_H - 12
            if (videoRect) {
              const p = clampRectToBounds({ x, y }, CARD_W, CARD_H, videoRect)
              x = p.x; y = p.y
            } else {
              const p = clampRectToViewport({ x, y }, CARD_W, CARD_H, window.innerWidth, window.innerHeight)
              x = p.x; y = p.y
            }
            setPos({ x, y })
          }
        } catch {}
        setOpen(true)
        setString(KEY_OPEN, '1')
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      api.openAt = (x: number, y: number) => {
        const vw = window.innerWidth, vh = window.innerHeight
        const rect = cardRef.current?.getBoundingClientRect()
        const CARD_W = rect?.width ?? 300
        const CARD_H = rect?.height ?? 160
        const OFFSET_Y = 140
        const px = x - (CARD_W / 2)
        const py = y - OFFSET_Y
        const v = getVideo()
        const videoRect = (v?.getBoundingClientRect?.() as DOMRect | undefined)
          ?? (document.querySelector('.html5-video-player') as HTMLElement | null)?.getBoundingClientRect()
        const clamped = videoRect
          ? clampRectToBounds({ x: px, y: py }, CARD_W, CARD_H, videoRect)
          : clampRectToViewport({ x: px, y: py }, CARD_W, CARD_H, vw, vh)
        setPos(clamped); savePos(clamped)
        setOpen(true)
        setString(KEY_OPEN, '1')
        setTimeout(() => inputRef.current?.focus(), 0)
      }
      api.close = () => {
        setOpen(false)
        setString(KEY_OPEN, '0')
      }
      api.toggle = () => (open ? api.close() : api.openSmart())
      api.isTyping = () => typing
      api.isOpen = () => open
    }, [open, typing])

    // 入力中フラグ
    useEffect(() => {
      const el = inputRef.current
      if (!el) return
      const onFocus = () => setTyping(true)
      const onBlur = () => setTyping(false)
      // YouTube側への伝播を原則止めるが、Alt+Shift+J はパネルのトグル用に通す
      const stop = (e: KeyboardEvent) => {
        const isToggle = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && (e.key?.toUpperCase?.() === 'J')
        if (!isToggle) e.stopPropagation()
      }
      el.addEventListener('focus', onFocus)
      el.addEventListener('blur', onBlur)
      el.addEventListener('keydown', stop as any, true)
      el.addEventListener('keyup', stop as any, true)
      el.addEventListener('keypress', stop as any, true)
      return () => {
        el.removeEventListener('focus', onFocus)
        el.removeEventListener('blur', onBlur)
        el.removeEventListener('keydown', stop as any, true)
        el.removeEventListener('keyup', stop as any, true)
        el.removeEventListener('keypress', stop as any, true)
      }
    }, [])

    // 無操作フェードは廃止（シンプル運用）

    // 画面リサイズ/全画面切替/向き変更で位置をクランプ（動画領域優先）
    useEffect(() => {
      const onResize = () => {
        setPos((p) => {
          if (!p) return p
          const rect = cardRef.current?.getBoundingClientRect()
          const w = rect?.width ?? 300
          const h = rect?.height ?? 160
          // 常にビューポート内にクランプ（ブラウザリサイズでアクセス不可を防ぐ）
          const clamped = clampRectToViewport(p, w, h, window.innerWidth, window.innerHeight)
          if (clamped.x !== p.x || clamped.y !== p.y) { savePos(clamped) }
          return clamped
        })
      }
      window.addEventListener('resize', onResize)
      document.addEventListener('fullscreenchange', onResize)
      window.addEventListener('orientationchange', onResize)
      return () => { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onResize); window.removeEventListener('orientationchange', onResize) }
    }, [])

    // optionsページからのTZ初期リスト（chrome.storage.local）を一度読み込み
    useEffect(() => {
      try {
        const anyChrome = (globalThis as any).chrome
        if (!anyChrome?.storage?.local) return
        anyChrome.storage.local.get(['tz:preset'], (res: any) => {
          const arr = res?.['tz:preset']
          if (Array.isArray(arr) && arr.length > 0) {
            const uniq = Array.from(new Set(arr.filter((x) => typeof x === 'string' && x)))
            if (uniq.length > 0) setPresets(uniq)
          }
        })
      } catch {}
    }, [])

    // カスタムボタン設定の更新を監視
    useEffect(() => {
      const updateCustomButtons = () => {
        setCustomButtons(getEnabledButtons(loadCustomButtons()))
      }
      
      // localStorageの変更を監視
      window.addEventListener('storage', updateCustomButtons)
      
      // 定期的な再読み込み（他のタブでの変更対応）
      const interval = setInterval(updateCustomButtons, 2000)
      
      return () => {
        window.removeEventListener('storage', updateCustomButtons)
        clearInterval(interval)
      }
    }, [])

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

    // 旧初期位置ロジックは撤去（openSmartが一元的に決定）

    function savePos(_p: { x:number; y:number }) { /* session-only: do not persist across reload */ }

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
        
        // チャット欄の干渉を防ぐため、ドラッグ中はチャット要素のポインターイベントを無効化
        const chatContainer = document.querySelector('#chat-container, #chatframe')
        if (chatContainer) {
          (chatContainer as HTMLElement).style.pointerEvents = 'none'
        }
        
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
      const onUp = () => { 
        draggingRef.current = false 
        
        // チャット要素のポインターイベントを復元
        const chatContainer = document.querySelector('#chat-container, #chatframe')
        if (chatContainer) {
          (chatContainer as HTMLElement).style.pointerEvents = ''
        }
      }
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
        addTZMru(zone)
        setString(Keys.TzCurrent, zone)
      } catch {}
    }

    // カスタムボタンクリックハンドラ
    function handleCustomButtonClick(seconds: number) {
      const v = getVideo()
      if (!v) return
      seekBySeconds(v, seconds)
    }

    // 表示
    const display = open ? '' : 'none'
    const stylePos: any = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : { right: '24px', bottom: '100px' }
    return (
      <div id="yt-card" ref={cardRef} style={{
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
          #yt-card::after{ content:""; position:absolute; left: var(--arrow-x, 50%); transform: translateX(-50%) rotate(45deg); width:10px; height:10px; background:#111; border:1px solid #444; border-left:none; border-top:none; top: calc(100% * -1 - 6px); opacity: 0; }
          #yt-card.flip-y::after{ top:auto; bottom:-6px; transform: translateX(-50%) rotate(225deg); }
          .custom-buttons { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
          .custom-button { flex: 1 1 calc(16.67% - 4px); min-width: 40px; max-width: 60px; padding: 4px 2px; font-size: 11px; background: #222; color: #fff; border: 1px solid #444; border-radius: 4px; cursor: pointer; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .custom-button:hover { background: #333; }
          .custom-button:active { background: #444; }
          @media (max-width: 360px) { .custom-button { flex: 1 1 calc(33.33% - 4px); } }
        `}</style>
        {/* tools row (no title) */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:'6px' }}>
          <div style={{ marginLeft:'auto', display:'flex', gap:'6px' }}>
            <button onClick={() => setShowHelp((v) => !v)} title="Help" style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>?</button>
            <button onClick={() => { const next = lang === 'en' ? 'ja' : 'en'; try { setString(Keys.Lang, next) } catch {}; setLang(next) }} title={lang === 'en' ? '日本語' : 'English'} style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>{lang === 'en' ? 'EN' : 'JA'}</button>
            <button onClick={() => api.close()} title="Close" style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        {/* カスタムシークボタン */}
        {customButtons.length > 0 && (
          <div class="custom-buttons">
            {customButtons.map((button, index) => (
              <button
                key={index}
                class="custom-button"
                type="button"
                title={`${button.seconds > 0 ? '+' : ''}${button.seconds}秒`}
                onClick={() => handleCustomButtonClick(button.seconds)}
                onMouseDown={(e: any) => e.stopPropagation()}
              >
                {button.label}
              </button>
            ))}
          </div>
        )}
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

// ---- helpers ----

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
