import { describe, expect, it } from 'vitest'
import { buildWordInfo, extrasForSave, findExisting, formatAccelerator, pickLookupTerm, reasonLabel, toAccelerator } from './quick'

describe('pickLookupTerm', () => {
  it.each([
    ['  Elephant. ', 'elephant'],
    ['"look forward to"', 'look forward to'],
    ['don’t', "don't"],
    ['well-known', 'well-known'],
    ['The quick brown fox jumps over the lazy dog', 'the'],
    ['mèo: cat', 'cat'],
    ['(apple),', 'apple'],
    ['123 !!', ''],
    ['', '']
  ])('%j → %j', (raw, term) => {
    expect(pickLookupTerm(raw)).toBe(term)
  })
})

describe('toAccelerator', () => {
  const ev = (key: string, mods: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', boolean>> = {}, code?: string) => ({
    key,
    code,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...mods
  })

  it('ghép phím bổ trợ + phím chính', () => {
    expect(toAccelerator(ev('L', { ctrlKey: true, shiftKey: true }, 'KeyL'))).toBe('CommandOrControl+Shift+L')
    expect(toAccelerator(ev('!', { altKey: true, shiftKey: true }, 'Digit1'))).toBe('Alt+Shift+1')
    expect(toAccelerator(ev('F8', { ctrlKey: true }))).toBe('CommandOrControl+F8')
    expect(toAccelerator(ev(' ', { altKey: true }))).toBe('Alt+Space')
  })

  it('bỏ qua phím bổ trợ đơn lẻ và phím không có Ctrl/Alt/Win', () => {
    expect(toAccelerator(ev('Control', { ctrlKey: true }))).toBeNull()
    expect(toAccelerator(ev('l', { shiftKey: true }, 'KeyL'))).toBeNull()
  })

  it('formatAccelerator', () => {
    expect(formatAccelerator('CommandOrControl+Shift+L')).toBe('Ctrl + Shift + L')
    expect(formatAccelerator('Super+Alt+K')).toBe('Win + Alt + K')
  })
})

describe('findExisting', () => {
  const words = [
    { id: '1', word: 'Invoice', topicId: 'a' },
    { id: '2', word: 'invoice ', topicId: 'b' },
    { id: '3', word: 'deadline', topicId: 'a' }
  ]
  it('khớp không phân biệt hoa thường, theo chữ đã copy lẫn dạng gốc', () => {
    expect(findExisting(words, ['invoices', 'invoice']).map((w) => w.id)).toEqual(['1', '2'])
    expect(findExisting(words, ['DEADLINE']).map((w) => w.id)).toEqual(['3'])
  })
  it('không có chữ nào → rỗng', () => {
    expect(findExisting(words, ['', '  '])).toEqual([])
    expect(findExisting(words, ['budget'])).toEqual([])
  })
})

describe('reasonLabel', () => {
  it('nói rõ khi sẽ tạo chủ đề mới', () => {
    expect(reasonLabel('template', true)).toContain('tạo chủ đề mới')
    expect(reasonLabel('template', false)).not.toContain('tạo chủ đề mới')
    expect(reasonLabel('exam', true)).toContain('TOEIC')
    expect(reasonLabel('fallback', true)).toContain('Chưa đoán được')
  })
})

describe('buildWordInfo / extrasForSave', () => {
  const dict = {
    word: 'negotiate',
    ipa: '',
    partOfSpeech: 'v',
    example: '',
    definitions: [],
    audio: {},
    senses: [
      { pos: 'v', definitions: [{ definition: 'To confer.', example: 'They negotiated a deal.' }], synonyms: ['Bargain', 'discuss'], antonyms: ['refuse'] }
    ]
  }
  const pack = { word: 'negotiate', meaningVi: 'đàm phán', synonyms: ['bargain'], collocations: ['negotiate a contract'], family: ['negotiation'], example: 'We must negotiate.', exampleVi: 'Chúng ta phải đàm phán.' }

  it('gộp nguồn, bỏ trùng, ví dụ có dịch đứng trước', () => {
    const info = buildWordInfo({ word: 'negotiate', dict, pack })
    expect(info.synonyms).toEqual(['bargain', 'discuss'])
    expect(info.antonyms).toEqual(['refuse'])
    expect(info.collocations).toEqual(['negotiate a contract'])
    expect(info.examples).toEqual([{ en: 'We must negotiate.', vi: 'Chúng ta phải đàm phán.' }, { en: 'They negotiated a deal.' }])
  })

  it('extrasForSave bỏ mục rỗng, lấy CEFR và nhãn kỳ thi', () => {
    const info = buildWordInfo({ word: 'x' })
    expect(extrasForSave(info)).toEqual({})
    expect(extrasForSave(buildWordInfo({ word: 'negotiate', pack }), { cefr: 'B2', exams: ['toeic'] })).toEqual({
      synonyms: ['bargain'],
      collocations: ['negotiate a contract'],
      family: ['negotiation'],
      cefr: 'B2',
      tags: ['toeic']
    })
  })
})
