import { render, h } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PRESET_ZONES, DEFAULT_ZONE } from '../core/timezone'
import { t, getLang, formatSeconds } from '../utils/i18n'
import { isDisplayableZone } from '../utils/timezoneLabel'
import { jumpToLocalTimeHybrid } from '../core/jump'
import { getString, setString, getJSON, addTZMru, Keys, getBool } from '../store/local'
import { clampRectToViewport, clampRectToBounds } from '../utils/layout'
import { loadCustomButtons, loadCustomButtonsAsync, getEnabledButtons, clearLegacyStorage } from '../store/customButtons'
import { seekBySeconds } from '../core/seek'
import { isAdActive } from '../core/adsense'
import { showToast } from './toast'
import { useCardPosition } from './hooks/useCardPosition'
import { useDragHandling } from './hooks/useDragHandling'
import useCustomButtonsLayout from './hooks/useCustomButtonsLayout'
import useCustomButtonsEditor from './hooks/useCustomButtonsEditor'
// シンプル化のため、startEpoch検知やレイテンシ手動キャリブは撤去

// ストレージキー
const KEY_OPEN = Keys.CardOpen

// カスタムボタンレイアウト計算用定数（実際のボタン幅測定に変更したため閾値は不使用）
// const BTN_MIN_WIDTH = 35  // ボタン最小幅（px）
// const BTN_GAP = 4         // ボタン間ギャップ（px）
// const BTN_COUNT = 6       // ボタン数

type GetVideo = () => HTMLVideoElement | null

// Extracted lightweight portal component
import { EditPopupPortal } from './components/EditPopupPortal'
import { TZDropdown } from './components/TZDropdown'
import { CustomButtons as CustomButtonsList } from './components/CustomButtons'

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
    const { pos, setPos, posRef, savePos, calculateInitialPosition } = useCardPosition(getVideo, open)
    const [showHelp, setShowHelp] = useState(false)
    const [lang, setLang] = useState(getLang())
    const [zonesOpen, setZonesOpen] = useState(false)
    const [presets, setPresets] = useState<string[]>(PRESET_ZONES)
    const zonesBtnRef = useRef<HTMLButtonElement>(null)
    const cardRef = useRef<HTMLDivElement>(null)
    // カスタムボタン設定
    const [customButtons, setCustomButtons] = useState(() => getEnabledButtons(loadCustomButtons()))
    const [isEditMode, setIsEditMode] = useState(false)
    
    // カスタムボタン設定の非同期読み込み
    useEffect(() => {
      // 古いlocalStorage設定をクリア（マイグレーション）
      clearLegacyStorage()
      
      loadCustomButtonsAsync().then(config => {
        setCustomButtons(getEnabledButtons(config))
      }).catch(() => {
        // エラー時はデフォルト設定を使用
        setCustomButtons(getEnabledButtons(loadCustomButtons()))
      })
    }, [])
    // 初期表示状態は localStorage から復元（既定は非表示）
    const [showCustomButtons, setShowCustomButtons] = useState(() => getBool(Keys.CardCustomOpen))
    // レイアウト状態は専用フックに委譲（null = 非表示時、false = 6×1, true = 3×2）
    const isCompactLayout = useCustomButtonsLayout(cardRef, showCustomButtons, [customButtons], isEditMode)
    // ポータル用のボタン要素参照
    const buttonRefs = useRef<(HTMLElement | null)[]>([])
    // 編集ロジック（保存/追加/キャンセル）を専用フックへ委譲
    const {
      editingButton,
      editingValues,
      setEditingValues,
      startEditButton,
      toggleEditMode,
      toggleCustomButtons,
      saveEditButton,
      cancelEditButton,
      addNewButton,
      resetEditing,
    } = useCustomButtonsEditor({
      isEditMode,
      setIsEditMode,
      customButtons,
      setCustomButtons,
      showCustomButtons,
      setShowCustomButtons,
    })
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
          const p = calculateInitialPosition()
          if (p) setPos(p)
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
        resetEditing()
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

    // 位置は useCardPosition に集約（レイアウト計算は専用フックに委譲）
    // 初期状態は localStorage の値を採用（レイアウトはフックが決定）

    const refreshEnabledZones = useCallback(() => {
      try {
        const anyChrome = (globalThis as any).chrome
        if (!anyChrome?.storage?.local) {
          setPresets(PRESET_ZONES.filter(isDisplayableZone))
          return
        }
        anyChrome.storage.local.get(['tz:enabled'], (res: any) => {
          const arr = res?.['tz:enabled']
          if (Array.isArray(arr) && arr.length > 0) {
            const uniq = Array.from(new Set(arr.filter((x) => typeof x === 'string' && x)))
            const filtered = uniq.filter(isDisplayableZone)
            if (filtered.length > 0) {
              setPresets(filtered)
              setZone((current) => {
                if (filtered.includes(current)) return current
                try { setString(Keys.TzCurrent, DEFAULT_ZONE) } catch {}
                return DEFAULT_ZONE
              })
              return
            }
          }
          const fallback = PRESET_ZONES.filter(isDisplayableZone)
          setPresets(fallback)
          setZone((current) => {
            if (fallback.includes(current)) return current
            try { setString(Keys.TzCurrent, DEFAULT_ZONE) } catch {}
            return DEFAULT_ZONE
          })
        })
      } catch {
        const fallback = PRESET_ZONES.filter(isDisplayableZone)
        setPresets(fallback)
        setZone((current) => {
          if (fallback.includes(current)) return current
          try { setString(Keys.TzCurrent, DEFAULT_ZONE) } catch {}
          return DEFAULT_ZONE
        })
      }
    }, [setPresets, setZone])

    useEffect(() => {
      refreshEnabledZones()
    }, [refreshEnabledZones])

    useEffect(() => {
      const handler = (message: any) => {
        if (message && message.type === 'OPTIONS_TZ_UPDATED') {
          refreshEnabledZones()
        }
      }
      try { chrome.runtime?.onMessage?.addListener(handler) } catch {}
      return () => { try { chrome.runtime?.onMessage?.removeListener(handler) } catch {} }
    }, [refreshEnabledZones])

    // （編集ロジックはフックへ移譲済み）

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

    // 保存は useCardPosition に移譲（セッション内のみ）

    // ドラッグは共通フックで処理
    useDragHandling(cardRef, posRef, setPos, savePos)

    // オプションページを開く
    function openOptions() {
      try {
        const anyChrome: any = (globalThis as any).chrome
        // Prefer asking background to open options (more reliable across contexts)
        anyChrome?.runtime?.sendMessage?.({ type: 'OPEN_OPTIONS' }, (res: any) => {
          const ok = res && res.received
          if (!ok) {
            try {
              if (anyChrome?.runtime?.openOptionsPage) { anyChrome.runtime.openOptionsPage(); return }
              if (anyChrome?.runtime?.getURL) {
                const url = anyChrome.runtime.getURL('public/options.html')
                window.open(url, '_blank'); return
              }
            } catch {}
          }
        })
      } catch (e) {
        try { showToast('Failed to open Options', 'warn') } catch {}
      }
    }

    // 提交
    async function onSubmit(e?: Event) {
      e?.preventDefault()
      const v = getVideo()
      if (!v) {
        return
      }
      // ハイブリッドシステムのみを使用
      const r = jumpToLocalTimeHybrid(v, input.trim(), zone)
      if (!r.ok) {
        console.warn('[Card] Hybrid jump failed:', r.reason)
        showToast(r.reason || t('toast.hybrid_not_ready'), 'warn')
      }
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
          showToast(t('toast.ad_paused'), 'warn')
          return
        }
        
        const result = seekBySeconds(v, button.seconds)
        
        // クランプが発生した場合はトースト通知
        if (result.clamped) {
          showToast(t('toast.clamped'), 'info')
        }
      }
    }

    // 表示
    const display = open ? '' : 'none'
    const stylePos: any = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' } : { right: '24px', bottom: '100px' }
    return (
      <div id="yt-card" ref={cardRef} class={isEditMode ? 'edit-mode' : ''} style={{
        position: 'fixed', zIndex: '2147483647',
        background: 'rgba(17,17,17,.92)', color: '#fff', padding: '12px 14px', borderRadius: '10px',
        boxShadow: '0 2px 12px rgba(0,0,0,.4)', width: '320px', pointerEvents: 'auto', display,
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
            display: grid;
            gap: 4px;
            margin-top: 8px;
            width: 100%;
            border-radius: 6px;
            transition: all 0.15s ease;
            /* 明示して事故を防ぐ */
            grid-auto-flow: row;
          }

          /* 計測専用モード。画面には出さない */
          .custom-buttons[data-measure="1"] {
            position: absolute !important;
            visibility: hidden !important;
            left: -99999px !important; 
            top: 0 !important;
            display: inline-flex !important;   /* Gridを外す */
            flex-wrap: nowrap !important;      /* 1行で並べる */
            gap: 4px !important;
            grid-template-columns: none !important; /* Grid設定を完全に無効化 */
            grid-template-rows: none !important;
          }
          .custom-buttons[data-measure="1"] .custom-button {
            flex: 0 0 auto !important;         /* 伸び縮み禁止 */
            width: auto !important;            /* 自然幅で測る（重要） */
            max-width: none !important;
            min-width: auto !important;
          }

          /* 6×1（列=ボタン数<=6） */
          .custom-buttons.row,
          .custom-buttons[data-layout="row"] {
            grid-template-columns: repeat(var(--cols, 6), 1fr);
            grid-auto-rows: auto;
          }

          /* 3×2 固定 */
          .custom-buttons.compact,
          .custom-buttons[data-layout="grid"] {
            grid-template-columns: repeat(3, 1fr);
            grid-auto-rows: auto;
          }

          .custom-button { 
            position: relative !important; 
            min-width: 35px;
            padding: 6px 10px; 
            font-size: 14px; 
            background: #222; 
            color: #fff; 
            border: 1px solid #444; 
            border-radius: 6px; 
            cursor: pointer; 
            text-align: center; 
            white-space: nowrap; 
            overflow: hidden; 
            text-overflow: ellipsis; 
            transition: all 0.15s;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
            /* Grid/Flex両対応の保険 */
            min-width: 0;
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
              title={t('tooltip.edit_buttons')} 
              class={`edit-mode-btn ${isEditMode ? 'active' : ''}`}
              style={{ 
                visibility: showCustomButtons ? 'visible' : 'hidden'
              }}
            >
              ✎
            </button>
            <button 
              onClick={toggleCustomButtons}
              title={showCustomButtons ? t('tooltip.hide_buttons') : t('tooltip.show_buttons')}
              class="edit-mode-btn"
            >
              {showCustomButtons ? '▲' : '▼'}
            </button>
            <button onClick={() => setShowHelp((v) => !v)} title={t('tooltip.help')} style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>?</button>
            <button onClick={() => { const next = lang === 'en' ? 'ja' : 'en'; try { setString(Keys.Lang, next) } catch {}; setLang(next) }} title={lang === 'en' ? t('options.lang_ja') : t('options.lang_en')} style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>{lang === 'en' ? 'EN' : 'JA'}</button>
            <button onClick={() => api.close()} title={t('tooltip.close')} style={{ background: 'transparent', color: '#bbb', border: 0, cursor: 'pointer' }}>×</button>
          </div>
        </div>
        {showHelp && (
          <div class="help-text" style={{ fontSize: '11px', color: '#bbb', marginBottom: '6px', lineHeight: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              class="btn"
              onClick={(e: any) => { e.stopPropagation(); openOptions(); }}
              style={{ background:'#212121', color:'#ddd', border:'1px solid #444', borderRadius:'6px', padding:'4px 8px', cursor:'pointer' }}
              title={t('ui.open_options')}
            >{t('ui.open_options')}</button>
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
              height: 32px; /* fixed for consistent card height across locales */
              text-align: left;
              background:#111;
              color:#fff;
              border:1px solid #444;
              border-radius:6px;
              padding:0 30px 0 8px; /* space for caret */
              cursor:pointer;
              font-size:14px;
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
            placeholder={t('ui.placeholder_time')}
            spellcheck={false}
            style={{ flex:'1 1 auto', minWidth:0, padding: '6px 8px', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#fff', outline: 'none', boxSizing: 'border-box', height: '32px', fontSize: '14px' }}
            />
            <button type="submit" style={{ padding: '0 12px', height: '32px', borderRadius: '6px', border: '1px solid #444', background: 'rgba(17,17,17,.92)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto', fontSize: '14px' }}>{t('ui.jump_button')}</button>
          </div>
          {/* TZ selector (small line, text smaller than main) */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', alignItems: 'center', width: '100%' }}>
            <TZDropdown 
              zone={zone}
              mru={mru}
              others={others}
              lang={lang as any}
              open={zonesOpen}
              onToggle={() => setZonesOpen(v => !v)}
              onSelect={(z) => { setZone(z); setZonesOpen(false) }}
              buttonRef={(el) => { zonesBtnRef.current = el }}
            />
          </div>
        </form>
        {/* カスタムシークボタン - 3段目に配置 */}
        {showCustomButtons && (
          <>
          <CustomButtonsList
            buttons={customButtons}
            isCompactLayout={isCompactLayout}
            isEditMode={isEditMode}
            onClick={(displayIndex) => handleCustomButtonClick(customButtons[displayIndex], displayIndex)}
            setButtonRef={(i, el) => { buttonRefs.current[i] = el }}
            titleFor={(btn) => isEditMode ? t('tooltip.click_edit') : formatSeconds(btn.seconds)}
          />
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
                    <label>{t('popup.label_with_max')}</label>
                    <input
                      type="text"
                      value={editingValues.label}
                      onInput={(e: any) => {
                        const raw = e.currentTarget.value as string
                        const cleaned = raw.replace(/[^A-Za-z0-9+\-]/g, '').slice(0, 12)
                        if (cleaned !== raw) e.currentTarget.value = cleaned
                        setEditingValues(prev => ({ ...prev, label: cleaned }))
                      }}
                      placeholder={t('popup.label_ph')}
                      maxLength={12}
                      pattern="[A-Za-z0-9+\-]{0,12}"
                      autoFocus
                    />
                  </div>
                  <div class="label-field">
                    <label>{t('popup.seconds_to_seek')}</label>
                    <input
                      type="number"
                      value={editingValues.seconds}
                      onInput={(e: any) => setEditingValues(prev => ({ ...prev, seconds: e.currentTarget.value }))}
                      placeholder={t('popup.seconds_ph')}
                    />
                  </div>
                  <div class="editor-buttons">
                    <button class="save" onClick={saveEditButton}>{t('popup.save')}</button>
                    <button class="cancel" onClick={cancelEditButton}>{t('popup.cancel')}</button>
                  </div>
                </div>
              ) : (
                // 新規追加ボタン
                <div
                  onClick={addNewButton}
                  onMouseDown={(e: any) => e.stopPropagation()}
                  style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title={t('tooltip.add_button')}
                >
                  +
                </div>
              )}
            </div>
          )}
          </>
        )}
        {/* footer helper text removed; use ? button for help */}
        
        {/* ポータル経由の編集ポップアップ */}
        <EditPopupPortal 
          anchorEl={buttonRefs.current[editingButton ?? -1] || null}
          open={editingButton !== null}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>{t('popup.label_with_max')}</label>
            <input
              type="text"
              value={editingValues.label}
              onInput={(e: any) => {
                const raw = e.currentTarget.value as string
                const cleaned = raw.replace(/[^A-Za-z0-9+\-]/g, '').slice(0, 12)
                if (cleaned !== raw) e.currentTarget.value = cleaned
                setEditingValues(prev => ({ ...prev, label: cleaned }))
              }}
              placeholder={t('popup.label_ph')}
              maxLength={12}
              pattern="[A-Za-z0-9+\-]{0,12}"
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
            <label style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase' }}>{t('popup.seconds_to_seek')}</label>
            <input
              type="number"
              value={editingValues.seconds}
              onInput={(e: any) => setEditingValues(prev => ({ ...prev, seconds: e.currentTarget.value }))}
              placeholder={t('popup.seconds_ph')}
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
            >{t('popup.save')}</button>
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
            >{t('popup.cancel')}</button>
          </div>
        </EditPopupPortal>
      </div>
    )
  }

  render(h(App, {}), host)

  return api
}

// ---- helpers ----
// 余剰となったタイムゾーン表示ヘルパーは TZDropdown 内に集約
