import { getLang, type Lang } from './i18n'

const cache = new Map<string, Map<Lang, string>>()

const MANUAL_LABELS: Record<Lang, Record<string, string>> = {
  en: {
    'Asia/Tokyo': 'Japan: Tokyo',
    'Asia/Seoul': 'Korea: Seoul',
    'Asia/Singapore': 'Singapore: Singapore',
    'Asia/Taipei': 'Taiwan: Taipei',
    'Asia/Shanghai': 'China: Shanghai',
    'Asia/Hong_Kong': 'Hong Kong',
    'Asia/Bangkok': 'Thailand: Bangkok',
    'Asia/Kuala_Lumpur': 'Malaysia: Kuala Lumpur',
    'Asia/Jakarta': 'Indonesia: Jakarta',
    'Asia/Dubai': 'UAE: Dubai',
    'Asia/Manila': 'Philippines: Manila',
    'Asia/Karachi': 'Pakistan: Karachi',
    'Asia/Calcutta': 'India: Kolkata',
    'Asia/Colombo': 'Sri Lanka: Colombo',
    'Asia/Almaty': 'Kazakhstan: Almaty',
    'Asia/Yangon': 'Myanmar: Yangon',
    'Australia/Sydney': 'Australia: Sydney',
    'Australia/Perth': 'Australia: Perth',
    'Pacific/Auckland': 'New Zealand: Auckland',
    'Pacific/Honolulu': 'USA: Honolulu',
    'America/Los_Angeles': 'USA: Los Angeles',
    'America/Denver': 'USA: Denver',
    'America/Chicago': 'USA: Chicago',
    'America/New_York': 'USA: New York',
    'America/Toronto': 'Canada: Toronto',
    'America/Vancouver': 'Canada: Vancouver',
    'America/Mexico_City': 'Mexico City',
    'America/Sao_Paulo': 'Brazil: São Paulo',
    'America/Bogota': 'Colombia: Bogotá',
    'America/Lima': 'Peru: Lima',
    'America/Argentina/Buenos_Aires': 'Argentina: Buenos Aires',
    'Africa/Windhoek': 'Namibia: Windhoek',
    'Africa/Nairobi': 'Kenya: Nairobi',
    'Africa/Cairo': 'Egypt: Cairo',
    'Africa/Johannesburg': 'South Africa: Johannesburg',
    'Europe/London': 'UK: London',
    'Europe/Amsterdam': 'Netherlands: Amsterdam',
    'Europe/Berlin': 'Germany: Berlin',
    'Europe/Rome': 'Italy: Rome',
    'Europe/Madrid': 'Spain: Madrid',
    'Europe/Paris': 'France: Paris',
    'Europe/Stockholm': 'Sweden: Stockholm',
    'Europe/Helsinki': 'Finland: Helsinki',
    'Europe/Copenhagen': 'Denmark: Copenhagen',
    'Europe/Athens': 'Greece: Athens',
    'Europe/Moscow': 'Russia: Moscow',
    'UTC': 'Coordinated Universal Time',
  },
  ja: {
    'Asia/Tokyo': '日本：東京',
    'Asia/Seoul': '韓国：ソウル',
    'Asia/Singapore': 'シンガポール：シンガポール',
    'Asia/Taipei': '台湾：台北',
    'Asia/Shanghai': '中国：上海',
    'Asia/Hong_Kong': '香港',
    'Asia/Bangkok': 'タイ：バンコク',
    'Asia/Kuala_Lumpur': 'マレーシア：クアラルンプール',
    'Asia/Jakarta': 'インドネシア：ジャカルタ',
    'Asia/Dubai': 'アラブ首長国連邦：ドバイ',
    'Asia/Manila': 'フィリピン：マニラ',
    'Asia/Karachi': 'パキスタン：カラチ',
    'Asia/Calcutta': 'インド：コルカタ',
    'Asia/Colombo': 'スリランカ：コロンボ',
    'Asia/Almaty': 'カザフスタン：アルマトイ',
    'Asia/Yangon': 'ミャンマー：ヤンゴン',
    'Australia/Sydney': 'オーストラリア：シドニー',
    'Australia/Perth': 'オーストラリア：パース',
    'Pacific/Auckland': 'ニュージーランド：オークランド',
    'Pacific/Honolulu': 'アメリカ：ホノルル',
    'America/Los_Angeles': 'アメリカ：ロサンゼルス',
    'America/Denver': 'アメリカ：デンバー',
    'America/Chicago': 'アメリカ：シカゴ',
    'America/New_York': 'アメリカ：ニューヨーク',
    'America/Toronto': 'カナダ：トロント',
    'America/Vancouver': 'カナダ：バンクーバー',
    'America/Mexico_City': 'メキシコ：メキシコシティ',
    'America/Sao_Paulo': 'ブラジル：サンパウロ',
    'America/Bogota': 'コロンビア：ボゴタ',
    'America/Lima': 'ペルー：リマ',
    'America/Argentina/Buenos_Aires': 'アルゼンチン：ブエノスアイレス',
    'Africa/Windhoek': 'ナミビア：ウィントフック',
    'Africa/Nairobi': 'ケニア：ナイロビ',
    'Africa/Cairo': 'エジプト：カイロ',
    'Africa/Johannesburg': '南アフリカ：ヨハネスブルク',
    'Europe/London': 'イギリス：ロンドン',
    'Europe/Amsterdam': 'オランダ：アムステルダム',
    'Europe/Berlin': 'ドイツ：ベルリン',
    'Europe/Rome': 'イタリア：ローマ',
    'Europe/Madrid': 'スペイン：マドリード',
    'Europe/Paris': 'フランス：パリ',
    'Europe/Stockholm': 'スウェーデン：ストックホルム',
    'Europe/Helsinki': 'フィンランド：ヘルシンキ',
    'Europe/Copenhagen': 'デンマーク：コペンハーゲン',
    'Europe/Athens': 'ギリシャ：アテネ',
    'Europe/Moscow': 'ロシア：モスクワ',
    'UTC': '協定世界時',
  },
}

function getDisplayNames(lang: Lang): Intl.DisplayNames | null {
  try {
    if (typeof Intl === 'undefined' || !(Intl as any).DisplayNames) return null
    return new Intl.DisplayNames(lang, { type: 'timeZone' as any })
  } catch {
    return null
  }
}

export function formatTimeZoneLabel(zone: string, langOverride?: Lang): string {
  const lang = langOverride ?? getLang()
  const byLang = cache.get(zone) ?? new Map<Lang, string>()
  if (byLang.has(lang)) {
    return byLang.get(lang) as string
  }
  let label = zone
  const displayNames = getDisplayNames(lang)
  if (displayNames) {
    try {
      const resolved = displayNames.of(zone)
      if (resolved && typeof resolved === 'string') {
        label = resolved
      }
    } catch {
      // ignore
    }
  }
  if (label === zone || label.includes('/')) {
    const manual = MANUAL_LABELS[lang]?.[zone]
    if (manual) {
      label = manual
    }
  }
  byLang.set(lang, label)
  cache.set(zone, byLang)
  return label
}

export function isDisplayableZone(zone: string): boolean {
  const label = formatTimeZoneLabel(zone, 'ja')
  if (!label || label === zone) return false
  if (label.includes('/')) return false
  return true
}
