/**
 * Trắc nghiệm 4 đáp án kiểu TOEIC Part 5: câu có chỗ trống (hoặc nghĩa tiếng Việt nếu từ không có câu ví dụ).
 * Phương án nhiễu ưu tiên: dạng khác trong họ từ (decide / decision / decisive — đúng bẫy Part 5),
 * rồi từ cùng loại từ trong cùng nhóm, rồi từ bất kỳ.
 */
import { shuffle, type Rng } from './queue'
import { makeCloze } from './typing'
import type { Word } from '@/types'

export const CHOICE_COUNT = 4

const norm = (s: string): string => s.trim().toLowerCase()
/** "n, v" → ["n", "v"] */
const posSet = (pos: string): Set<string> => new Set(pos.split(/[,/;]\s*/).map(norm).filter(Boolean))

/** Họ từ có thể ghi kèm chú thích "invoice (v)" → chỉ lấy phần chữ. */
const cleanForm = (s: string): string => s.replace(/\s*\(.*?\)\s*/g, '').trim()

export function makeChoices(word: Word, pool: readonly Word[], rng: Rng = Math.random, count = CHOICE_COUNT): string[] {
  const answer = word.word
  const banned = new Set([norm(answer), ...(word.synonyms ?? []).map(norm)])
  const picked: string[] = []
  const add = (s: string): void => {
    const k = norm(s)
    if (!s || banned.has(k) || picked.length >= count - 1) return
    banned.add(k)
    picked.push(s)
  }

  // Chỗ trống có hậu tố (analys|ed) → dạng khác của họ từ ghép hậu tố sẽ vô nghĩa, bỏ qua
  const cloze = makeCloze(word.example, word.word)
  if (!cloze?.suffix) {
    for (const f of shuffle(word.family ?? [], rng)) {
      const form = cleanForm(f)
      if (form && !/\s/.test(form)) add(form)
    }
  }
  const pos = posSet(word.partOfSpeech)
  const others = shuffle(
    pool.filter((w) => w.id !== word.id),
    rng
  )
  const samePos = others.filter((w) => pos.size > 0 && [...posSet(w.partOfSpeech)].some((p) => pos.has(p)))
  for (const w of samePos) add(w.word)
  for (const w of others) add(w.word)
  return shuffle([answer, ...picked], rng)
}

export function isChoiceCorrect(answer: string, option: string): boolean {
  return norm(option) === norm(answer)
}
