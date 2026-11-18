import { describe, expect, it } from 'vitest'
import data from '@/data/wordnet-topics.json'
import { CATEGORIES, buildClassifier, categorize, newTarget } from './classify'
import { parseWordnetFile, wordnetTopicOf, type WordnetFile } from './wordnet'

const small = parseWordnetFile({ c: ['law', 'business', 'arts'], w: { verdict: 0, 'credit card': 1, card: 1, violin: 2 } })

describe('wordnetTopicOf', () => {
  it('khớp nguyên dạng, dạng gốc và chữ cuối của cụm', () => {
    expect(wordnetTopicOf(small, ' Verdict ')).toEqual({ topic: 'law', exact: true })
    expect(wordnetTopicOf(small, 'verdicts')).toEqual({ topic: 'law', exact: true })
    expect(wordnetTopicOf(small, 'credit  cards')).toEqual({ topic: 'business', exact: true })
    expect(wordnetTopicOf(small, 'electric violin')).toEqual({ topic: 'arts', exact: false })
    expect(wordnetTopicOf(small, 'however')).toBeNull()
    expect(wordnetTopicOf(small, '')).toBeNull()
  })
})

describe('categorize + WordNet', () => {
  it('từ trước đây không đoán được nay vào đúng chủ đề; không có WordNet thì như cũ', () => {
    expect(categorize({ word: 'verdict', meaningVi: 'phán quyết' })).toBeNull()
    expect(categorize({ word: 'verdict', meaningVi: 'phán quyết' }, undefined, small)?.id).toBe('law')
    // Khớp chữ cuối chỉ +2: vẫn đủ ngưỡng khi không có bằng chứng khác
    expect(categorize({ word: 'electric violin', meaningVi: 'x' }, undefined, small)?.id).toBe('arts')
  })

  it('bộ phân loại dùng WordNet thay vì rơi vào chủ đề dự phòng', () => {
    const ctx = { topics: [], wordsByTopic: new Map(), fallback: newTarget('Từ vựng khác') }
    expect(buildClassifier(ctx).suggest({ word: 'verdict', meaningVi: 'phán quyết' }).reason).toBe('fallback')
    const s = buildClassifier({ ...ctx, wordnet: small }).suggest({ word: 'verdict', meaningVi: 'phán quyết' })
    expect(s.reason).toBe('template')
    expect(s.categoryId).toBe('law')
  })
})

describe('wordnet-topics.json (file sinh sẵn)', () => {
  const file = data as unknown as WordnetFile
  const map = parseWordnetFile(file)

  it('đúng cấu trúc, mọi chủ đề đều là chủ đề mẫu, đủ lớn', () => {
    const ids = new Set(CATEGORIES.map((c) => c.id))
    expect(file.c.every((c) => ids.has(c))).toBe(true)
    expect(map.size).toBeGreaterThan(50_000)
  })

  it('xếp đúng vài từ chắc chắn', () => {
    const expected: Record<string, string> = {
      zebra: 'animals',
      pneumonia: 'health',
      trousers: 'clothes',
      violin: 'arts',
      verdict: 'law',
      mortgage: 'business',
      glacier: 'nature',
      sibling: 'family',
      photosynthesis: 'science'
    }
    for (const [w, t] of Object.entries(expected)) expect([w, map.get(w)]).toEqual([w, t])
  })
})
