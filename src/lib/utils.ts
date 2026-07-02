export function generateId(): string {
  return crypto.randomUUID()
}

export function now(): string {
  return new Date().toISOString()
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function genderLabel(gender?: string): string {
  if (gender === 'male') return '男性'
  if (gender === 'female') return '女性'
  if (gender === 'other') return 'その他'
  return '不明'
}

export function countryName(code?: string): string {
  if (!code) return '不明'
  const names: Record<string, string> = {
    JP: '日本', US: 'アメリカ', GB: 'イギリス', CN: '中国',
    KR: '韓国', FR: 'フランス', DE: 'ドイツ', IN: 'インド',
    AU: 'オーストラリア', CA: 'カナダ', BR: 'ブラジル', IT: 'イタリア',
    SG: 'シンガポール', TH: 'タイ', VN: 'ベトナム', ID: 'インドネシア',
  }
  return names[code.toUpperCase()] ?? code
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  triggerDownload(blob, filename)
}

export function downloadCsv(rows: string[][], filename: string): void {
  const csv = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  triggerDownload(blob, filename)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
