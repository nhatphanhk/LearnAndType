import { describe, expect, it } from 'vitest'
import {
  calcAccuracy,
  calcWpm,
  classifyKeystroke,
  compareChars,
  countMistakes,
  isMatch,
  makeCloze,
  nextHint,
  normalize
} from './typing'

describe('normalize / isMatch', () => {
  it('bỏ khoảng trắng thừa và không phân biệt hoa thường', () => {
    expect(normalize('  Ice   Cream ')).toBe('ice cream')
    expect(isMatch('ice cream', 'ICE  cream ')).toBe(true)
  })
  it('thống nhất dấu nháy cong', () => {
    expect(isMatch("mother's day", 'mother’s day')).toBe(true)
  })
  it('phân biệt hoa thường khi bật caseSensitive', () => {
    expect(isMatch('Monday', 'monday', true)).toBe(false)
    expect(isMatch('Monday', 'Monday', true)).toBe(true)
  })
})

describe('compareChars', () => {
  it('tô màu đúng/sai/chưa gõ/thừa', () => {
    expect(compareChars('cat', 'cu').map((c) => c.state)).toEqual(['correct', 'wrong', 'pending'])
    expect(compareChars('cat', 'cats').map((c) => c.state)).toEqual(['correct', 'correct', 'correct', 'extra'])
  })
})

describe('countMistakes', () => {
  it('đếm ký tự sai, thiếu và thừa', () => {
    expect(countMistakes('cat', 'cat')).toBe(0)
    expect(countMistakes('cat', 'cot')).toBe(1)
    expect(countMistakes('cat', 'ca')).toBe(1)
    expect(countMistakes('cat', 'catss')).toBe(2)
  })
})

describe('classifyKeystroke', () => {
  it('phân loại ký tự vừa thêm', () => {
    expect(classifyKeystroke('cat', 'c', 'ca')).toEqual({ correct: 1, wrong: 0 })
    expect(classifyKeystroke('cat', 'c', 'cx')).toEqual({ correct: 0, wrong: 1 })
    expect(classifyKeystroke('cat', 'cat', 'cats')).toEqual({ correct: 0, wrong: 1 })
  })
  it('bỏ qua thao tác xóa', () => {
    expect(classifyKeystroke('cat', 'ca', 'c')).toBeNull()
  })
})

describe('nextHint', () => {
  it('giữ phần đúng và thêm 1 ký tự', () => {
    expect(nextHint('elephant', '')).toBe('e')
    expect(nextHint('elephant', 'ele')).toBe('elep')
    expect(nextHint('elephant', 'elx')).toBe('ele')
    expect(nextHint('cat', 'cat')).toBe('cat')
  })
})

describe('calcWpm / calcAccuracy', () => {
  it('tính WPM theo chuẩn 5 ký tự', () => {
    expect(calcWpm(50, 60000)).toBe(10)
    expect(calcWpm(10, 500)).toBe(0)
  })
  it('tính độ chính xác', () => {
    expect(calcAccuracy(9, 10)).toBe(90)
    expect(calcAccuracy(0, 0)).toBe(100)
  })
})

describe('makeCloze', () => {
  it('thay từ trong câu bằng chỗ trống', () => {
    expect(makeCloze('The cat is sleeping.', 'cat')).toEqual({ before: 'The ', after: ' is sleeping.', suffix: '' })
  })
  it('giữ lại hậu tố số nhiều / chia động từ', () => {
    expect(makeCloze('I have two cats.', 'cat')).toEqual({ before: 'I have two ', after: '.', suffix: 's' })
    expect(makeCloze('She is cooking dinner.', 'cook')?.suffix).toBe('ing')
  })
  it('không khớp một phần của từ khác', () => {
    expect(makeCloze('The category is new.', 'cat')).toBeNull()
  })
  it('không phân biệt hoa thường và hỗ trợ cụm từ', () => {
    expect(makeCloze('Ice cream is cold.', 'ice cream')?.after).toBe(' is cold.')
  })
})
