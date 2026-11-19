import { describe, expect, it } from 'vitest'
import { cefrBreakdown, isPackFile, packEntities, packWordId } from './packs'
import { samplePack } from './packs.fixture'


describe('isPackFile', () => {
  it('nhận gói hợp lệ, từ chối file khác', () => {
    expect(isPackFile(samplePack())).toBe(true)
    expect(isPackFile({ ...samplePack(), app: 'LearnAndType' })).toBe(false)
    expect(isPackFile({ ...samplePack(), id: 'Có dấu' })).toBe(false)
    expect(isPackFile(null)).toBe(false)
  })
})

describe('packEntities', () => {
  it('tạo id ổn định, bỏ từ thiếu nghĩa, gộp từ trùng', () => {
    const { topics, words, skipped } = packEntities(samplePack())
    expect(topics.map((t) => t.id)).toEqual(['pack-toeic-office', 'pack-toeic-finance'])
    expect(topics.every((t) => t.isBuiltIn && t.packId === 'toeic')).toBe(true)
    expect(skipped).toBe(1)
    expect(words.map((w) => w.id)).toEqual([packWordId('toeic', 'agenda'), 'pack-toeic:deadline', 'pack-toeic:invoice'])
    const agenda = words[0]
    expect(agenda.topicId).toBe('pack-toeic-office')
    expect(agenda.cefr).toBe('B2')
    expect(agenda.synonyms).toEqual(['schedule'])
    expect(agenda.tags).toEqual(['toeic', 'barrons'])
    expect(words[2].family).toEqual(['invoice (v)'])
    expect(words[1]).not.toHaveProperty('synonyms')
  })

  it('đếm theo CEFR', () => {
    const { words } = packEntities(samplePack())
    expect(cefrBreakdown(words)).toMatchObject({ B2: 2, C1: 1, '?': 0 })
  })
})
