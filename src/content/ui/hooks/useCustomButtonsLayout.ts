import { useEffect, useLayoutEffect, useState } from 'preact/hooks'
import type { RefObject } from 'preact'

/**
 * カスタムボタンのレイアウト（6×1 ↔ 3×2）を自動判定するフック
 * - Shadow DOM 上の実測（Ghost DOMクローン）で自然幅を計測
 * - ResizeObserver でコンテナ幅変化に追従
 * - 表示OFF時は `null` を返し、表示ON時に `false`(row) or `true`(compact) を返す
 */
export function useCustomButtonsLayout(
  cardRef: RefObject<HTMLDivElement>,
  showCustomButtons: boolean,
  customButtonsDeps: unknown[], // レイアウトに影響する依存配列（ボタンの内容など）
  isEditMode: boolean,
): boolean | null {
  const [isCompactLayout, setIsCompactLayout] = useState<boolean | null>(null)

  const measureRowWidthViaGhost = (container: HTMLElement, gap = 4): number => {
    const root = container.getRootNode() as Document | ShadowRoot
    const ghost = document.createElement('div')
    ghost.style.cssText = [
      'position:absolute','visibility:hidden','left:-99999px','top:0',
      'display:flex','flex-wrap:nowrap',`gap:${gap}px`
    ].join(';')

    // Shadow DOMの場合はshadowRootに、通常のDOMの場合はdocumentに追加
    if (root instanceof ShadowRoot) {
      (root as ShadowRoot).appendChild(ghost)
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

  const determineButtonLayout = () => {
    const customButtonsContainer = cardRef.current?.querySelector('.custom-buttons')
    if (!customButtonsContainer) {
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

    setIsCompactLayout(needsCompact)
  }

  // 表示切替時の初期化と即時計測
  useLayoutEffect(() => {
    if (!showCustomButtons) {
      setIsCompactLayout(null)
      return
    }
    determineButtonLayout()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCustomButtons, ...customButtonsDeps])

  // リサイズやボタン変更時のレイアウト再計算（表示中のみ）
  useEffect(() => {
    if (!showCustomButtons || isCompactLayout === null) return
    const container = cardRef.current?.querySelector('.custom-buttons')
    if (!container) return

    const resizeObserver = new ResizeObserver(() => {
      determineButtonLayout()
    })
    resizeObserver.observe(container as Element)
    return () => resizeObserver.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCustomButtons, isCompactLayout, isEditMode, ...customButtonsDeps])

  return isCompactLayout
}

export default useCustomButtonsLayout
