import { h } from 'preact'
import { getOffsetMinutesNow, formatOffsetHM, displayNameForZone } from '../../core/timezone'

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
    try {
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
      const base = lang === 'ja' ? (jpMap[z] || displayNameForZone(z)) : (enMap[z] || displayNameForZone(z))
      const off = formatOffsetHM(getOffsetMinutesNow(z))
      return `${base} (${off})`
    } catch { return z }
  }

  const labelTZName = (z: string): string => {
    try {
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

  const labelTZOff = (z: string): string => {
    try { return formatOffsetHM(getOffsetMinutesNow(z)) } catch { return '+00:00' }
  }

  return (
    <div class="yt-dd" style={{ flex:'1 1 auto', minWidth:0 }}>
      <button ref={buttonRef as any} type="button" class="yt-dd-btn" style={{ fontSize:'11px' }} onClick={onToggle}>{labelTZ(zone)}</button>
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

