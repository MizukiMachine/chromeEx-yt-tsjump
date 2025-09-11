import { render, h } from 'preact'
import { createPortal } from 'preact/compat'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PRESET_ZONES, DEFAULT_ZONE, getOffsetMinutesNow, formatOffsetHM, displayNameForZone } from '../core/timezone'
import { t, getLang } from '../utils/i18n'
import { jumpToLocalTime } from '../core/jump'
import { getString, setString, getJSON, addTZMru, Keys } from '../store/local'
import { clampRectToViewport, clampRectToBounds } from '../utils/layout'
import { loadCustomButtons, getEnabledButtons, saveCustomButtons, validateLabel, validateSeconds } from '../store/customButtons'
import { seekBySeconds } from '../core/seek'
import { isAdActive } from '../core/adsense'
import { showToast } from './toast'
// シンプル化のため、startEpoch検知やレイテンシ手動キャリブは撤去

// ストレージキー
const KEY_OPEN = Keys.CardOpen

type GetVideo = () => HTMLVideoElement | null

// ポータル用のフック - 要素の位置を追跡してbody直下にポップアップを表示
function useAnchorPosition(anchor: HTMLElement | null, offsetY = 8) {
  const [pos, setPos] = useState<{left: number; top: number}>({ left: 0, top: 0 })
  
  useLayoutEffect(() => {
    if (!anchor) return
    
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect()
      setPos({ 
        left: rect.left + rect.width / 2,
        top: rect.bottom + offsetY 
      })
    }
    
    updatePosition()
    window.addEventListener('scroll', updatePosition, { passive: true })
    window.addEventListener('resize', updatePosition)
    // YouTube UI更新への対応
    const interval = setInterval(updatePosition, 1000)
    
    return () => {
      window.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
      clearInterval(interval)
    }
  }, [anchor, offsetY])
  
  return pos
}

// EditPopupPortal - ポップアップをbody直下にポータル描画
function EditPopupPortal({ anchorEl, open, children }: {
  anchorEl: HTMLElement | null;
  open: boolean;
  children: preact.ComponentChildren;
}) {
  const portalRootRef = useRef<HTMLElement | null>(null)
  
  // portal rootの初期化
  if (!portalRootRef.current && open) {
    const root = document.createElement('div')
    root.id = 'yt-longseek-portal-root'
    root.style.position = 'fixed'
    root.style.inset = '0 auto auto 0'
    root.style.zIndex = '2147483647'
    root.style.pointerEvents = 'none' // 透過
    document.body.appendChild(root)
    portalRootRef.current = root
  }
  
  // portal rootのクリーンアップ
  useEffect(() => {
    return () => {
      if (portalRootRef.current && document.body.contains(portalRootRef.current)) {
        document.body.removeChild(portalRootRef.current)
        portalRootRef.current = null
      }
    }
  }, [])
  
  const { left, top } = useAnchorPosition(anchorEl, 8)
  
  if (!open || !portalRootRef.current) return null
  
  const popup = (
    <div
      style={{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        transform: 'translateX(-50%)',
        pointerEvents: 'auto', // ポップアップは操作可能
        background: 'rgba(17,17,17,0.95)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1, // portal内では相対的なz-index
        minWidth: '180px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
      {/* 三角形の矢印 */}
      <div
        style={{
          position: 'absolute',
          top: '-8px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '0',
          height: '0',
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderBottom: '8px solid rgba(255, 255, 255, 0.8)',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none'
        }}
      />
      {children}
    </div>
  )
  
  return createPortal(popup, portalRootRef.current)
}

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
    const [isEditMode, setIsEditMode] = useState(false)
    const [editingButton, setEditingButton] = useState<number | null>(null)
    const [editingValues, setEditingValues] = useState<{ label: string; seconds: string }>({ label: '', seconds: '' })
    const [isCompactLayout, setIsCompactLayout] = useState(false)
    const [showCustomButtons, setShowCustomButtons] = useState(false)
    // ポータル用のボタン要素参照
    const buttonRefs = useRef<(HTMLElement | null)[]>([])
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
        // 操作パネル閉じる時に編集状態もリセット
        setIsEditMode(false)
        setEditingButton(null)
        setEditingValues({ label: '', seconds: '' })
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
        // ESCキーでフォーカス解除
        if (e.key === 'Escape') {
          (e.currentTarget as HTMLInputElement)?.blur()
          e.stopPropagation()
          return
        }
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
        
        // ボタンレイアウトのチェック
        checkButtonLayout()
      }
      window.addEventListener('resize', onResize)
      document.addEventListener('fullscreenchange', onResize)
      window.addEventListener('orientationchange', onResize)
      return () => { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onResize); window.removeEventListener('orientationchange', onResize) }
    }, [])
    
    // ボタンレイアウトのチェック - 実際のDOM要素の幅を測定
    const checkButtonLayout = () => {
      const customButtonsContainer = cardRef.current?.querySelector('.custom-buttons')
      if (!customButtonsContainer) {
        setIsCompactLayout(false)
        return
      }
      
      // 一時的に1行レイアウトにして幅を測定
      customButtonsContainer.classList.remove('compact')
      const containerWidth = (customButtonsContainer as HTMLElement).offsetWidth
      const buttons = customButtonsContainer.querySelectorAll('.custom-button')
      
      let totalButtonWidth = 0
      buttons.forEach(button => {
        totalButtonWidth += (button as HTMLElement).offsetWidth
      })
      
      // ガップ分を追加 (4px * (buttons.length - 1))
      const totalWidth = totalButtonWidth + (buttons.length > 0 ? (buttons.length - 1) * 4 : 0)
      
      // コンテナ幅を超える場合は2行レイアウト
      setIsCompactLayout(totalWidth > containerWidth)
    }
    
    // カスタムボタンの表示状態初期化 - 常に非表示から開始
    useEffect(() => {
      // 初期状態は必ず非表示（localStorageは使わない）
      setShowCustomButtons(false)
    }, [])

    useEffect(() => {
      // カスタムボタンが表示されている場合のみレイアウトチェック
      if (showCustomButtons) {
        setTimeout(checkButtonLayout, 0)
      }
    }, [customButtons, isEditMode, showCustomButtons])

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

    // カスタムボタンの編集処理
    const startEditButton = (displayIndex: number) => {
      if (!isEditMode) {
        return // 編集モードでない場合は何もしない
      }
      
      // 表示中のボタンから実際のボタンを取得
      const button = customButtons[displayIndex]
      if (!button) return
      
      setEditingButton(displayIndex)
      setEditingValues({
        label: button.label,
        seconds: button.seconds.toString()
      })
    }
    
    const toggleEditMode = () => {
      setIsEditMode(!isEditMode)
      if (isEditMode) {
        // 編集モード終了時は編集中の状態をリセット
        setEditingButton(null)
        setEditingValues({ label: '', seconds: '' })
      }
    }
    
    const toggleCustomButtons = () => {
      const newState = !showCustomButtons
      setShowCustomButtons(newState)
      
      // 編集モードも一緒に閉じる
      if (!newState && isEditMode) {
        setIsEditMode(false)
        setEditingButton(null)
        setEditingValues({ label: '', seconds: '' })
      }
      
      // セッション内のみ保持（localStorageには保存しない）
    }

    const saveEditButton = () => {
      if (editingButton === null) return
      
      // 編集中のボタンを取得
      const buttonToEdit = customButtons[editingButton]
      if (!buttonToEdit) return
      
      const labelValidation = validateLabel(editingValues.label)
      const secondsValue = parseInt(editingValues.seconds) || 0
      const secondsValidation = validateSeconds(secondsValue)
      
      if (!labelValidation.valid) {
        showToast(labelValidation.error || 'Invalid label', 'warn')
        return
      }
      
      if (!secondsValidation.valid) {
        showToast(secondsValidation.error || 'Invalid seconds', 'warn')
        return
      }
      
      // 全体設定を読み込んでマッチするボタンを更新
      const config = loadCustomButtons()
      const newButtons = [...config.buttons]
      
      // 元のボタンを全体配列で見つけて更新
      const fullArrayIndex = newButtons.findIndex(btn => 
        btn.label === buttonToEdit.label && 
        btn.seconds === buttonToEdit.seconds && 
        btn.enabled
      )
      
      if (fullArrayIndex !== -1) {
        newButtons[fullArrayIndex] = {
          label: editingValues.label,
          seconds: secondsValue,
          enabled: editingValues.label.trim() !== ''
        }
        
        saveCustomButtons({ buttons: newButtons })
        setCustomButtons(getEnabledButtons({ buttons: newButtons }))
        setEditingButton(null)
        setEditingValues({ label: '', seconds: '' })
        showToast('Button updated!', 'info')
      }
    }

    const cancelEditButton = () => {
      setEditingButton(null)
      setEditingValues({ label: '', seconds: '' })
    }

    const addNewButton = () => {
      if (!isEditMode) return // 編集モードでない場合は何もしない
      
      const config = loadCustomButtons()
      const firstEmptyIndex = config.buttons.findIndex(btn => !btn.enabled || btn.label.trim() === '')
      
      if (firstEmptyIndex === -1) {
        showToast('Maximum 6 buttons allowed', 'warn')
        return
      }
      
      setEditingButton(firstEmptyIndex)
      setEditingValues({ label: '', seconds: '60' })
    }

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
        // 入力系やボタン、リンク、TZメニュー、ヘルプテキスト内ではドラッグ開始しない
        const interactiveSel = 'input, textarea, select, button, a, [contenteditable="true"], .yt-dd-menu, .help-text'
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
    function handleCustomButtonClick(button: any, displayIndex: number) {
      if (isEditMode) {
        // 編集モードの場合は編集開始
        startEditButton(displayIndex)
      } else {
        // 通常モードの場合はシーク実行
        const v = getVideo()
        if (!v) return
        
        // 広告中の場合は抑止
        if (isAdActive()) {
          showToast(t('toast_ad_paused'), 'warn')
          return
        }
        
        const result = seekBySeconds(v, button.seconds)
        
        // クランプが発生した場合はトースト通知
        if (result.clamped) {
          showToast(t('toast_clamped'), 'info')
        }
      }
    }

    // 表示
    const display = open ? '' : 'none'
    const stylePos: any = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : { right: '24px', bottom: '100px' }
    return (
      <div id="yt-card" ref={cardRef} class={isEditMode ? 'edit-mode' : ''} style={{
        position: 'fixed', zIndex: '2147483647',
        background: 'rgba(17,17,17,.92)', color: '#fff', padding: '10px 12px', borderRadius: '10px',
        boxShadow: '0 2px 12px rgba(0,0,0,.4)', width: '300px', pointerEvents: 'auto', display,
        opacity: .85,
        cursor: 'move',
        ...stylePos
      }}>
        {/* 視覚フィードバック＆カーソル制御（ホバー時にわずかに持ち上げる） */}
        <style>{`
          #yt-card { transition: box-shadow .15s ease, transform .12s ease, background-color .15s ease, border-color .15s ease; }
          #yt-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,.55); background: rgba(22,22,22,.96) !important; }
          #yt-card:active { transform: translateY(0); }
          #yt-card.edit-mode { background: rgba(17,17,17,.96); border: 1px solid rgba(255,255,255,0.1); }
          #yt-card input, #yt-card textarea, #yt-card select { cursor: text; }
          #yt-card button, #yt-card a, #yt-dd-menu, #yt-card [contenteditable="true"] { cursor: auto; }
          #yt-card::after{ content:""; position:absolute; left: var(--arrow-x, 50%); transform: translateX(-50%) rotate(45deg); width:10px; height:10px; background:#111; border:1px solid #444; border-left:none; border-top:none; top: calc(100% * -1 - 6px); opacity: 0; }
          #yt-card.flip-y::after{ top:auto; bottom:-6px; transform: translateX(-50%) rotate(225deg); }
          .custom-buttons { 
            display: flex; 
            flex-wrap: wrap; 
            gap: 4px; 
            margin-top: 8px;
            width: 100%;
            border-radius: 6px;
            transition: all 0.15s ease;
          }
          .custom-button { 
            position: relative !important; 
            flex: 1 1 auto;
            min-width: 35px;
            max-width: 60px;
            padding: 4px 6px; 
            font-size: 11px; 
            background: #222; 
            color: #fff; 
            border: 1px solid #444; 
            border-radius: 4px; 
            cursor: pointer; 
            text-align: center; 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            transition: all 0.15s;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
          }
          /* コンパクトレイアウト - 3×2 */
          .custom-buttons.compact .custom-button {
            flex: 1 1 calc(33.33% - 3px);
            max-width: calc(33.33% - 3px);
          }
          .edit-mode .custom-button { 
            background: rgba(59, 130, 246, 0.15);
            border: 2px dashed rgba(147, 197, 253, 0.7);
            box-shadow: 0 0 6px rgba(59, 130, 246, 0.4);
            cursor: crosshair;
          }
          .edit-mode .custom-button:hover { 
            background: rgba(59, 130, 246, 0.25);
            transform: scale(1.05);
            border-color: rgba(147, 197, 253, 1);
          }
          .custom-button:hover { background: #333; }
          .custom-button:active { background: #444; }
          .custom-button-editor { 
            position: absolute; 
            bottom: 100%; 
            left: 50%; 
            transform: translateX(-50%) translateY(-8px);
            background: #ff6b35; 
            border: 2px solid rgba(147, 197, 253, 0.7);
            border-radius: 8px; 
            padding: 10px; 
            display: flex; 
            flex-direction: column; 
            gap: 8px; 
            z-index: 2147483647;
            min-width: 150px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          }
          .custom-button-editor::after {
            content: '';
            position: absolute;
            top: 100%;
            left: 50%;
            transform: translateX(-50%);
            border: 8px solid transparent;
            border-top-color: rgba(147, 197, 253, 0.7);
          }
          .custom-button-editor input { 
            background: #1a1a1a; 
            border: 1px solid #555; 
            color: #fff; 
            font-size: 12px; 
            padding: 6px 8px; 
            border-radius: 4px; 
            width: 100%; 
            box-sizing: border-box;
            outline: none;
          }
          .custom-button-editor input:focus {
            border-color: rgba(147, 197, 253, 0.7);
          }
          .custom-button-editor .label-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
          .custom-button-editor .label-field label {
            font-size: 10px;
            color: #999;
            text-transform: uppercase;
          }
          .custom-button-editor .editor-buttons { display: flex; gap: 6px; margin-top: 4px; }
          .custom-button-editor .editor-buttons button { 
            flex: 1; 
            font-size: 11px; 
            padding: 6px 8px; 
            background: #444; 
            border: 1px solid #666; 
            color: #fff; 
            cursor: pointer; 
            border-radius: 4px;
            transition: all 0.15s;
          }
          .custom-button-editor .editor-buttons button:hover { 
            background: #555; 
            transform: scale(1.02);
          }
          .custom-button-editor .editor-buttons .save { 
            background: rgba(59, 130, 246, 0.7); 
            border-color: rgba(147, 197, 253, 0.7);
          }
          .custom-button-editor .editor-buttons .save:hover { 
            background: rgba(59, 130, 246, 0.9); 
          }
          .custom-button-editor .editor-buttons .cancel { 
            background: #444; 
          }
          .edit-mode-btn { background: transparent; color: #bbb; border: 0; cursor: pointer; padding: 2px 4px; border-radius: 3px; transition: all 0.15s, visibility 0s; }
          .edit-mode-btn.active { background: rgba(255,255,255,0.1); color: #fff; }
        `}</style>
        {/* tools row (no title) */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:'6px' }}>
          <div style={{ marginLeft:'auto', display:'flex', gap:'6px' }}>
            <button 
              onClick={toggleEditMode} 
              title="Edit custom buttons" 
              class={`edit-mode-btn ${isEditMode ? 'active' : ''}`}
              style={{ 
                visibility: showCustomButtons ? 'visible' : 'hidden'
              }}
            >
              ✎
            </button>
            <button 
              onClick={toggleCustomButtons}
              title={showCustomButtons ? 'Hide custom buttons' : 'Show custom buttons'}
              class="edit-mode-btn"
            >
              {showCustomButtons ? '▲' : '▼'}
            </button>
            <button onClick={() => setShowHelp((v) => !v)} title="Help" style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>?</button>
            <button onClick={() => { const next = lang === 'en' ? 'ja' : 'en'; try { setString(Keys.Lang, next) } catch {}; setLang(next) }} title={lang === 'en' ? '日本語' : 'English'} style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>{lang === 'en' ? 'EN' : 'JA'}</button>
            <button onClick={() => api.close()} title="Close" style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        {showHelp && (
          <div class="help-text" style={{ fontSize: '11px', color: '#bbb', marginBottom: '6px', lineHeight: 1.5, cursor: 'text', userSelect: 'text', WebkitUserSelect: 'text' }}>
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
        {/* カスタムシークボタン - 3段目に配置 */}
        {showCustomButtons && (
          <div class={`custom-buttons ${isCompactLayout ? 'compact' : ''}`} style={{ marginTop: '8px' }}>
          {customButtons.map((button, displayIndex) => {
            return (
              <div 
                key={displayIndex} 
                class="custom-button" 
                style={{ position: 'relative' }}
                onClick={() => handleCustomButtonClick(button, displayIndex)}
                onMouseDown={(e: any) => e.stopPropagation()}
                title={isEditMode ? 'Click to edit' : `${button.seconds > 0 ? '+' : ''}${button.seconds}秒`}
              >
                {/* ボタン本体 - 常に表示 */}
                <div
                  ref={el => { buttonRefs.current[displayIndex] = el }}
                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
                >
                  {button.label}
                </div>
              </div>
            )
          })}
          {/* 新しいボタンを追加 - 編集モードのみ表示 */}
          {isEditMode && customButtons.length < 6 && (
            <div class="custom-button" style={{ opacity: 0.6, border: '1px dashed #666' }}>
              {editingButton !== null && loadCustomButtons().buttons[editingButton] && !loadCustomButtons().buttons[editingButton].enabled ? (
                // 新規追加の編集モード
                <div class="custom-button-editor" 
                  onMouseDown={(e: any) => e.stopPropagation()}
                  onKeyDown={(e: any) => {
                    e.stopPropagation()
                    e.preventDefault()
                    if (e.key === 'Enter') saveEditButton()
                    if (e.key === 'Escape') {
                      (e.currentTarget as HTMLInputElement)?.blur()
                      cancelEditButton()
                    }
                  }}
                  onKeyUp={(e: any) => { e.stopPropagation(); e.preventDefault() }}
                  onKeyPress={(e: any) => { e.stopPropagation(); e.preventDefault() }}
                >
                  <div class="label-field">
                    <label>Label (4 chars max)</label>
                    <input
                      type="text"
                      value={editingValues.label}
                      onInput={(e: any) => setEditingValues(prev => ({ ...prev, label: e.currentTarget.value }))}
                      placeholder="e.g. +30"
                      maxLength={4}
                      autoFocus
                    />
                  </div>
                  <div class="label-field">
                    <label>Seconds to seek</label>
                    <input
                      type="number"
                      value={editingValues.seconds}
                      onInput={(e: any) => setEditingValues(prev => ({ ...prev, seconds: e.currentTarget.value }))}
                      placeholder="e.g. 30 or -30"
                    />
                  </div>
                  <div class="editor-buttons">
                    <button class="save" onClick={saveEditButton}>Save</button>
                    <button class="cancel" onClick={cancelEditButton}>Cancel</button>
                  </div>
                </div>
              ) : (
                // 新規追加ボタン
                <div
                  onClick={addNewButton}
                  onMouseDown={(e: any) => e.stopPropagation()}
                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title="Add new button"
                >
                  +
                </div>
              )}
            </div>
          )}
          </div>
        )}
        {/* footer helper text removed; use ? button for help */}
        
        {/* ポータル経由の編集ポップアップ */}
        <EditPopupPortal 
          anchorEl={buttonRefs.current[editingButton ?? -1] || null}
          open={editingButton !== null}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>Label (4 chars max)</label>
            <input
              type="text"
              value={editingValues.label}
              onInput={(e: any) => setEditingValues(prev => ({ ...prev, label: e.currentTarget.value }))}
              placeholder="e.g. +30"
              maxLength={4}
              autoFocus
              style={{
                background: '#1a1a1a',
                border: '1px solid #555',
                color: '#fff',
                fontSize: '12px',
                padding: '6px 8px',
                borderRadius: '4px',
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              onKeyDown={(e: any) => {
                e.stopPropagation()
                if (e.key === 'Enter') saveEditButton()
                if (e.key === 'Escape') {
                  (e.currentTarget as HTMLInputElement)?.blur()
                  cancelEditButton()
                }
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>Seconds to seek</label>
            <input
              type="number"
              value={editingValues.seconds}
              onInput={(e: any) => setEditingValues(prev => ({ ...prev, seconds: e.currentTarget.value }))}
              placeholder="e.g. 30 or -30"
              style={{
                background: '#1a1a1a',
                border: '1px solid #555',
                color: '#fff',
                fontSize: '12px',
                padding: '6px 8px',
                borderRadius: '4px',
                width: '100%',
                boxSizing: 'border-box',
                outline: 'none'
              }}
              onKeyDown={(e: any) => {
                e.stopPropagation()
                if (e.key === 'Enter') saveEditButton()
                if (e.key === 'Escape') {
                  (e.currentTarget as HTMLInputElement)?.blur()
                  cancelEditButton()
                }
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
            <button 
              onClick={saveEditButton}
              style={{
                flex: '1',
                fontSize: '11px',
                padding: '6px 8px',
                background: '#444',
                border: '1px solid #666',
                color: '#fff',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s'
              }}
            >Save</button>
            <button 
              onClick={cancelEditButton}
              style={{
                flex: '1',
                fontSize: '11px',
                padding: '6px 8px',
                background: '#444',
                border: '1px solid #666',
                color: '#fff',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.15s'
              }}
            >Cancel</button>
          </div>
        </EditPopupPortal>
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
