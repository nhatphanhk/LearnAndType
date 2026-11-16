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
}

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
  'ảnh': 'imageUrl'
}

function headerKey(h: string): keyof CsvWord | undefined {
  const k = h
    .replace(/^﻿/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]/g, '')
  return ALIASES[k]
}

export function parseWordsCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => headerKey(h) ?? `__${h}`
  })
  const errors: string[] = parsed.errors.map((e) => `Dòng ${(e.row ?? 0) + 2}: ${e.message}`)
  const fields = parsed.meta.fields ?? []
  if (!fields.includes('word') || !fields.includes('meaningVi')) {
    return { rows: [], errors: ['File CSV cần có cột "word" và "meaning".', ...errors] }
  }
  const rows: CsvWord[] = []
  const seen = new Set<string>()
  parsed.data.forEach((r, i) => {
    const word = (r.word ?? '').trim()
    const meaningVi = (r.meaningVi ?? '').trim()
    if (!word || !meaningVi) {
      errors.push(`Dòng ${i + 2}: thiếu từ hoặc nghĩa, đã bỏ qua.`)
      return
    }
    const key = word.toLowerCase()
    if (seen.has(key)) {
      errors.push(`Dòng ${i + 2}: từ "${word}" bị trùng, đã bỏ qua.`)
      return
    }
    seen.add(key)
    const imageUrl = (r.imageUrl ?? '').trim()
    rows.push({
      word,
      meaningVi,
      ipa: (r.ipa ?? '').trim(),
      partOfSpeech: (r.partOfSpeech ?? '').trim(),
      emoji: (r.emoji ?? '').trim(),
      example: (r.example ?? '').trim(),
      exampleVi: (r.exampleVi ?? '').trim(),
      ...(imageUrl ? { imageUrl } : {})
    })
  })
  return { rows, errors }
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
