import { describe, expect, it } from 'vitest'
import { buildExamIndex, classifyWords, examTopicName, lookupExam, summarizeClassification } from './examClassify'
import { PACK_APP, type PackFile } from './packs'
import type { Word } from '@/types'

const pack = (id: string, exam: 'toeic' | 'ielts', topics: [string, string, string[]][]): PackFile => ({
  app: PACK_APP,
  id,
  version: 1,
  name: id.toUpperCase(),
  nameEn: id,
  emoji: '📘',
  exam,
  topics: topics.map(([tid, name, words]) => ({
    id: tid,
    name,
    nameEn: tid,
    emoji: '',
    words: words.map((x) => {
      const [word, cefr] = x.split(':')
      return { word, meaningVi: word, cefr }
    })
  }))
})

const packs = [
  pack('toeic', 'toeic', [
    ['finance', 'Tài chính', ['budget:B1', 'invoice:C1']],
    ['office', 'Văn phòng', ['deadline:B2']]
  ]),
  pack('ielts', 'ielts', [['environment', 'Môi trường', ['pollution:B1', 'budget']]])
]
const levels = { cat: 'A1', budget: 'B1', analyse: 'B1' }

const word = (w: string, extra: Partial<Word> = {}): Word => ({
  id: `x:${w}`,
  topicId: 'mine',
  word: w,
  ipa: '',
  partOfSpeech: '',
  meaningVi: w,
  emoji: '',
  example: '',
  exampleVi: '',
  isBuiltIn: false,
  createdAt: 0,
  ...extra
})

describe('buildExamIndex / lookupExam', () => {
  const index = buildExamIndex(packs, levels)

  it('gộp cấp độ, kỳ thi và chủ đề', () => {
    const b = index.get('budget')!
    expect(b.cefr).toBe('B1')
    expect(b.exams.sort()).toEqual(['ielts', 'toeic'])
    expect(b.topics.map((t) => t.key)).toEqual(['toeic/finance', 'ielts/environment'])
    expect(index.get('cat')).toEqual({ cefr: 'A1', exams: [], topics: [] })
  })

  it('khớp không phân biệt hoa thường và theo dạng gốc', () => {
    expect(lookupExam(index, 'Invoices')?.cefr).toBe('C1')
    expect(lookupExam(index, 'deadlines')?.topics[0].topicId).toBe('pack-toeic-office')
    expect(lookupExam(index, 'unknownword')).toBeUndefined()
  })

  it('giữ dữ liệu đầy đủ của từ trong gói (lấy gói đầu tiên)', () => {
    const p = pack('toeic', 'toeic', [['finance', 'Tài chính', []]])
    p.topics[0].words.push({ word: 'invoice', meaningVi: 'hóa đơn', synonyms: ['bill'], example: 'Send the invoice.', exampleVi: 'Gửi hóa đơn.' })
    const idx = buildExamIndex([p, pack('ielts', 'ielts', [['x', 'X', ['invoice']]])], {})
    expect(lookupExam(idx, 'invoices')?.data).toMatchObject({ meaningVi: 'hóa đơn', synonyms: ['bill'], exampleVi: 'Gửi hóa đơn.' })
  })
})

describe('classifyWords', () => {
  const index = buildExamIndex(packs, levels)

  it('gắn CEFR + nhãn, giữ nhãn cũ, đánh dấu từ chưa xác định', () => {
    const list = classifyWords(
      [word('Budget'), word('cat', { isBuiltIn: true }), word('zebra'), word('invoice', { cefr: 'B2', tags: ['toeic'] })],
      index
    )
    expect(list[0]).toMatchObject({ cefr: 'B1', tags: ['toeic', 'ielts'], unknown: false, changed: true })
    expect(list[0].topic?.key).toBe('toeic/finance')
    expect(list[1]).toMatchObject({ cefr: 'A1', tags: [], changed: true })
    expect(list[2]).toMatchObject({ unknown: true, changed: false })
    // Đã có CEFR do người dùng nhập → giữ; nhãn đã có → không đổi
    expect(list[3]).toMatchObject({ cefr: 'B2', tags: ['toeic'], changed: false })
    expect(summarizeClassification(list)).toMatchObject({ total: 4, withCefr: 3, toeic: 2, ielts: 1, unknown: 1, changed: 2 })
    expect(examTopicName(list[0].topic!)).toBe('TOEIC · Tài chính')
  })
})
