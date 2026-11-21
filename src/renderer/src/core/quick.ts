import type { DictEntry } from './lookup'
import type { AiExplanation } from './gemini'
import type { PackWord } from './packs'
import type { ExamEntry } from './examClassify'
import type { Cefr } from '@/types'

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

/** Các từ đã lưu trùng (không phân biệt hoa thường) với bất kỳ chữ nào trong `terms` — VD chữ đã copy và dạng gốc sau khi tra. */
export function findExisting<W extends { word: string }>(words: readonly W[], terms: readonly string[]): W[] {
  const keys = new Set(terms.map((t) => t.trim().toLowerCase()).filter(Boolean))
  return keys.size ? words.filter((w) => keys.has(w.word.trim().toLowerCase())) : []
}

/** Lý do gợi ý chủ đề, hiển thị dưới thẻ gợi ý của popup tra nhanh. */
export function reasonLabel(reason: string, isNew: boolean): string {
  switch (reason) {
    case 'mine':
      return 'Cùng nhóm nghĩa với các từ trong chủ đề này của bạn'
    case 'template':
      return isNew ? 'Hợp với chủ đề mẫu này — sẽ tạo chủ đề mới khi thêm' : 'Hợp với chủ đề mẫu này'
    case 'exam':
      return isNew ? 'Có trong bộ từ TOEIC/IELTS — sẽ tạo chủ đề mới khi thêm' : 'Có trong bộ từ TOEIC/IELTS'
    case 'existing':
      return 'Từ này đã có trong chủ đề này'
    case 'csv':
      return 'Theo tên chủ đề đã nhập'
    default:
      return 'Chưa đoán được chủ đề — xếp vào nhóm dự phòng'
  }
}

/* ------------------------------ Gộp dữ liệu tra nhanh ------------------------------ */

const MAX_ITEMS = 8

export interface WordInfoSources {
  word: string
  /** Ví dụ sẵn có trên dòng đang tra (từ có sẵn trong app). */
  example?: string
  exampleVi?: string
  dict?: DictEntry | null
  pack?: PackWord
  ai?: AiExplanation | null
}

export interface WordInfo {
  synonyms: string[]
  antonyms: string[]
  collocations: string[]
  family: string[]
  examples: { en: string; vi?: string }[]
}

function uniq(list: readonly (string | undefined)[], exclude: string, max = MAX_ITEMS): string[] {
  const seen = new Set([exclude.trim().toLowerCase()])
  const out: string[] = []
  for (const raw of list) {
    const s = raw?.trim()
    if (!s || seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())
    out.push(s)
    if (out.length >= max) break
  }
  return out
}

/** Gộp dữ liệu từ gói thi (offline), từ điển online và AI; bỏ trùng, ưu tiên nguồn có dịch tiếng Việt. */
export function buildWordInfo(src: WordInfoSources): WordInfo {
  const { word, dict, pack, ai } = src
  const senses = dict?.senses ?? []
  const examples: WordInfo['examples'] = []
  const seen = new Set<string>()
  const addEx = (en?: string, vi?: string): void => {
    const e = en?.trim()
    if (!e || seen.has(e.toLowerCase())) return
    seen.add(e.toLowerCase())
    examples.push(vi?.trim() ? { en: e, vi: vi.trim() } : { en: e })
  }
  addEx(src.example, src.exampleVi)
  addEx(pack?.example, pack?.exampleVi)
  for (const s of ai?.senses ?? []) addEx(s.example, s.exampleVi)
  for (const s of senses) for (const d of s.definitions) addEx(d.example)
  return {
    synonyms: uniq([...(pack?.synonyms ?? []), ...senses.flatMap((s) => s.synonyms)], word),
    antonyms: uniq(senses.flatMap((s) => s.antonyms), word),
    collocations: uniq([...(pack?.collocations ?? []), ...(ai?.collocations ?? []).map((c) => c.en)], word),
    family: uniq([...(pack?.family ?? []), ...(ai?.family ?? []).map((f) => f.word)], word),
    examples: examples.slice(0, MAX_ITEMS)
  }
}

export interface WordExtras {
  synonyms?: string[]
  collocations?: string[]
  family?: string[]
  cefr?: Cefr
  tags?: string[]
}

/** Thông tin mở rộng lưu kèm từ khi thêm từ popup (bỏ mục rỗng). */
export function extrasForSave(info: WordInfo, exam?: Pick<ExamEntry, 'cefr' | 'exams'>): WordExtras {
  const out: WordExtras = {}
  if (info.synonyms.length) out.synonyms = info.synonyms
  if (info.collocations.length) out.collocations = info.collocations
  if (info.family.length) out.family = info.family
  if (exam?.cefr) out.cefr = exam.cefr
  if (exam?.exams.length) out.tags = [...exam.exams]
  return out
}
