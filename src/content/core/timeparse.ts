/**
 * 24時間入力の正規化
 * 許容 HH:mm HH:mm:ss HHmm HHmmss 単一桁の時分秒も受理
 * 例 7:5 → 07:05:00  08:80 → 09:20:00
 */

export type ParseOk = {
  ok: true
  hh: number
  mm: number
  ss: number
  normalized: string
  overflow: boolean        // 当日外フラグ
  dayOffset: number        // 24時間単位の超過数 負は未対応
}

export type ParseErr = {
  ok: false
  error: string
}

export type ParseResult = ParseOk | ParseErr

/**
 * 24時間入力を解析して正規化
 * 失敗時はエラー型で返す
 */
export function parseAndNormalize24h(input: string): ParseResult {
  const raw = (input ?? '').trim()
  if (!raw) return err('空の入力')

  // 区切り判定
  if (raw.includes(':')) {
    const parts = raw.split(':')
    if (parts.length < 2 || parts.length > 3) return err('形式が不正')
    const nums = parts.map((p) => toInt(p))
    if (nums.some((n) => n == null || n < 0)) return err('数字以外を含む')
    let [h, m, s] = [nums[0]!, nums[1]!, parts.length === 3 ? nums[2]! : 0]
    return normalize(h, m, s)
  }

  // 数字のみ HH or HHmm or HHmmss
  if (!/^\d+$/.test(raw)) return err('数字以外を含む')
  if (raw.length <= 2) {
    const h = toInt(raw)!
    return normalize(h, 0, 0)
  }
  if (raw.length === 4) {
    const h = toInt(raw.slice(0, 2))!
    const m = toInt(raw.slice(2, 4))!
    return normalize(h, m, 0)
  }
  if (raw.length === 6) {
    const h = toInt(raw.slice(0, 2))!
    const m = toInt(raw.slice(2, 4))!
    const s = toInt(raw.slice(4, 6))!
    return normalize(h, m, s)
  }

  return err('桁数が不正')
}

function normalize(hh: number, mm: number, ss: number): ParseResult {
  if (!isFinite(hh) || !isFinite(mm) || !isFinite(ss)) return err('数値が不正')
  if (hh < 0 || mm < 0 || ss < 0) return err('負の値は不可')

  // 秒を分へ繰り上げ
  if (ss >= 60) {
    mm += Math.floor(ss / 60)
    ss = ss % 60
  }
  // 分を時へ繰り上げ
  if (mm >= 60) {
    hh += Math.floor(mm / 60)
    mm = mm % 60
  }

  let overflow = false
  let dayOffset = 0
  if (hh >= 24) {
    overflow = true
    dayOffset = Math.floor(hh / 24)
    hh = hh % 24
  }

  const normalized = `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
  return { ok: true, hh, mm, ss, normalized, overflow, dayOffset }
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function toInt(s: string): number | null {
  if (!s) return null
  if (!/^\d+$/.test(s)) return null
  try {
    return parseInt(s, 10)
  } catch {
    return null
  }
}

function err(msg: string): ParseErr {
  return { ok: false, error: msg }
}
