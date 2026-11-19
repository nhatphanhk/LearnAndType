import { describe, expect, it } from 'vitest'
import { cefrCeiling, planStatus, requiredWords, reviewDays, suggestedDailyAttempts, type ExamPlan } from './examPlan'
import { newProgress } from './srs'
import type { Cefr, Word, WordProgress } from '@/types'

const NOW = new Date(2026, 10, 19, 10, 0, 0).getTime()
const HOUR = 3_600_000
const word = (i: number, cefr?: Cefr): Word => ({
  id: `w${i}`,
  topicId: 't',
  word: `w${i}`,
  ipa: '',
  partOfSpeech: '',
  meaningVi: 'x',
  emoji: '',
  example: '',
  exampleVi: '',
  isBuiltIn: true,
  createdAt: i,
  ...(cefr ? { cefr } : {})
})
const learned = (id: string, at: number, mastered = false): WordProgress => ({
  ...newProgress(id, 't', at),
  box: mastered ? 5 : 1,
  status: mastered ? 'mastered' : 'learning',
  firstLearnedAt: at
})

describe('cefrCeiling', () => {
  it('quy đổi điểm TOEIC / IELTS', () => {
    expect(cefrCeiling('toeic', 450)).toBe('A2')
    expect(cefrCeiling('toeic', 650)).toBe('B1')
    expect(cefrCeiling('toeic', 850)).toBe('B2')
    expect(cefrCeiling('toeic', 950)).toBe('C1')
    expect(cefrCeiling('ielts', 5)).toBe('B1')
    expect(cefrCeiling('ielts', 6.5)).toBe('B2')
    expect(cefrCeiling('ielts', 7.5)).toBe('C1')
    expect(cefrCeiling('ielts', 8.5)).toBe('C2')
    expect(cefrCeiling('general', 3)).toBe('B1')
  })
})

describe('requiredWords', () => {
  it('lọc theo mức trần, từ chưa gắn cấp vẫn cần học, cấp thấp trước', () => {
    const ws = [word(1, 'C1'), word(2, 'B2'), word(3), word(4, 'A1'), word(5, 'B1')]
    expect(requiredWords(ws, 'B1').map((w) => w.id)).toEqual(['w3', 'w4', 'w5'])
  })
})

describe('planStatus', () => {
  const plan: ExamPlan = { packId: 'toeic', exam: 'toeic', target: 650, examDate: '2026-12-19', createdAt: NOW }
  const words = Array.from({ length: 100 }, (_, i) => word(i, i < 90 ? 'B1' : 'C1'))

  it('chia đều từ mới cho số ngày học (trừ giai đoạn ôn cuối)', () => {
    const st = planStatus(plan, words, new Map(), NOW)
    expect(st.ceiling).toBe('B1')
    expect(st.required).toBe(90)
    expect(st.daysLeft).toBe(30)
    expect(reviewDays(30)).toBe(5)
    expect(st.learnDays).toBe(25)
    expect(st.newPerDay).toBe(4)
    expect(st.todayLeft).toBe(4)
    expect(st.next[0].id).toBe('w0')
  })

  it('từ đã học hôm nay tính vào chỉ tiêu (chỉ tiêu không tụt khi đang học)', () => {
    const progress = new Map<string, WordProgress>([
      ['w0', learned('w0', NOW - HOUR)],
      ['w1', learned('w1', NOW - HOUR)],
      ['w2', learned('w2', NOW - 120 * HOUR, true)]
    ])
    const st = planStatus(plan, words, progress, NOW)
    expect(st.learned).toBe(3)
    expect(st.mastered).toBe(1)
    expect(st.learnedToday).toBe(2)
    expect(st.remaining).toBe(87)
    expect(st.newPerDay).toBe(4) // ceil((87 + 2) / 25)
    expect(st.todayLeft).toBe(2)
    expect(st.next[0].id).toBe('w3')
  })

  it('đã qua ngày thi / thi ngày mai', () => {
    expect(planStatus({ ...plan, examDate: '2026-11-01' }, words, new Map(), NOW)).toMatchObject({ daysLeft: 0, newPerDay: 90 })
    expect(planStatus({ ...plan, examDate: '2026-11-20' }, words, new Map(), NOW)).toMatchObject({ daysLeft: 1, learnDays: 1 })
  })

  it('gợi ý lượt gõ mỗi ngày', () => {
    expect(suggestedDailyAttempts(4)).toBe(15)
    expect(suggestedDailyAttempts(1)).toBe(10)
    expect(suggestedDailyAttempts(30)).toBe(90)
  })
})
