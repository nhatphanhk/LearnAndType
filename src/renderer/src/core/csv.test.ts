import { describe, expect, it } from 'vitest'
import { parseWordsCsv, wordsToCsv } from './csv'
import type { Word } from '@/types'

describe('parseWordsCsv', () => {
  it('đọc tiếng Việt, dấu phẩy trong ngoặc kép và BOM', () => {
    const csv =
      '﻿word,meaning,ipa,example\n' + 'cat,con mèo,/kæt/,"The cat, a pet, sleeps."\n' + 'ice cream,kem,,\n'
    const r = parseWordsCsv(csv)
    expect(r.errors).toEqual([])
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({
      word: 'cat',
      meaningVi: 'con mèo',
      ipa: '/kæt/',
      example: 'The cat, a pet, sleeps.'
    })
    expect(r.rows[1]).toMatchObject({ word: 'ice cream', meaningVi: 'kem' })
  })

  it('chấp nhận tên cột tiếng Việt', () => {
    const r = parseWordsCsv('Từ,Nghĩa,Ví dụ\ndog,con chó,I love my dog.\n')
    expect(r.rows[0]).toMatchObject({ word: 'dog', meaningVi: 'con chó', example: 'I love my dog.' })
  })

  it('báo lỗi khi thiếu cột bắt buộc', () => {
    const r = parseWordsCsv('foo,bar\n1,2\n')
    expect(r.rows).toEqual([])
    expect(r.errors[0]).toContain('word')
  })

  it('bỏ qua dòng thiếu nghĩa và từ trùng', () => {
    const r = parseWordsCsv('word,meaning\ncat,con mèo\ndog,\nCat,mèo\n')
    expect(r.rows).toHaveLength(1)
    expect(r.errors).toHaveLength(2)
  })
})

describe('wordsToCsv', () => {
  it('xuất và đọc lại được', () => {
    const w: Word = {
      id: 'x',
      topicId: 't',
      word: 'apple',
      ipa: '/ˈæp.əl/',
      partOfSpeech: 'n',
      meaningVi: 'quả táo',
      emoji: '🍎',
      example: 'An apple a day, they say.',
      exampleVi: 'Mỗi ngày một quả táo.',
      isBuiltIn: false,
      createdAt: 0
    }
    const back = parseWordsCsv(wordsToCsv([w]))
    expect(back.errors).toEqual([])
    expect(back.rows[0]).toMatchObject({
      word: 'apple',
      meaningVi: 'quả táo',
      ipa: '/ˈæp.əl/',
      emoji: '🍎',
      example: 'An apple a day, they say.',
      exampleVi: 'Mỗi ngày một quả táo.'
    })
  })
})
