import { describe, expect, it } from 'vitest'
import { builtinEntities, BUILTIN_TOPICS } from './index'
import { makeCloze } from '@/core/typing'

describe('dữ liệu có sẵn', () => {
  const { topics, words } = builtinEntities()

  it('có 12 chủ đề, mỗi chủ đề 20 từ', () => {
    expect(topics).toHaveLength(12)
    for (const t of BUILTIN_TOPICS) expect(t.words, t.id).toHaveLength(20)
  })

  it('id chủ đề và id từ là duy nhất', () => {
    expect(new Set(topics.map((t) => t.id)).size).toBe(topics.length)
    expect(new Set(words.map((w) => w.id)).size).toBe(words.length)
  })

  it('mỗi từ có đủ thông tin cơ bản', () => {
    for (const w of words) {
      expect(w.word.trim(), w.id).not.toBe('')
      expect(w.meaningVi.trim(), w.id).not.toBe('')
      expect(w.emoji.trim(), w.id).not.toBe('')
      expect(w.ipa, w.id).toMatch(/^\/.+\/$/)
      expect(w.exampleVi.trim(), w.id).not.toBe('')
    }
  })

  it('câu ví dụ nào cũng chứa từ để dùng cho chế độ Điền vào câu', () => {
    const missing = words.filter((w) => makeCloze(w.example, w.word) === null).map((w) => w.id)
    expect(missing).toEqual([])
  })
})
