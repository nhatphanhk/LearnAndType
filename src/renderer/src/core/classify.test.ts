import { describe, expect, it } from 'vitest'
import type { Topic, Word } from '@/types'
import {
  CATEGORIES,
  buildClassifier,
  buildTargetOptions,
  categorize,
  newTarget,
  normalizeName,
  targetKey,
  topicCategory
} from './classify'

const topic = (id: string, name: string, nameEn = ''): Topic => ({
  id,
  name,
  nameEn,
  emoji: '',
  isBuiltIn: false,
  order: 0,
  createdAt: 0
})

const word = (topicId: string, w: string, meaningVi = ''): Word => ({
  id: `${topicId}:${w}`,
  topicId,
  word: w,
  meaningVi,
  ipa: '',
  partOfSpeech: '',
  emoji: '',
  example: '',
  exampleVi: '',
  isBuiltIn: false,
  createdAt: 0
})

const ZEBRA_DEF = ['An African animal, Equus zebra, related to the horse, with black and white stripes.']
const INVOICE_DEF = ['A bill; a commercial document issued by a seller to a buyer.', 'The lot or set of goods as shipped.']
const PRINTER_DEF = ['A device that prints text or images on paper.']

describe('CATEGORIES', () => {
  it('12 chủ đề đầu trùng id / tên với chủ đề có sẵn, id không trùng nhau', () => {
    expect(CATEGORIES.find((c) => c.id === 'animals')).toMatchObject({ name: 'Động vật', emoji: '🐾' })
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length)
    expect(CATEGORIES.length).toBeGreaterThanOrEqual(20)
  })
})

describe('categorize', () => {
  it('từ có sẵn trong app', () => {
    expect(categorize({ word: 'cat', meaningVi: '' })?.id).toBe('animals')
    expect(categorize({ word: 'Banana', meaningVi: '' })?.id).toBe('fruits')
  })

  it('đoán qua định nghĩa tiếng Anh và chính từ đó', () => {
    expect(categorize({ word: 'zebra', meaningVi: '', definitions: ZEBRA_DEF })?.id).toBe('animals')
    expect(categorize({ word: 'invoice', meaningVi: '', definitions: INVOICE_DEF })?.id).toBe('business')
    expect(categorize({ word: 'laptop', meaningVi: '' })?.id).toBe('technology')
    expect(categorize({ word: 'deadline', meaningVi: '' })?.id).toBe('office')
  })

  it('đoán offline qua nghĩa tiếng Việt (cả kiểu bỏ dấu cũ / mới)', () => {
    expect(categorize({ word: 'okapi', meaningVi: 'con hươu đùi vằn' })?.id).toBe('animals')
    expect(categorize({ word: 'receivable', meaningVi: 'hóa đơn phải thu' })?.id).toBe('business')
    expect(categorize({ word: 'receivable', meaningVi: 'hoá đơn phải thu' })?.id).toBe('business')
    expect(categorize({ word: 'fever', meaningVi: 'cơn sốt' })?.id).toBe('health')
    expect(categorize({ word: 'nephew', meaningVi: 'cháu trai' })?.id).toBe('family')
  })

  it('cụm từ dài hơn thắng từ ngắn: "con trai" là gia đình, không phải động vật', () => {
    expect(categorize({ word: 'son', meaningVi: 'con trai' })?.id).toBe('family')
  })

  it('không đủ bằng chứng thì trả null', () => {
    expect(categorize({ word: 'serendipity', meaningVi: 'sự tình cờ may mắn' })).toBeNull()
  })

  it('ưu tiên chủ đề mẫu đã có chủ đề của người dùng khi điểm sát nhau', () => {
    expect(categorize({ word: 'printer', meaningVi: '', definitions: PRINTER_DEF })?.id).toBe('technology')
    expect(categorize({ word: 'printer', meaningVi: '', definitions: PRINTER_DEF }, new Set(['office']))?.id).toBe('office')
  })
})

describe('topicCategory', () => {
  it('khớp theo tên chủ đề (bỏ dấu, không phân biệt hoa thường)', () => {
    expect(topicCategory(topic('t', 'Văn phòng'))).toBe('office')
    expect(topicCategory(topic('t', 'Từ vựng công nghệ'))).toBe('technology')
    expect(topicCategory(topic('t', 'Tuần 3', 'Animals'))).toBe('animals')
  })

  it('không khớp tên thì theo đa số từ bên trong (cần ít nhất 3 từ)', () => {
    const words = ['cat', 'dog', 'rabbit', 'laptop'].map((x) => word('t', x))
    expect(topicCategory(topic('t', 'Tuần 3'), words)).toBe('animals')
    expect(topicCategory(topic('t', 'Tuần 3'), words.slice(0, 2))).toBeNull()
    expect(topicCategory(topic('t', 'Luyện nghe'))).toBeNull()
  })
})

describe('buildClassifier', () => {
  const office = topic('t-office', 'Văn phòng')
  const misc = topic('t-misc', 'Linh tinh')
  const other = topic('t-other', 'Từ vựng khác')
  const ctx = {
    topics: [office, misc, other],
    wordsByTopic: new Map([
      ['t-office', [word('t-office', 'printer', 'máy in')]],
      ['t-misc', ['lion', 'tiger', 'bear', 'elephant'].map((x) => word('t-misc', x))],
      ['t-other', []]
    ]),
    fallback: newTarget('Chưa phân loại')
  }
  const c = buildClassifier(ctx)

  it('ánh xạ chủ đề mẫu sang chủ đề của người dùng', () => {
    expect(c.categoryTopic.get('office')).toBe('t-office')
    expect(c.categoryTopic.get('animals')).toBe('t-misc')
  })

  it('thứ tự ưu tiên: cột CSV > từ đã có > chủ đề của tôi > chủ đề mẫu > dự phòng', () => {
    expect(c.suggest({ word: 'anything', meaningVi: '', topic: 'văn PHÒNG' })).toEqual({
      target: { kind: 'topic', topicId: 't-office' },
      reason: 'csv'
    })
    expect(c.suggest({ word: 'x', meaningVi: '', topic: 'IELTS tuần 1' }).target).toMatchObject({ kind: 'new', name: 'IELTS tuần 1' })
    expect(c.suggest({ word: 'Printer', meaningVi: '' })).toMatchObject({ reason: 'existing', target: { topicId: 't-office' } })
    expect(c.suggest({ word: 'stapler', meaningVi: 'cái dập ghim' })).toMatchObject({ reason: 'mine', target: { topicId: 't-office' } })
    expect(c.suggest({ word: 'zebra', meaningVi: '', definitions: ZEBRA_DEF })).toMatchObject({
      reason: 'mine',
      target: { topicId: 't-misc' }
    })
    expect(c.suggest({ word: 'invoice', meaningVi: '', definitions: INVOICE_DEF })).toMatchObject({
      reason: 'template',
      categoryId: 'business',
      target: { kind: 'new', name: 'Kinh doanh & tài chính', emoji: '💰' }
    })
    expect(c.suggest({ word: 'serendipity', meaningVi: 'sự tình cờ' })).toEqual({
      target: { kind: 'new', name: 'Chưa phân loại', nameEn: '', emoji: '', description: '' },
      reason: 'fallback'
    })
  })

  it('chủ đề "mới" trùng tên chủ đề đã có thì dùng chủ đề đó', () => {
    const c2 = buildClassifier({ ...ctx, fallback: newTarget('từ vựng KHÁC') })
    expect(c2.suggest({ word: 'serendipity', meaningVi: '' }).target).toEqual({ kind: 'topic', topicId: 't-other' })
  })

  it('targetKey gộp được tên mới viết khác hoa thường / dấu', () => {
    expect(targetKey(newTarget('Kinh doanh'))).toBe(targetKey(newTarget('kinh DOANH')))
    expect(targetKey({ kind: 'topic', topicId: 'a' })).toBe('topic:a')
    expect(normalizeName('  Đồ ăn & thức uống ')).toBe('do an thuc uong')
  })
})

describe('buildTargetOptions', () => {
  it('chủ đề của tôi (trừ exclude) + chủ đề mẫu; chủ đề mới trùng tên được gộp', () => {
    const topics = [topic('a', 'Văn phòng'), topic('b', 'Từ vựng khác')]
    const classifier = buildClassifier({ topics, wordsByTopic: new Map(), fallback: newTarget('Từ vựng khác') })
    const opts = buildTargetOptions({ classifier, topics, exclude: 'b', extra: [newTarget('văn PHÒNG'), newTarget('Riêng')], withCategories: true })
    expect(opts.has('topic:a')).toBe(true)
    expect(opts.has('topic:b')).toBe(false)
    expect(opts.has('new:van phong')).toBe(false)
    expect(opts.get('new:rieng')?.isNew).toBe(true)
    expect([...opts.values()].filter((o) => o.isNew)).toHaveLength(1 + CATEGORIES.length)
  })
})
