import { describe, expect, it } from 'vitest'
import { classifyMistake, mistakeReport } from './mistakes'
import { wrongKeyPairs } from './typing'
import type { Attempt } from '@/types'

describe('classifyMistake', () => {
  it.each([
    ['address', 'adress', 'double-letter'],
    ['until', 'untill', 'double-letter'],
    ['receive', 'recieve', 'ie-ei'],
    ['friend', 'freind', 'ie-ei'],
    ['knife', 'nife', 'silent-letter'],
    ['listen', 'lisen', 'silent-letter'],
    ['climb', 'clim', 'silent-letter'],
    ['separate', 'seperate', 'vowel'],
    ['form', 'from', 'transposition'],
    ['information', 'informasion', 'suffix'],
    ['important', 'importent', 'suffix'],
    ['possible', 'possable', 'suffix'],
    ['table', 'tble', 'missing'],
    ['cat', 'cart', 'extra'],
    ['elephant', '', 'forgot'],
    ['elephant', 'dog', 'forgot'],
    ['house', 'horse', 'other']
  ] as const)('%s ← %s = %s', (target, typed, kind) => {
    expect(classifyMistake(target, typed)).toBe(kind)
  })

  it('không phân biệt hoa thường và khoảng trắng', () => {
    expect(classifyMistake('Address', ' ADRESS ')).toBe('double-letter')
  })
})

describe('wrongKeyPairs', () => {
  it('ghi cặp đúng>gõ cho ký tự mới', () => {
    expect(wrongKeyPairs('cat', 'c', 'ce')).toEqual(['a>e'])
    expect(wrongKeyPairs('cat', 'cat', 'cats')).toEqual(['>s'])
    expect(wrongKeyPairs('cat', 'ca', 'c')).toEqual([])
    expect(wrongKeyPairs('cat', '', 'cA')).toEqual([])
  })
})

describe('mistakeReport', () => {
  const words: Record<string, string> = { a: 'address', b: 'receive', c: 'cat' }
  const att = (wordId: string, answer: string | undefined, at: number, extra: Partial<Attempt> = {}): Attempt => ({
    sessionId: 1,
    wordId,
    topicId: 't',
    mode: 'recall',
    correct: answer === undefined,
    hinted: false,
    errors: 1,
    durationMs: 1000,
    at,
    ...(answer !== undefined ? { answer } : {}),
    ...extra
  })

  it('gom theo kiểu lỗi, sắp theo số lần', () => {
    const r = mistakeReport(
      [
        att('a', 'adress', 1, { wrongKeys: ['d>r', 'd>r'] }),
        att('a', 'addres', 2),
        att('b', 'recieve', 3, { wrongKeys: ['e>i'] }),
        att('c', undefined, 4, { wrongKeys: ['>s'] }),
        att('zz', 'whatever', 5)
      ],
      (id) => words[id]
    )
    expect(r.total).toBe(3)
    expect(r.groups.map((g) => [g.kind, g.count, g.wordIds])).toEqual([
      ['double-letter', 2, ['a']],
      ['ie-ei', 1, ['b']]
    ])
    expect(r.groups[0].example).toEqual({ wordId: 'a', typed: 'addres' })
    expect(r.keys).toEqual([
      { expected: 'd', typed: 'r', count: 2 },
      { expected: 'e', typed: 'i', count: 1 },
      { expected: '', typed: 's', count: 1 }
    ])
  })
})
