/**
 * Card drag handling with chat interference prevention
 */
import { useEffect } from 'preact/hooks'
import type { Position } from './useCardPosition'

export function useDragHandling(
  cardRef: any,
  posRef: any,
  setPos: (pos: Position | ((prev: Position | null) => Position | null)) => void,
  savePos: (pos: Position) => void
) {
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
    
    return () => { 
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
}