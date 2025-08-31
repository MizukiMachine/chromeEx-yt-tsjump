import { describe, it, expect } from 'vitest'
import { Temporal } from '@js-temporal/polyfill'
import { getTodayInZone, toEpochInZone, PRESET_ZONES, DEFAULT_ZONE } from '../src/content/core/timezone'

describe('getTodayInZone', () => {
  it('returns today fields for zone', () => {
    const z = 'Asia/Tokyo'
    const t = Temporal.Now.zonedDateTimeISO(z)
    const d = getTodayInZone(z)
    expect(d.year).toBe(t.year)
    expect(d.month).toBe(t.month)
    expect(d.day).toBe(t.day)
  })
})

describe('toEpochInZone DST扱い', () => {
  it('ギャップは前方スナップ America/New_York 2021-03-14 02:30 → 03:30', () => {
    const zone = 'America/New_York'
    const date = { year: 2021, month: 3, day: 14 }
    const r = toEpochInZone(zone, { hh: 2, mm: 30, ss: 0 }, { date })
    expect(r.gap).toBe(true)
    // 03:30にスナップされるはず
    expect(r.wall.startsWith('2021-03-14T03:30:00')).toBe(true)
  })

  it('曖昧はearlierを選ぶ America/New_York 2021-11-07 01:30', () => {
    const zone = 'America/New_York'
    const date = { year: 2021, month: 11, day: 7 }
    // 01:30 は2回現れる 早い方を選ぶ
    const r = toEpochInZone(zone, { hh: 1, mm: 30, ss: 0 }, { date })
    expect(r.ambiguous).toBe(true)
    // 2つのInstantのうち早い方と一致することを確認
    const tz = Temporal.TimeZone.from(zone)
    const pdt = new Temporal.PlainDateTime(date.year, date.month, date.day, 1, 30, 0)
    const instants = tz.getPossibleInstantsFor(pdt)
    const earlier = instants[0].epochSeconds
    expect(Math.floor(earlier)).toBe(r.epochSec)
  })
})

describe('プリセットTZとデフォルト', () => {
  it('必須の地域を含む', () => {
    expect(PRESET_ZONES).toEqual(expect.arrayContaining([
      'Europe/Amsterdam', // オランダ
      'Africa/Windhoek',  // ナミビア
      'Asia/Tokyo',       // 日本
      'Africa/Nairobi',   // ケニア
      'Europe/Copenhagen',// デンマーク
      'Asia/Seoul',       // 韓国
      'Pacific/Honolulu', // ハワイ
    ]))
  })

  it('デフォルトがEurope/Amsterdam', () => {
    expect(DEFAULT_ZONE).toBe('Europe/Amsterdam')
  })

  it('すべてのプリセットが有効なTZ', () => {
    for (const z of PRESET_ZONES) {
      expect(() => Temporal.TimeZone.from(z)).not.toThrow()
    }
  })
})
