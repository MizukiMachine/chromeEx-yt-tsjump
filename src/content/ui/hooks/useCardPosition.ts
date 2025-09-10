/**
 * Card positioning and viewport clamping logic
 */
import { useState, useEffect, useRef } from 'preact/hooks'
import { clampRectToViewport, clampRectToBounds } from '../../utils/layout'

export type Position = { x: number; y: number }

export function useCardPosition(getVideo: () => HTMLVideoElement | null, open: boolean) {
  const [pos, setPos] = useState<Position | null>(null)
  const posRef = useRef<Position | null>(pos)
  
  useEffect(() => { 
    posRef.current = pos 
  }, [pos])

  // リサイズ時のクランプ処理
  useEffect(() => {
    const onResize = () => {
      setPos((p) => {
        if (!p) return p
        const w = 300 // CARD_W
        const h = 160 // CARD_H
        // 常にビューポート内にクランプ（ブラウザリサイズでアクセス不可を防ぐ）
        const clamped = clampRectToViewport(p, w, h, window.innerWidth, window.innerHeight)
        if (clamped.x !== p.x || clamped.y !== p.y) { 
          savePos(clamped) 
        }
        return clamped
      })
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('fullscreenchange', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => { 
      window.removeEventListener('resize', onResize)
      document.removeEventListener('fullscreenchange', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [open])

  const savePos = (_p: Position) => { 
    /* session-only: do not persist across reload */ 
  }

  const isOutOfBounds = (pos: Position): boolean => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const CARD_W = 300, CARD_H = 160
    return (
      pos.x < 0 || 
      pos.y < 0 || 
      pos.x + CARD_W > vw || 
      pos.y + CARD_H > vh
    )
  }

  const calculateInitialPosition = (): Position | null => {
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
        
        return { x, y }
      }
    } catch {}
    return null
  }

  return {
    pos,
    setPos,
    posRef,
    savePos,
    isOutOfBounds,
    calculateInitialPosition
  }
}