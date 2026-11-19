import { describe, expect, it } from 'vitest'
import { buildDrillQueue, canDrill, drillOptions, familyForms, parseFamily, usableCollocations } from './drill'
import type { Word } from '@/types'

const w = (word: string, extra: Partial<Word> = {}): Word => ({
  id: word,
  topicId: 't',
  word,
  ipa: '',
  partOfSpeech: 'n',
  meaningVi: word,
  emoji: '',
  example: '',
  exampleVi: '',
  isBuiltIn: true,
  createdAt: 0,
  ...extra
})

const decide = w('decide', {
  partOfSpeech: 'v',
  family: ['decision (n)', 'decisive (adj)', 'decide (v)', 'no pos'],
  synonyms: ['determine', 'make up your mind'],
  collocations: ['decide on', 'decide to do something', 'final']
})
const pool = [decide, w('budget'), w('invoice'), w('deadline', { synonyms: ['determine'] }), w('memo'), w('agenda')]

describe('parseFamily', () => {
  it('đọc "dạng (loại từ)"', () => {
    expect(parseFamily('decision (n)')).toEqual({ form: 'decision', pos: 'n' })
    expect(parseFamily('decisively (adv.)')).toEqual({ form: 'decisively', pos: 'adv' })
    expect(parseFamily('decision')).toBeNull()
    expect(parseFamily('look up (v)')).toBeNull()
  })

  it('bỏ dạng trùng chính từ đó và dạng thiếu loại từ', () => {
    expect(familyForms(decide).map((f) => f.form)).toEqual(['decision', 'decisive'])
  })
})

describe('drillOptions', () => {
  it('tạo đủ 3 dạng bài khi có dữ liệu', () => {
    const opts = drillOptions(decide, pool)
    const fam = opts.find((o) => o.mode === 'family')!
    expect(['decision', 'decisive']).toContain(fam.answer)
    expect(fam.prompt === 'n' || fam.prompt === 'adj').toBe(true)

    const syn = opts.find((o) => o.mode === 'synonym')!
    expect(syn.answer).toBe('determine') // cụm nhiều từ bị bỏ
    expect(syn.options).toContain('determine')
    expect(syn.options).toHaveLength(4)
    // "deadline" có đồng nghĩa "determine" → không được làm phương án nhiễu
    expect(syn.options).not.toContain('deadline')
    expect(syn.options).not.toContain('decide')

    const col = opts.find((o) => o.mode === 'collocation')!
    expect(usableCollocations(decide)).toContain(col.prompt)
    expect(col.answer).toBeUndefined()
  })

  it('từ không có dữ liệu luyện thì không tạo lượt', () => {
    expect(canDrill(w('memo'))).toBe(false)
    expect(drillOptions(w('memo'), pool)).toEqual([])
    expect(canDrill(decide)).toBe(true)
  })
})

const L = (i: number): string => String.fromCharCode(97 + i)

describe('buildDrillQueue', () => {
  it('mỗi từ một lượt, xoay vòng dạng bài, bỏ từ không luyện được', () => {
    const many = Array.from({ length: 6 }, (_, i) =>
      w(`word${L(i)}`, { family: [`form${L(i)} (n)`], synonyms: [`syn${L(i)}`], collocations: [`make a word${L(i)}`] })
    )
    const q = buildDrillQueue([...many, w('memo')], [...many, ...pool])
    expect(q).toHaveLength(6)
    expect(new Set(q.map((x) => x.mode))).toEqual(new Set(['family', 'synonym', 'collocation']))
  })
})
