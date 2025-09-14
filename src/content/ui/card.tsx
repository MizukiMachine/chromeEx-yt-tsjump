import { render, h } from 'preact'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks'
import { PRESET_ZONES, DEFAULT_ZONE } from '../core/timezone'
import { t, getLang, formatSeconds } from '../utils/i18n'
import { jumpToLocalTimeHybrid } from '../core/jump'
import { getString, setString, getJSON, addTZMru, Keys, getBool, setBool } from '../store/local'
import { clampRectToViewport, clampRectToBounds } from '../utils/layout'
import { loadCustomButtons, loadCustomButtonsAsync, getEnabledButtons, saveCustomButtons, validateLabel, validateSeconds, clearLegacyStorage } from '../store/customButtons'
import { seekBySeconds } from '../core/seek'
import { isAdActive } from '../core/adsense'
import { showToast } from './toast'
import { useCardPosition } from './hooks/useCardPosition'
import { useDragHandling } from './hooks/useDragHandling'
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
    const [editingButton, setEditingButton] = useState<number | null>(null)
    const [editingValues, setEditingValues] = useState<{ label: string; seconds: string }>({ label: '', seconds: '' })
    
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
    // レイアウト状態：null = 未確定（非表示）, false = 6×1, true = 3×2
    const [isCompactLayout, setIsCompactLayout] = useState<boolean | null>(null)
    // 初期表示状態は localStorage から復元（既定は非表示）
    const [showCustomButtons, setShowCustomButtons] = useState(() => getBool(Keys.CardCustomOpen))
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

    // 位置は useCardPosition に集約
    useEffect(() => {
      if (showCustomButtons && isCompactLayout !== null) {
        determineButtonLayout()
      }
    }, [showCustomButtons, isCompactLayout])
    
    const measureRowWidthViaGhost = (container: HTMLElement, gap = 4): number => {
      const root = container.getRootNode() as Document | ShadowRoot
      const ghost = document.createElement('div')
      ghost.style.cssText = [
        'position:absolute','visibility:hidden','left:-99999px','top:0',
        'display:flex','flex-wrap:nowrap',`gap:${gap}px`
      ].join(';')
      
      // Shadow DOMの場合はshadowRootに、通常のDOMの場合はdocumentに追加
      if (root instanceof ShadowRoot) {
        root.appendChild(ghost)
      } else {
        document.body.appendChild(ghost)
      }

      const buttons = Array.from(container.querySelectorAll<HTMLElement>('.custom-button'))
      buttons.forEach(btn => {
        const clone = btn.cloneNode(true) as HTMLElement
        clone.style.flex = '0 0 auto'
        clone.style.width = 'auto'
        clone.style.maxWidth = 'none'
        const label = clone.querySelector('.label') as HTMLElement | null
        if (label) label.style.whiteSpace = 'nowrap'
        ghost.appendChild(clone)
      })

      const width = Math.ceil(ghost.getBoundingClientRect().width)
      ghost.remove()
      return width
    }

    // カスタムボタンのレイアウト決定（Ghost DOM計測方式）
    const determineButtonLayout = () => {
      console.log('determineButtonLayout called!')
      const customButtonsContainer = cardRef.current?.querySelector('.custom-buttons')
      if (!customButtonsContainer) {
        console.log('No custom buttons container found')
        setIsCompactLayout(false)
        return
      }
      
      const container = customButtonsContainer as HTMLElement
      const buttons = container.querySelectorAll('.custom-button')
      
      // 6個未満の場合は常に1行表示
      if (buttons.length < 6) {
        setIsCompactLayout(false)
        return
      }
      
      // Ghost DOM方式で自然幅を測定
      const neededRowWidth = measureRowWidthViaGhost(container, 4)
      const containerWidth = Math.floor(container.getBoundingClientRect().width)

      // 個別ボタンの文字数チェック（10文字以上で早期移行）
      const buttonLabels = Array.from(buttons).map(btn => btn.textContent || '')
      const hasLongLabel = buttonLabels.some(label => label.length >= 10)

      // 判定（余裕をもって早めに3×2に移行）
      const SAFETY_MARGIN = 8 // 8px の安全マージン
      const exceedsWidth = neededRowWidth > containerWidth - SAFETY_MARGIN
      const needsCompact = hasLongLabel || exceedsWidth

      console.log('Layout calculation (ghost DOM method):', {
        neededRowWidth,
        containerWidth,
        buttonCount: buttons.length,
        needsCompact,
        hasLongLabel,
        exceedsWidth,
        safetyMargin: SAFETY_MARGIN,
        availableWidth: containerWidth - SAFETY_MARGIN,
        buttonLabels,
        longLabels: buttonLabels.filter(label => label.length >= 10)
      })
      
      setIsCompactLayout(needsCompact)
    }
    
    // 初期状態は localStorage の値を採用するため、強制非表示の初期化は廃止

    // カスタムボタン表示時の初期レイアウト決定（描画前に実行）
    useLayoutEffect(() => {
      if (!showCustomButtons) {
        setIsCompactLayout(null) // 非表示時は未確定状態に
        return
      }
      
      // ChatGPT推奨：rAFは不要、useLayoutEffect内で直接実行
      determineButtonLayout()
    }, [showCustomButtons, customButtons])

    // リサイズやボタン変更時のレイアウト再計算
    useEffect(() => {
      if (showCustomButtons && isCompactLayout !== null) {
        // ResizeObserverでコンテナサイズ変化を監視
        const container = cardRef.current?.querySelector('.custom-buttons')
        if (!container) return
        
        const resizeObserver = new ResizeObserver(() => {
          determineButtonLayout()
        })
        
        resizeObserver.observe(container as Element)
        return () => resizeObserver.disconnect()
      }
    }, [showCustomButtons, customButtons, isEditMode])

    // optionsページからのTZ初期リスト（chrome.storage.local）を一度読み込み
    useEffect(() => {
      try {
        const anyChrome = (globalThis as any).chrome
        if (!anyChrome?.storage?.local) return
        anyChrome.storage.local.get(['tz:enabled'], (res: any) => {
          const arr = res?.['tz:enabled']
          if (Array.isArray(arr) && arr.length > 0) {
            const uniq = Array.from(new Set(arr.filter((x) => typeof x === 'string' && x)))
            if (uniq.length > 0) {
              setPresets(uniq)
              // 現在選択中のゾーンが無効化されていたら DEFAULT_ZONE にフォールバック
              const cur = zone
              if (!uniq.includes(cur)) {
                setZone(DEFAULT_ZONE)
                try { setString(Keys.TzCurrent, DEFAULT_ZONE) } catch {}
              }
            }
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
      
      // 実際のボタン配列でのインデックスも一緒に保存
      loadCustomButtonsAsync().then(config => {
        // 表示中のボタンに対応する全体配列でのインデックスを見つける
        let actualIndex = -1
        let enabledCount = 0
        
        for (let i = 0; i < config.buttons.length; i++) {
          if (config.buttons[i].enabled && config.buttons[i].label.trim() !== '') {
            if (enabledCount === displayIndex) {
              actualIndex = i
              break
            }
            enabledCount++
          }
        }
        
        if (actualIndex !== -1) {
          setEditingButton(actualIndex) // 実際のインデックスを使用
          setEditingValues({
            label: button.label,
            seconds: button.seconds.toString()
          })
        }
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
      try { setBool(Keys.CardCustomOpen, newState) } catch {}
      
      // 編集モードも一緒に閉じる
      if (!newState && isEditMode) {
        setIsEditMode(false)
        setEditingButton(null)
        setEditingValues({ label: '', seconds: '' })
      }
      
      // useLayoutEffectが自動的にレイアウトを処理するため、手動チェック不要
      // 状態は localStorage に保存済み
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
      
      // 最新の設定を非同期で取得してボタンを更新
      loadCustomButtonsAsync().then(config => {
        const newButtons = [...config.buttons]
        
        // editingButtonは既に実際のインデックスなので直接使用
        if (editingButton >= 0 && editingButton < newButtons.length) {
          newButtons[editingButton] = {
            label: editingValues.label,
            seconds: secondsValue,
            enabled: editingValues.label.trim() !== ''
          }
          
          saveCustomButtons({ buttons: newButtons })
          setCustomButtons(getEnabledButtons({ buttons: newButtons }))
          setEditingButton(null)
          setEditingValues({ label: '', seconds: '' })
          showToast(t('toast.button_updated'), 'info')
        } else {
          showToast(t('toast.button_not_found'), 'warn')
        }
      }).catch(() => {
        showToast(t('toast.failed_update'), 'warn')
      })
    }

    const cancelEditButton = () => {
      setEditingButton(null)
      setEditingValues({ label: '', seconds: '' })
    }

    const addNewButton = () => {
      if (!isEditMode) return // 編集モードでない場合は何もしない
      
      loadCustomButtonsAsync().then(config => {
        const firstEmptyIndex = config.buttons.findIndex(btn => !btn.enabled || btn.label.trim() === '')
        
        if (firstEmptyIndex === -1) {
          showToast('Maximum 6 buttons allowed', 'warn')
          return
        }
        
        // 新規ボタンの場合は特別な処理が必要
        setEditingButton(customButtons.length) // 表示中のボタンの後に追加
        setEditingValues({ label: '', seconds: '60' })
      }).catch(() => {
        showToast('Failed to add new button', 'warn')
      })
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

    // 保存は useCardPosition に移譲（セッション内のみ）

    // ドラッグは共通フックで処理
    useDragHandling(cardRef, posRef, setPos, savePos)

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
        showToast(r.reason || 'Hybrid system not ready. Try moving to live edge.', 'warn')
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
          <div class="help-text" style={{ fontSize: '11px', color: '#bbb', marginBottom: '6px', lineHeight: 1.5, cursor: 'text', userSelect: 'text', WebkitUserSelect: 'text' }}>
            {t('ui.help_text').split('\n').map((line) => (<>
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
            placeholder={t('ui.placeholder_time')}
            spellcheck={false}
            style={{ flex:'1 1 auto', minWidth:0, padding: '6px 8px', borderRadius: '6px', border: '1px solid #444', background: '#111', color: '#fff', outline: 'none', boxSizing: 'border-box' }}
            />
            <button type="submit" style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #444', background: 'rgba(17,17,17,.92)', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', flex: '0 0 auto' }}>{t('ui.jump_button')}</button>
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
                      onInput={(e: any) => setEditingValues(prev => ({ ...prev, label: e.currentTarget.value }))}
                      placeholder={t('popup.label_ph')}
                      maxLength={12}
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
              onInput={(e: any) => setEditingValues(prev => ({ ...prev, label: e.currentTarget.value }))}
              placeholder={t('popup.label_ph')}
              maxLength={12}
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
