import { createPortal } from 'preact/compat'
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks'

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
    const interval = setInterval(updatePosition, 1000)

    return () => {
      window.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
      clearInterval(interval)
    }
  }, [anchor, offsetY])

  return pos
}

export function EditPopupPortal({ anchorEl, open, children }: {
  anchorEl: HTMLElement | null;
  open: boolean;
  children: preact.ComponentChildren;
}) {
  const portalRootRef = useRef<HTMLElement | null>(null)

  if (!portalRootRef.current && open) {
    const root = document.createElement('div')
    root.id = 'yt-longseek-portal-root'
    root.style.position = 'fixed'
    root.style.inset = '0 auto auto 0'
    root.style.zIndex = '2147483647'
    root.style.pointerEvents = 'none'
    document.body.appendChild(root)
    portalRootRef.current = root
  }

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
        pointerEvents: 'auto',
        background: 'rgba(17,17,17,0.95)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        borderRadius: '8px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        zIndex: 1,
        minWidth: '180px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      }}
    >
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

