import Papa from 'papaparse'
import type { Word } from '@/types'

export const CSV_COLUMNS = [
  'word',
  'meaning',
  'ipa',
  'partOfSpeech',
  'emoji',
  'example',
  'exampleVi',
  'imageUrl'
] as const

export type CsvWord = Pick<Word, 'word' | 'meaningVi' | 'ipa' | 'partOfSpeech' | 'emoji' | 'example' | 'exampleVi'> & {
  imageUrl?: string
  /** Tên chủ đề ghi trong file (cột `topic` / `chủ đề`) — dùng khi phân loại, không lưu vào từ. */
  topic?: string
} & Partial<Pick<Word, 'synonyms' | 'collocations' | 'family' | 'cefr' | 'tags'>>

export interface CsvParseResult {
  rows: CsvWord[]
  errors: string[]
}

/** Các tên cột được chấp nhận (không phân biệt hoa thường, bỏ dấu cách/gạch). */
const ALIASES: Record<string, keyof CsvWord> = {
  word: 'word',
  english: 'word',
  tu: 'word',
  'từ': 'word',
  meaning: 'meaningVi',
  meaningvi: 'meaningVi',
  vietnamese: 'meaningVi',
  nghia: 'meaningVi',
  'nghĩa': 'meaningVi',
  ipa: 'ipa',
  phonetic: 'ipa',
  phienam: 'ipa',
  'phiênâm': 'ipa',
  partofspeech: 'partOfSpeech',
  pos: 'partOfSpeech',
  type: 'partOfSpeech',
  loaitu: 'partOfSpeech',
  'loạitừ': 'partOfSpeech',
  emoji: 'emoji',
  icon: 'emoji',
  example: 'example',
  sentence: 'example',
  vidu: 'example',
  'vídụ': 'example',
  examplevi: 'exampleVi',
  exampletranslation: 'exampleVi',
  dichvidu: 'exampleVi',
  'dịchvídụ': 'exampleVi',
  imageurl: 'imageUrl',
  image: 'imageUrl',
  anh: 'imageUrl',
  'ảnh': 'imageUrl',
  topic: 'topic',
  topicname: 'topic',
  category: 'topic',
  chude: 'topic',
  'chủđề': 'topic',
  danhmuc: 'topic',
  'danhmục': 'topic'
}

export function headerKey(h: string): keyof CsvWord | undefined {
  const k = h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]/g, '')
  return ALIASES[k]
}

export type RawRow = Partial<Record<keyof CsvWord, string | undefined>>

export interface CollectOptions {
  /** Giữ dòng chỉ có từ (nghĩa để trống, sẽ tra sau). */
  allowEmptyMeaning?: boolean
}

/**
 * Gom các dòng hợp lệ: bắt buộc có từ (và nghĩa, trừ khi `allowEmptyMeaning`),
 * bỏ từ trùng (không phân biệt hoa thường).
 */
export function rowCollector(
  errors: string[],
  { allowEmptyMeaning = false }: CollectOptions = {}
): { rows: CsvWord[]; add: (line: number, r: RawRow) => void } {
  const rows: CsvWord[] = []
  const seen = new Set<string>()
  const add = (line: number, r: RawRow): void => {
    const word = (r.word ?? '').trim().replace(/\s+/g, ' ')
    const meaningVi = (r.meaningVi ?? '').trim()
    if (!word || (!meaningVi && !allowEmptyMeaning)) {
      errors.push(`Dòng ${line}: thiếu từ hoặc nghĩa, đã bỏ qua.`)
      return
    }
    const key = word.toLowerCase()
    if (seen.has(key)) {
      errors.push(`Dòng ${line}: từ "${word}" bị trùng, đã bỏ qua.`)
      return
    }
    seen.add(key)
    const imageUrl = (r.imageUrl ?? '').trim()
    const topic = (r.topic ?? '').trim().replace(/\s+/g, ' ')
    rows.push({
      word,
      meaningVi,
      ipa: (r.ipa ?? '').trim(),
      partOfSpeech: (r.partOfSpeech ?? '').trim(),
      emoji: (r.emoji ?? '').trim(),
      example: (r.example ?? '').trim(),
      exampleVi: (r.exampleVi ?? '').trim(),
      ...(imageUrl ? { imageUrl } : {}),
      ...(topic ? { topic } : {})
    })
  }
  return { rows, add }
}

export function parseWordsCsv(text: string, opts: CollectOptions = {}): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => headerKey(h) ?? `__${h}`
  })
  // File một cột (chỉ có "word") không có dấu ngăn cách — không phải lỗi.
  const errors: string[] = parsed.errors
    .filter((e) => e.type !== 'Delimiter')
    .map((e) => `Dòng ${(e.row ?? 0) + 2}: ${e.message}`)
  const fields = parsed.meta.fields ?? []
  if (!fields.includes('word') || (!opts.allowEmptyMeaning && !fields.includes('meaningVi'))) {
    return { rows: [], errors: ['File CSV cần có cột "word" và "meaning".', ...errors] }
  }
  const c = rowCollector(errors, opts)
  parsed.data.forEach((r, i) => c.add(i + 2, r))
  return { rows: c.rows, errors }
}

/* ------------------------- Tách dòng dạng chữ ------------------------- */

/** Đánh số / gạch đầu dòng ở đầu dòng: "1.", "2)", "-", "•", "*". */
export const BULLET = /^\s*(?:\d+\s*[.)]|[-–—•*+])\s+/
/** Dấu ngăn cách từ và nghĩa; lấy dấu xuất hiện sớm nhất trong dòng. */
export const STRONG_SEPARATORS = [' - ', ' – ', ' — ', ':', '=', '|']

/**
 * Dòng tiêu đề: có cột từ và cột nghĩa, hoặc (khi cho phép nghĩa trống)
 * có cột từ và mọi cột đều là tên cột đã biết.
 */
export function looksLikeHeader(line: string, allowEmptyMeaning = false): boolean {
  const keys = line.split(/[\t,;|]/).map(headerKey)
  if (!keys.includes('word')) return false
  if (keys.includes('meaningVi')) return true
  return allowEmptyMeaning && keys.every((k) => k !== undefined)
}

/** Tách một dòng thành [từ, nghĩa…] theo tab hoặc dấu ngăn cách xuất hiện sớm nhất. */
export function splitLine(line: string): string[] {
  if (line.includes('\t')) return line.split('\t')
  let at = -1
  let sep = ''
  for (const s of STRONG_SEPARATORS) {
    const i = line.indexOf(s)
    if (i >= 0 && (at < 0 || i < at)) {
      at = i
      sep = s
    }
  }
  // Dấu phẩy chỉ dùng khi không có dấu ngăn cách nào khác (nghĩa hay chứa dấu phẩy).
  if (at < 0) {
    at = line.indexOf(',')
    sep = ','
  }
  return at < 0 ? [line] : [line.slice(0, at), line.slice(at + sep.length)]
}

export function wordsToCsv(words: readonly Word[]): string {
  const data = words.map((w) => [
    w.word,
    w.meaningVi,
    w.ipa,
    w.partOfSpeech,
    w.emoji,
    w.example,
    w.exampleVi,
    w.imageUrl ?? ''
  ])
  // BOM để Excel mở đúng tiếng Việt
  return '﻿' + Papa.unparse({ fields: [...CSV_COLUMNS], data })
}

export interface ClassificationEntry {
  topic: string
  /** Cấp độ CEFR ghi trong file (A1…C2, nếu có). */
  cefr?: string
}

/**
 * Đọc file kết quả phân loại (cột `word`, `topic`, tùy chọn `cefr`) → từ (chữ thường) → chủ đề.
 * Chấp nhận BOM, tên cột tiếng Việt (từ / chủ đề / cấp độ) và bỏ dòng thiếu từ hoặc chủ đề.
 */
export function parseClassificationCsv(text: string): Map<string, ClassificationEntry> {
  const { data } = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: true })
  const out = new Map<string, ClassificationEntry>()
  if (data.length < 2) return out
  const norm = (h: string): string => h.trim().toLowerCase().replace(/[\s_\-]/g, '')
  const header = data[0].map(norm)
  const col = (...names: string[]): number => header.findIndex((h) => names.includes(h))
  const wi = col('word', 'từ', 'tu', 'english', 'tiếnganh')
  const ti = col('topic', 'chủđề', 'chude', 'category')
  const ci = col('cefr', 'level', 'cấpđộ', 'capdo')
  if (wi < 0 || ti < 0) return out
  for (const r of data.slice(1)) {
    const word = (r[wi] ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
    const topic = (r[ti] ?? '').trim()
    if (!word || !topic) continue
    const cefr = ci >= 0 ? (r[ci] ?? '').trim().toUpperCase() : ''
    out.set(word, { topic, ...(/^(A1|A2|B1|B2|C1|C2)$/.test(cefr) ? { cefr } : {}) })
  }
  return out
}
