import { describe, expect, it } from 'vitest'
import { isChoiceCorrect, makeChoices } from './choice'
import type { Word } from '@/types'

const w = (word: string, pos: string, extra: Partial<Word> = {}): Word => ({
  id: word,
  topicId: 't',
  word,
  ipa: '',
  partOfSpeech: pos,
  meaningVi: word,
  emoji: '',
  example: '',
  exampleVi: '',
  isBuiltIn: false,
  createdAt: 0,
  ...extra
})

const pool = [w('budget', 'n'), w('invoice', 'n'), w('approve', 'v'), w('submit', 'v'), w('urgent', 'adj'), w('memo', 'n')]

describe('makeChoices', () => {
  it('4 phương án không trùng, có đáp án, ưu tiên họ từ', () => {
    const word = w('decision', 'n', {
      example: 'The manager made a final decision yesterday.',
      family: ['decide', 'decisive (adj)', 'decisively'],
      synonyms: ['choice']
    })
    for (let i = 0; i < 20; i++) {
      const c = makeChoices(word, [...pool, w('choice', 'n')])
      expect(c).toHaveLength(4)
      expect(new Set(c.map((x) => x.toLowerCase())).size).toBe(4)
      expect(c).toContain('decision')
      // Từ đồng nghĩa cũng đúng → không dùng làm phương án nhiễu
      expect(c).not.toContain('choice')
      expect(c.filter((x) => ['decide', 'decisive', 'decisively'].includes(x))).toHaveLength(3)
    }
  })

  it('không có họ từ: lấy từ cùng loại từ trước', () => {
    const word = w('agenda', 'n')
    for (let i = 0; i < 20; i++) {
      const c = makeChoices(word, [word, ...pool])
      expect(c.filter((x) => x !== 'agenda').every((x) => ['budget', 'invoice', 'memo'].includes(x))).toBe(true)
    }
  })

  it('chỗ trống có hậu tố (analys-ed) thì bỏ họ từ', () => {
    const word = w('analyse', 'v', { example: 'We analysed the data.', family: ['analysis', 'analyst'] })
    const c = makeChoices(word, pool)
    expect(c).not.toContain('analysis')
    expect(c).toContain('analyse')
  })

  it('kho ít từ: ít phương án hơn nhưng vẫn có đáp án', () => {
    expect(makeChoices(w('a', 'n'), [w('b', 'n')]).sort()).toEqual(['a', 'b'])
  })

  it('isChoiceCorrect không phân biệt hoa thường', () => {
    expect(isChoiceCorrect('Budget', 'budget')).toBe(true)
    expect(isChoiceCorrect('budget', 'memo')).toBe(false)
  })
})
