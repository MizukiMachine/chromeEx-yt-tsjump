/* @vitest-environment happy-dom */
import { describe, it, expect, vi } from 'vitest'
import { jumpToLocalTime } from '../src/content/core/jump'

// calibration.getC をモック
vi.mock('../src/content/core/calibration', () => ({
  getC: () => 0,
}))

function makeVideo(start: number, end: number): HTMLVideoElement {
  const v = document.createElement('video') as HTMLVideoElement
  let current = 0
  Object.defineProperty(v, 'currentTime', {
    get() { return current },
    set(x: number) { current = x },
    configurable: true,
  })
  Object.defineProperty(v, 'seekable', {
    get() {
      return { length: 1, start: () => start, end: () => end } as unknown as TimeRanges
    },
    configurable: true,
  })
  Object.defineProperty(v, 'duration', { value: end, configurable: true })
  return v
}

describe('jumpToLocalTime', () => {
  it('範囲内ならそのままseek', () => {
    const v = makeVideo(0, 10_000)
    const r = jumpToLocalTime(v, '00:01:40', 'UTC', { date: { year: 1970, month: 1, day: 1 }, cOverride: 0 })
    expect(r.ok).toBe(true)
    expect(r.decision).toBe('seek-in-range')
    expect(v.currentTime).toBe(100)
  })

  it('範囲外なら端比較でstartへ', () => {
    const v = makeVideo(100, 200)
    // 目標0秒は範囲外 start=100 end=200 guard=3 → startが近い
    const r = jumpToLocalTime(v, '00:00:00', 'UTC', { date: { year: 1970, month: 1, day: 1 }, cOverride: 0 })
    expect(r.ok).toBe(true)
    expect(r.decision).toBe('jump-start')
    expect(v.currentTime).toBe(100)
  })

  it('範囲外なら端比較でendへ', () => {
    const v = makeVideo(0, 200)
    // 目標10000秒は範囲外 end-guard=197 が近い
    const r = jumpToLocalTime(v, '02:46:40', 'UTC', { date: { year: 1970, month: 1, day: 1 }, cOverride: 0 })
    expect(r.ok).toBe(true)
    expect(r.decision).toBe('jump-end')
    expect(v.currentTime).toBe(197)
  })
})

