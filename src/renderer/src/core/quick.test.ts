import { describe, expect, it } from 'vitest'
import { formatAccelerator, pickLookupTerm, toAccelerator } from './quick'

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
