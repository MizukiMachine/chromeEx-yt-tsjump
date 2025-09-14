import { describe, it, expect } from 'vitest'
import { parseAndNormalize24h } from '../src/content/core/timeparse'

describe('parseAndNormalize24h 正規化', () => {
  it('7:5 → 07:05:00', () => {
    const r = parseAndNormalize24h('7:5')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('07:05:00')
      expect(r.overflow).toBe(false)
    }
  })

  it('08:80 → 09:20:00', () => {
    const r = parseAndNormalize24h('08:80')
    expect(r.ok && r.normalized === '09:20:00').toBe(true)
  })

  it('24:10 は翌日に繰り上げ', () => {
    const r = parseAndNormalize24h('24:10')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('00:10:00')
      expect(r.overflow).toBe(true)
      expect(r.dayOffset).toBe(1)
    }
  })

  it('HHmmss 236059 → 00:00:59 かつ overflow', () => {
    const r = parseAndNormalize24h('236059')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('00:00:59')
      expect(r.overflow).toBe(true)
      expect(r.dayOffset).toBe(1)
    }
  })

  it('HHmm 1260 → 13:00:00', () => {
    const r = parseAndNormalize24h('1260')
    expect(r.ok && r.normalized === '13:00:00').toBe(true)
  })

  it('7:5:70 → 07:06:10', () => {
    const r = parseAndNormalize24h('7:5:70')
    expect(r.ok && r.normalized === '07:06:10').toBe(true)
  })

  it('HH 15 → 15:00:00', () => {
    const r = parseAndNormalize24h('15')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('15:00:00')
      expect(r.overflow).toBe(false)
    }
  })

  it('H 2 → 02:00:00', () => {
    const r = parseAndNormalize24h('2')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('02:00:00')
      expect(r.overflow).toBe(false)
    }
  })

  // 追加仕様: 3/5桁は右0埋め、3桁のとき先頭2桁>=24は h:mm フォールバック
  it('3桁 100 → 10:00:00（右0埋めでHHmmss）', () => {
    const r = parseAndNormalize24h('100')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('10:00:00')
    }
  })

  it('5桁 12345 → 12:34:50（右0埋めでHHmmss）', () => {
    const r = parseAndNormalize24h('12345')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('12:34:50')
    }
  })

  it('3桁 905 → 09:05:00（HH>=24なので h:mm フォールバック）', () => {
    const r = parseAndNormalize24h('905')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('09:05:00')
    }
  })

  it('3桁 235 → 23:50:00（HH<24 なのでHHmmss解釈）', () => {
    const r = parseAndNormalize24h('235')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('23:50:00')
    }
  })

  it('3桁 240 → 02:40:00（HH=24でフォールバック h:mm）', () => {
    const r = parseAndNormalize24h('240')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.normalized).toBe('02:40:00')
    }
  })
})

describe('parseAndNormalize24h エラー', () => {
  it('空', () => {
    const r = parseAndNormalize24h('')
    expect(r.ok).toBe(false)
  })

  it('7::5 は不正', () => {
    const r = parseAndNormalize24h('7::5')
    expect(r.ok).toBe(false)
  })

  it('数字以外は不正', () => {
    const r = parseAndNormalize24h('ab:cd')
    expect(r.ok).toBe(false)
  })
})
