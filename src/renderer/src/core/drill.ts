/**
 * Luyện chuyên sâu cho từ luyện thi (dữ liệu từ gói TOEIC / IELTS):
 *   - family:      cho từ gốc + loại từ cần, gõ dạng tương ứng trong họ từ (decide → n → decision);
 *   - synonym:     chọn từ đồng nghĩa trong 4 phương án (paraphrase cho IELTS);
 *   - collocation: điền từ còn thiếu trong cụm từ hay đi kèm ("meet a ___").
 */
import { shuffle, type QueueItem, type Rng } from './queue'
import { makeCloze } from './typing'
import type { PracticeMode, Word } from '@/types'

export const DRILL_MODES: readonly PracticeMode[] = ['family', 'synonym', 'collocation']

export interface FamilyForm {
  form: string
  pos: string
}

/** "decision (n)" → { form: "decision", pos: "n" }; thiếu loại từ → null (không hỏi được). */
export function parseFamily(entry: string): FamilyForm | null {
  const m = /^\s*([A-Za-z][A-Za-z' -]*?)\s*\(([a-z.]+)\)\s*$/.exec(entry)
  if (!m) return null
  const form = m[1].trim()
  const pos = m[2].replace(/\.$/, '')
  return form && !/\s/.test(form) ? { form, pos } : null
}

export function familyForms(word: Word): FamilyForm[] {
  const self = word.word.toLowerCase()
  return (word.family ?? []).flatMap((e) => {
    const f = parseFamily(e)
    return f && f.form.toLowerCase() !== self ? [f] : []
  })
}

/** Cụm từ chứa đúng từ đang học (để tạo chỗ trống), VD "meet a deadline". */
export function usableCollocations(word: Word): string[] {
  return (word.collocations ?? []).filter((c) => c.trim().includes(' ') && makeCloze(c, word.word) !== null)
}

const singleWord = (s: string): boolean => /^[A-Za-z][A-Za-z'-]*$/.test(s.trim())
export function usableSynonyms(word: Word): string[] {
  return (word.synonyms ?? []).filter(singleWord)
}

export function canDrill(word: Word): boolean {
  return familyForms(word).length > 0 || usableSynonyms(word).length > 0 || usableCollocations(word).length > 0
}

/** Các lượt có thể tạo cho một từ. */
export function drillOptions(word: Word, pool: readonly Word[], rng: Rng = Math.random): QueueItem[] {
  const base = { wordId: word.id, phase: 2 as const, retry: 0 }
  const out: QueueItem[] = []
  const fam = shuffle(familyForms(word), rng)[0]
  if (fam) out.push({ ...base, mode: 'family', answer: fam.form, prompt: fam.pos })
  const syn = shuffle(usableSynonyms(word), rng)[0]
  if (syn) {
    const banned = new Set([word.word, ...(word.synonyms ?? [])].map((s) => s.toLowerCase()))
    const distractors: string[] = []
    for (const w of shuffle(pool, rng)) {
      const k = w.word.toLowerCase()
      if (w.id === word.id || banned.has(k) || !singleWord(w.word)) continue
      // Từ nhiễu không được là đồng nghĩa của đáp án
      if ((w.synonyms ?? []).some((s) => s.toLowerCase() === syn.toLowerCase())) continue
      banned.add(k)
      distractors.push(w.word)
      if (distractors.length === 3) break
    }
    if (distractors.length >= 1) out.push({ ...base, mode: 'synonym', answer: syn, options: shuffle([syn, ...distractors], rng) })
  }
  const col = shuffle(usableCollocations(word), rng)[0]
  if (col) out.push({ ...base, mode: 'collocation', prompt: col })
  return out
}

/**
 * Hàng đợi luyện chuyên sâu: mỗi từ một lượt, xoay vòng loại bài (họ từ → đồng nghĩa → collocation)
 * để phiên có đủ các dạng; từ không có dữ liệu bị bỏ qua.
 */
export function buildDrillQueue(words: readonly Word[], pool: readonly Word[], rng: Rng = Math.random): QueueItem[] {
  const out: QueueItem[] = []
  shuffle(words, rng).forEach((w, i) => {
    const opts = drillOptions(w, pool, rng)
    if (opts.length === 0) return
    const want = DRILL_MODES[i % DRILL_MODES.length]
    out.push(opts.find((o) => o.mode === want) ?? opts[0])
  })
  return out
}
