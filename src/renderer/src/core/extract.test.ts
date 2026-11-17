import { describe, expect, it } from 'vitest'
import { extractVocab, lemmaCandidates, pluralBases, splitSentences } from './extract'
import { makeCloze } from './typing'

const PASSAGE = `Sarah works at a large company in London. Every morning Sarah checks her emails and prepares a short report.
The company's managers want to negotiate a new contract with suppliers. Negotiations usually take weeks, but the deadline is Friday!
She thinks the contract is crucial for the company. NASA isn't involved, obviously. Each supplier has different requirements.`

describe('splitSentences', () => {
  it('tách theo dấu câu và xuống dòng', () => {
    expect(splitSentences('Hello there. How are you?\nFine!  "Great." Ok')).toEqual([
      'Hello there.',
      'How are you?',
      'Fine!',
      '"Great."',
      'Ok'
    ])
  })
})

describe('extractVocab', () => {
  const words = extractVocab(PASSAGE).map((c) => c.word)

  it('bỏ từ cơ bản, tên riêng, chữ viết tắt và dạng rút gọn', () => {
    for (const w of ['the', 'works', 'large', 'every', 'morning', 'she', 'sarah', 'london', 'friday', 'nasa', 'isn', 'want']) {
      expect(words).not.toContain(w)
    }
  })

  it('giữ từ đáng học theo thứ tự xuất hiện', () => {
    expect(words).toEqual(
      expect.arrayContaining(['company', 'checks', 'emails', 'prepares', 'report', 'managers', 'negotiate', 'contract', 'deadline', 'crucial'])
    )
    expect(words.indexOf('company')).toBeLessThan(words.indexOf('negotiate'))
    expect(words.indexOf('negotiate')).toBeLessThan(words.indexOf('crucial'))
  })

  it('gộp số nhiều vào số ít và đếm số lần xuất hiện', () => {
    const r = extractVocab(PASSAGE)
    expect(words).not.toContain('suppliers')
    expect(r.find((c) => c.word === 'supplier')?.count).toBe(2)
    // "company's" được tính là "company"
    expect(r.find((c) => c.word === 'company')?.count).toBe(3)
  })

  it('câu ví dụ là câu đầu tiên chứa từ và dùng được cho chế độ Điền vào câu', () => {
    const r = extractVocab(PASSAGE)
    const contract = r.find((c) => c.word === 'contract')!
    expect(contract.sentence).toBe("The company's managers want to negotiate a new contract with suppliers.")
    for (const c of r) expect(makeCloze(c.sentence, c.word), c.word).not.toBeNull()
  })

  it('bỏ từ đã có trong chủ đề (kể cả dạng số nhiều)', () => {
    const r = extractVocab(PASSAGE, { exclude: new Set(['contract', 'email']) }).map((c) => c.word)
    expect(r).not.toContain('contract')
    expect(r).not.toContain('emails')
    expect(r).toContain('deadline')
  })

  it('giới hạn số từ, ưu tiên từ xuất hiện nhiều', () => {
    const r = extractVocab('The turbine and the turbine engine. An engine, another engine, a valve.', { max: 2 })
    expect(r.map((c) => [c.word, c.count])).toEqual([
      ['turbine', 2],
      ['engine', 3]
    ])
  })

  it('rút gọn câu quá dài nhưng vẫn giữ từ', () => {
    const long = `${'Lorem ipsum dolor sit amet '.repeat(12)}the turbine failed ${'consectetur adipiscing elit '.repeat(10)}.`
    const [c] = extractVocab(long, { exclude: new Set(['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit', 'failed']) })
    expect(c.word).toBe('turbine')
    expect(c.sentence.length).toBeLessThanOrEqual(202)
    expect(c.sentence).toContain('turbine')
  })
})

describe('lemmaCandidates', () => {
  it('sinh dạng gốc để tra từ điển', () => {
    expect(pluralBases('studies')).toEqual(['study', 'studie'])
    expect(pluralBases('boxes')[0]).toBe('box')
    expect(pluralBases('class')).toEqual([])
    expect(lemmaCandidates('stopped')).toContain('stop')
    expect(lemmaCandidates('liked')).toContain('like')
    expect(lemmaCandidates('negotiating')).toContain('negotiate')
    expect(lemmaCandidates('running')).toContain('run')
  })
})
