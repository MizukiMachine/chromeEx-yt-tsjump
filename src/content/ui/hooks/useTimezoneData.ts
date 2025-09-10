/**
 * Timezone dropdown and MRU management
 */
import { useState, useEffect, useMemo } from 'preact/hooks'
import { getString, setString, getJSON, Keys } from '../../store/local'

const DEFAULT_ZONE = 'Asia/Tokyo'
const PRESET_ZONES = [
  'Asia/Tokyo', 'UTC', 'America/New_York', 'America/Los_Angeles', 
  'Europe/London', 'Europe/Paris', 'Asia/Shanghai', 'Australia/Sydney'
]

export function useTimezoneData() {
  const [zone, setZone] = useState(getString(Keys.TzCurrent) || DEFAULT_ZONE)
  const [presets, setPresets] = useState<string[]>(PRESET_ZONES)

  // MRUゾーンの一覧を用意
  const { mru, others } = useMemo(() => {
    const rawMru = getJSON<string[]>(Keys.TzMru) ?? []
    const uniq = Array.from(new Set([zone, ...rawMru]))
    const mru5 = uniq.filter(Boolean).slice(0, 5)
    const others = presets.filter((z) => !mru5.includes(z))
    return { mru: mru5, others }
  }, [zone, presets])

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

  const updateZone = (newZone: string) => {
    setZone(newZone)
    setString(Keys.TzCurrent, newZone)
  }

  return {
    zone,
    setZone: updateZone,
    mru,
    others,
    presets
  }
}