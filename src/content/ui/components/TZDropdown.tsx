// Using automatic JSX runtime with preact; explicit h import not needed
import { getOffsetMinutesNow, formatOffsetHM, displayNameForZone } from '../../core/timezone'
import { formatTimeZoneLabel } from '../../utils/timezoneLabel'

export function TZDropdown(props: {
  zone: string
  mru: string[]
  others: string[]
  lang: 'en'|'ja'
  open: boolean
  onToggle: () => void
  onSelect: (z: string) => void
  buttonRef?: (el: HTMLButtonElement | null) => void
}) {
  const { zone, mru, others, lang, open, onToggle, onSelect, buttonRef } = props

  const labelTZ = (z: string): string => {
    const base = formatTimeZoneLabel(z, lang)
    const off = formatOffsetHM(getOffsetMinutesNow(z))
    return `${base} (${off})`
  }

  const labelTZName = (z: string): string => {
    const label = formatTimeZoneLabel(z, lang)
    if (label === z) {
      return displayNameForZone(z)
    }
    return label
  }

  const labelTZOff = (z: string): string => {
    try { return formatOffsetHM(getOffsetMinutesNow(z)) } catch { return '+00:00' }
  }

  return (
    <div class="yt-dd" style={{ flex:'1 1 auto', minWidth:0 }}>
      <button ref={buttonRef as any} type="button" class="yt-dd-btn" style={{ fontSize:'14px' }} onClick={onToggle}>{labelTZ(zone)}</button>
      {open && (
        <div class="yt-dd-menu" onMouseDown={(e: any) => e.stopPropagation()}>
          {mru.length > 0 && <div class="yt-dd-group">{lang === 'ja' ? '最近使用したもの' : 'Recent'}</div>}
          {mru.map((z) => (
            <div class="yt-dd-item" onClick={() => onSelect(z)}>
              <div class="yt-dd-item-row"><span>{labelTZName(z)}</span><span class="badge">{labelTZOff(z)}</span></div>
            </div>
          ))}
          <div class="yt-dd-group">{lang === 'ja' ? 'タイムゾーン' : 'Zones'}</div>
          {others.map((z) => (
            <div class="yt-dd-item" onClick={() => onSelect(z)}>
              <div class="yt-dd-item-row"><span>{labelTZName(z)}</span><span class="badge">{labelTZOff(z)}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
