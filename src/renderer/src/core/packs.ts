/**
 * Gói luyện thi (TOEIC / IELTS…): file JSON sinh bởi `npm run build:packs` (scripts/build-exam-packs.mjs)
 * hoặc người dùng tự chọn file. Cài gói = ghi các chủ đề + từ chỉ đọc vào IndexedDB.
 *
 * Id ổn định để cập nhật gói không mất tiến độ:
 *   chủ đề `pack-<packId>-<topicId>`, từ `pack-<packId>:<slug từ>` (không phụ thuộc chủ đề, nên đổi chủ đề vẫn giữ tiến độ).
 */
import { slugify } from '@/data/builtin'
import type { Cefr, Topic, Word } from '@/types'

export const PACK_APP = 'LearnAndType-pack'
export const CEFR_LEVELS: readonly Cefr[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
/** Chủ đề của gói xếp sau chủ đề có sẵn / tự tạo. */
const PACK_ORDER_BASE = 10_000

export type PackExam = 'toeic' | 'ielts' | 'general'

export interface PackWord {
  word: string
  meaningVi: string
  ipa?: string
  pos?: string
  emoji?: string
  example?: string
  exampleVi?: string
  cefr?: string
  tags?: string[]
  synonyms?: string[]
  collocations?: string[]
  family?: string[]
}

export interface PackTopic {
  id: string
  name: string
  nameEn: string
  emoji: string
  description?: string
  words: PackWord[]
}

export interface PackFile {
  app: typeof PACK_APP
  id: string
  version: number
  /** Mã băm nội dung (do build:packs sinh) — khác bản đã cài là có bản mới. */
  build?: number
  name: string
  nameEn: string
  emoji: string
  description?: string
  exam?: PackExam
  /** Ghi chú nguồn dữ liệu (VD "Oxford 5000, Barron's 600"). */
  sources?: string[]
  topics: PackTopic[]
}

/** Tóm tắt gói (không kèm danh sách từ) để hiển thị. */
export interface PackSummary {
  id: string
  version: number
  build?: number
  name: string
  nameEn: string
  emoji: string
  description?: string
  exam?: PackExam
  sources?: string[]
  topicCount: number
  wordCount: number
}

const isStr = (x: unknown): x is string => typeof x === 'string'
const strList = (x: unknown): string[] | undefined => {
  if (!Array.isArray(x)) return undefined
  const list = x.filter(isStr).map((s) => s.trim()).filter(Boolean)
  return list.length ? [...new Set(list)] : undefined
}

export function isPackFile(x: unknown): x is PackFile {
  const p = x as PackFile
  return (
    !!p &&
    p.app === PACK_APP &&
    isStr(p.id) &&
    /^[a-z0-9-]+$/.test(p.id) &&
    Number.isInteger(p.version) &&
    isStr(p.name) &&
    Array.isArray(p.topics) &&
    p.topics.every((t) => !!t && isStr(t.id) && isStr(t.name) && Array.isArray(t.words))
  )
}

export function toCefr(x: unknown): Cefr | undefined {
  if (!isStr(x)) return undefined
  const v = x.trim().toUpperCase()
  return (CEFR_LEVELS as readonly string[]).includes(v) ? (v as Cefr) : undefined
}

export function summarizePack(p: PackFile): PackSummary {
  const { topics, app: _app, ...rest } = p
  return { ...rest, topicCount: topics.length, wordCount: packEntities(p).words.length }
}

export const packTopicId = (packId: string, topicId: string): string => `pack-${packId}-${slugify(topicId)}`
export const packWordId = (packId: string, word: string): string => `pack-${packId}:${slugify(word)}`

/**
 * Chuyển gói thành bản ghi chủ đề + từ. Từ thiếu nghĩa bị bỏ (đếm `skipped`);
 * từ trùng trong gói chỉ giữ lần xuất hiện đầu (gộp nhãn của các lần sau).
 */
export function packEntities(
  pack: PackFile,
  packIndex = 0,
  createdAt = 0
): { topics: Topic[]; words: Word[]; skipped: number } {
  const topics: Topic[] = []
  const byId = new Map<string, Word>()
  let skipped = 0
  let n = 0
  pack.topics.forEach((t, ti) => {
    const topicId = packTopicId(pack.id, t.id)
    topics.push({
      id: topicId,
      name: t.name,
      nameEn: t.nameEn ?? '',
      emoji: t.emoji || pack.emoji || '📘',
      description: t.description ?? '',
      isBuiltIn: true,
      packId: pack.id,
      order: PACK_ORDER_BASE + packIndex * 1000 + ti,
      createdAt
    })
    for (const w of t.words) {
      const word = isStr(w?.word) ? w.word.trim().replace(/\s+/g, ' ') : ''
      const meaningVi = isStr(w?.meaningVi) ? w.meaningVi.trim() : ''
      if (!word || !meaningVi || !slugify(word)) {
        skipped++
        continue
      }
      const id = packWordId(pack.id, word)
      const tags = strList(w.tags)
      const dup = byId.get(id)
      if (dup) {
        if (tags) dup.tags = [...new Set([...(dup.tags ?? []), ...tags])]
        continue
      }
      const cefr = toCefr(w.cefr)
      const synonyms = strList(w.synonyms)
      const collocations = strList(w.collocations)
      const family = strList(w.family)
      byId.set(id, {
        id,
        topicId,
        word,
        ipa: isStr(w.ipa) ? w.ipa.trim() : '',
        partOfSpeech: isStr(w.pos) ? w.pos.trim() : '',
        meaningVi,
        emoji: isStr(w.emoji) ? w.emoji.trim() : '',
        example: isStr(w.example) ? w.example.trim() : '',
        exampleVi: isStr(w.exampleVi) ? w.exampleVi.trim() : '',
        isBuiltIn: true,
        createdAt: createdAt + n++,
        packId: pack.id,
        ...(tags ? { tags } : {}),
        ...(cefr ? { cefr } : {}),
        ...(synonyms ? { synonyms } : {}),
        ...(collocations ? { collocations } : {}),
        ...(family ? { family } : {})
      })
    }
  })
  return { topics, words: [...byId.values()], skipped }
}

/** Đếm số từ theo CEFR (từ không có cấp độ tính vào "?"). */
export function cefrBreakdown(words: readonly Pick<Word, 'cefr'>[]): Record<Cefr | '?', number> {
  const out = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0, '?': 0 }
  for (const w of words) out[w.cefr ?? '?']++
  return out
}
