/**
 * Phân loại từ vựng đang có (từ có sẵn + từ tự thêm) theo luyện thi:
 *   - cấp độ CEFR: bảng cấp độ (vocab/_levels + từ trong gói) → AI nếu không có;
 *   - nhãn kỳ thi (toeic / ielts): từ có trong gói thi tương ứng;
 *   - chủ đề thi gợi ý: chủ đề của từ đó trong gói (VD TOEIC · Tài chính).
 * Khớp theo chữ thường, thử thêm dạng gốc (số nhiều, -ed, -ing).
 */
import { lemmaCandidates } from './extract'
import { packTopicId, toCefr, type PackExam, type PackFile } from './packs'
import type { Cefr, Word } from '@/types'

export interface ExamTopicRef {
  /** Khóa duy nhất: `<packId>/<topicId>`. */
  key: string
  packId: string
  exam: PackExam
  /** Id chủ đề trong DB nếu gói đã cài. */
  topicId: string
  name: string
  nameEn: string
  emoji: string
  packName: string
}

export interface ExamEntry {
  cefr?: Cefr
  exams: PackExam[]
  topics: ExamTopicRef[]
}

export type ExamIndex = Map<string, ExamEntry>

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

export function examTopics(packs: readonly PackFile[]): ExamTopicRef[] {
  return packs.flatMap((p) =>
    p.exam && p.exam !== 'general'
      ? p.topics.map((t) => ({
          key: `${p.id}/${t.id}`,
          packId: p.id,
          exam: p.exam as PackExam,
          topicId: packTopicId(p.id, t.id),
          name: t.name,
          nameEn: t.nameEn ?? '',
          emoji: t.emoji || p.emoji,
          packName: p.name
        }))
      : []
  )
}

export function buildExamIndex(packs: readonly PackFile[], levels: Readonly<Record<string, string>>): ExamIndex {
  const index: ExamIndex = new Map()
  const entry = (k: string): ExamEntry => {
    let e = index.get(k)
    if (!e) index.set(k, (e = { exams: [], topics: [] }))
    return e
  }
  for (const [w, lv] of Object.entries(levels)) {
    const c = toCefr(lv)
    if (c) entry(norm(w)).cefr = c
  }
  const refs = new Map(examTopics(packs).map((r) => [r.key, r]))
  for (const p of packs) {
    for (const t of p.topics) {
      const ref = refs.get(`${p.id}/${t.id}`)
      for (const w of t.words) {
        if (!w?.word) continue
        const e = entry(norm(w.word))
        const c = toCefr(w.cefr)
        if (c && !e.cefr) e.cefr = c
        if (p.exam && p.exam !== 'general' && !e.exams.includes(p.exam)) e.exams.push(p.exam)
        if (ref && !e.topics.some((x) => x.key === ref.key)) e.topics.push(ref)
      }
    }
  }
  return index
}

export function lookupExam(index: ExamIndex, word: string): ExamEntry | undefined {
  const k = norm(word)
  const hit = index.get(k)
  if (hit) return hit
  if (k.includes(' ')) return undefined
  for (const base of lemmaCandidates(k)) {
    const e = index.get(base)
    if (e) return e
  }
  return undefined
}

export interface WordClassification {
  word: Word
  cefr?: Cefr
  /** Nhãn kỳ thi mới (toeic / ielts) — gộp với nhãn đã có. */
  tags: string[]
  /** Chủ đề thi gợi ý (ưu tiên gói TOEIC/IELTS theo thứ tự trong index). */
  topic?: ExamTopicRef
  /** Không tìm thấy trong bảng — có thể nhờ AI. */
  unknown: boolean
  /** Có gì mới để lưu so với dữ liệu hiện tại. */
  changed: boolean
}

export function classifyWords(words: readonly Word[], index: ExamIndex): WordClassification[] {
  return words.map((w) => {
    const e = lookupExam(index, w.word)
    const cefr = w.cefr ?? e?.cefr
    const tags = [...new Set([...(w.tags ?? []), ...(e?.exams ?? [])])]
    const changed = cefr !== w.cefr || tags.length !== (w.tags?.length ?? 0)
    return { word: w, cefr, tags, topic: e?.topics[0], unknown: !e, changed }
  })
}

export interface ClassifySummary {
  total: number
  withCefr: number
  toeic: number
  ielts: number
  unknown: number
  changed: number
  byCefr: Record<Cefr | '?', number>
}

export function summarizeClassification(list: readonly WordClassification[]): ClassifySummary {
  const byCefr = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, '?': 0 }
  let withCefr = 0
  let toeic = 0
  let ielts = 0
  let unknown = 0
  let changed = 0
  for (const c of list) {
    byCefr[c.cefr ?? '?']++
    if (c.cefr) withCefr++
    if (c.tags.includes('toeic')) toeic++
    if (c.tags.includes('ielts')) ielts++
    if (c.unknown && !c.cefr) unknown++
    if (c.changed) changed++
  }
  return { total: list.length, withCefr, toeic, ielts, unknown, changed, byCefr }
}

/** Tên chủ đề tự tạo khi xếp từ của tôi vào chủ đề thi, VD "TOEIC · Tài chính & kế toán". */
export function examTopicName(ref: ExamTopicRef): string {
  return `${ref.exam.toUpperCase()} · ${ref.name}`
}
