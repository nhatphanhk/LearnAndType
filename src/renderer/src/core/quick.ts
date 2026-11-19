/** Số từ tối đa của một cụm để tra nguyên cụm (ví dụ "look forward to"). */
const MAX_PHRASE_WORDS = 4

/**
 * Lấy từ hoặc cụm từ tiếng Anh cần tra từ chữ đã copy:
 * bỏ dấu câu ở hai đầu, giữ nguyên cụm ngắn, còn đoạn dài thì lấy từ tiếng Anh đầu tiên.
 */
export function pickLookupTerm(raw: string): string {
  const text = raw
    .normalize('NFC')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return ''
  // Tách theo khoảng trắng, bỏ dấu câu ở hai đầu mỗi token; token có chữ có dấu (tiếng Việt) không phải từ tiếng Anh
  const tokens = text
    .split(' ')
    .map((t) => t.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''))
    .filter(Boolean)
  const isEnglish = (t: string): boolean => /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(t)
  const english = tokens.filter(isEnglish)
  if (english.length === 0) return ''
  if (english.length === tokens.length && tokens.length <= MAX_PHRASE_WORDS) return english.join(' ').toLowerCase()
  return english[0].toLowerCase()
}

const MODIFIERS: Record<string, string> = {
  Control: 'CommandOrControl',
  Meta: 'Super',
  Alt: 'Alt',
  Shift: 'Shift'
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Esc',
  '+': 'Plus'
}

export interface KeyLike {
  key: string
  code?: string
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  metaKey: boolean
}

/**
 * Chuyển một lần nhấn phím thành chuỗi accelerator của Electron (ví dụ "CommandOrControl+Shift+L").
 * Trả về null khi chỉ nhấn phím bổ trợ, hoặc thiếu Ctrl/Alt/Win (tránh chiếm phím gõ thường).
 */
export function toAccelerator(e: KeyLike): string | null {
  if (e.key in MODIFIERS) return null
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return null
  let key: string
  if (e.code && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (e.code && /^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (/^F\d{1,2}$/.test(e.key)) key = e.key
  else if (KEY_NAMES[e.key]) key = KEY_NAMES[e.key]
  else if (e.key.length === 1) key = e.key.toUpperCase()
  else return null
  const parts: string[] = []
  if (e.ctrlKey) parts.push('CommandOrControl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Super')
  parts.push(key)
  return parts.join('+')
}

/** Hiển thị accelerator cho người dùng Windows: "Ctrl + Shift + L". */
export function formatAccelerator(accel: string): string {
  return accel
    .split('+')
    .map((p) => (p === 'CommandOrControl' || p === 'CmdOrCtrl' ? 'Ctrl' : p === 'Super' ? 'Win' : p))
    .join(' + ')
}
