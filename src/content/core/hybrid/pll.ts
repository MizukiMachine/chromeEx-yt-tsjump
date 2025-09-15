import { now, getBufferedEnd } from './utils'
import { getSeekableEnd } from '../seek'
import type { HybridCalibConfig } from './config'

export interface PllAccess {
  getVideo(): HTMLVideoElement | null
  isLocked(): boolean
  getConfig(): HybridCalibConfig
  getC(): number | null
  setC(v: number): void
  getD(): number
  getConsec(): number
  setConsec(n: number): void
  getDfallback(): { value: number | null; until: number }
  setDfallback(value: number | null, until: number): void
  getLeadSamples(): number[]
  setLeadSamples(a: number[]): void
  debug?(event: string, data?: any): void
}

/**
 * Live-PLL tick（1Hz程度で実行）
 * seekableEndを観測し、誤差に応じてCを超低速で微調整
 */
export function executePllTick(access: PllAccess): void {
  const debug = (e: string, d?: any) => { try { access.debug?.(e, d) } catch {} }
  const video = access.getVideo()
  const cfg = access.getConfig()
  if (!video || access.isLocked() || !Number.isFinite(access.getC() as any)) {
    if (access.isLocked()) debug('pll-skip', { reason: 'locked' })
    return
  }

  const seekableEnd = getSeekableEnd(video)
  if (!Number.isFinite(seekableEnd)) {
    debug('pll-skip', { reason: 'invalid-seekable' })
    return
  }

  // ---- D_fallback 採否の評価（短期・限定用途） ----
  try {
    const be = getBufferedEnd(video)
    const futureLead = (Number.isFinite(seekableEnd) && Number.isFinite(be)) ? ((seekableEnd as number) - (be as number)) : NaN

    // D が確定していれば D_fallback は不要
    if (access.getD() !== 0) {
      const df = access.getDfallback()
      if (df.value != null) debug('dfallback-clear', { reason: 'D-confirmed', dfallback: df.value })
      access.setDfallback(null, 0)
      access.setLeadSamples([])
    } else if (Number.isFinite(futureLead)) {
      // 観測帯（約50〜70分先行相当: 3000..4200s）に入っている連続サンプルを集める
      const inRange = (futureLead as number) >= 3000 && (futureLead as number) <= 4200
      const samples = [...access.getLeadSamples()]
      if (inRange) {
        samples.push(futureLead as number)
        if (samples.length > 5) samples.shift()
      } else {
        // 外れたらリセット（安定してから再評価）
        samples.length = 0
      }
      access.setLeadSamples(samples)

      const enough = samples.length >= 5
      const nowMs = Date.now()
      const df = access.getDfallback()
      const expired = df.value != null && nowMs > df.until
      if (expired) {
        debug('dfallback-clear', { reason: 'ttl-expired', dfallback: df.value })
        access.setDfallback(null, 0)
      }
      if (df.value == null && enough) {
        // 中央値でロバストに推定し、負符号でDへ（D=buffered−seekable）
        const sorted = [...samples].sort((a,b)=>a-b)
        const mid = Math.floor(sorted.length/2)
        const med = sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2
        const dfVal = -med // D は負方向
        access.setDfallback(dfVal, nowMs + 3 * 60 * 1000) // 3分TTL
        debug('dfallback-adopt', { dfallback: dfVal, samples })
      }
    }
  } catch {}

  // 誤差計算: e = (seekableEnd + D + C) - (now - L)
  const nowEpoch = now()
  const df = access.getDfallback()
  const dEff = access.getD() !== 0
    ? access.getD()
    : ((df.value != null && Date.now() <= df.until) ? (df.value as number) : 0)
  const Cnow = access.getC() as number
  const e = (seekableEnd + dEff + Cnow) - (nowEpoch - cfg.latencySec)

  // 外れ値チェック
  if (Math.abs(e) > cfg.pll.outlierESec) {
    access.setConsec(0)
    debug('pll-outlier', { e, threshold: cfg.pll.outlierESec })
    return
  }

  // ヒステリシス（小さな誤差は無視）
  if (Math.abs(e) <= cfg.pll.hysSec) {
    access.setConsec(0)
    return
  }

  // 連続検出カウント
  const consec = access.getConsec() + 1
  access.setConsec(consec)
  if (consec < cfg.pll.consecN) {
    debug('pll-accumulating', { e, consec, needed: cfg.pll.consecN })
    return
  }

  // PLL補正実行
  access.setConsec(0)
  const currentC = Cnow
  const targetC = currentC - cfg.pll.alpha * e
  const delta = Math.max(
    -cfg.pll.maxRatePerSec,
    Math.min(cfg.pll.maxRatePerSec, targetC - currentC)
  )
  const newC = currentC + delta
  access.setC(newC)
  debug('pll-adjust', { e, prevC: currentC, newC, delta, targetC, seekableEnd, dEff })
}

