import { describe, expect, it } from 'vitest'
import { computeStreak, dailySeries, dayKey, heatmap, longestStreak, summarize, topicProgress } from './stats'
import { DAY_MS, dueAfterDays, newProgress } from './srs'
import type { Session, WordProgress } from '@/types'

const NOW = new Date(2026, 10, 16, 15, 0, 0).getTime()
const daysAgo = (n: number): number => NOW - n * DAY_MS

function session(startedAt: number, extra: Partial<Session> = {}): Session {
  return {
    kind: 'recall',
    topicId: null,
    startedAt,
    endedAt: startedAt + 60000,
    activeMs: 60000,
    wordsTotal: 10,
    wordsCorrect: 8,
    keystrokes: 100,
    correctKeystrokes: 90,
    wpm: 20,
    accuracy: 90,
    newWordsLearned: 0,
    promoted: 0,
    ...extra
  }
}

describe('streak', () => {
  it('đếm ngày liên tiếp kết thúc hôm nay', () => {
    expect(computeStreak([dayKey(NOW), dayKey(daysAgo(1)), dayKey(daysAgo(2))], NOW)).toBe(3)
  })
  it('vẫn giữ chuỗi nếu hôm nay chưa học', () => {
    expect(computeStreak([dayKey(daysAgo(1)), dayKey(daysAgo(2))], NOW)).toBe(2)
  })
  it('chuỗi bị đứt', () => {
    expect(computeStreak([dayKey(daysAgo(2))], NOW)).toBe(0)
  })
  it('chuỗi dài nhất', () => {
    const days = [0, 1, 2, 5, 6].map((n) => dayKey(daysAgo(n)))
    expect(longestStreak(days)).toBe(3)
  })
})

describe('dailySeries', () => {
  it('gom số liệu theo ngày', () => {
    const p: WordProgress = { ...newProgress('a', 't', NOW), box: 1, firstLearnedAt: NOW }
    const series = dailySeries(
      [session(NOW), session(daysAgo(1), { keystrokes: 0, correctKeystrokes: 0, wpm: 0 })],
      [p],
      7,
      NOW
    )
    expect(series).toHaveLength(7)
    const today = series[6]
    expect(today.date).toBe(dayKey(NOW))
    expect(today.newWords).toBe(1)
    expect(today.wordsPracticed).toBe(10)
    expect(today.accuracy).toBe(90)
    expect(today.wpm).toBe(20)
    expect(series[5].accuracy).toBeNull()
    expect(series[0].wordsPracticed).toBe(0)
  })
})

describe('heatmap', () => {
  it('tạo lưới theo tuần', () => {
    const grid = heatmap([session(NOW)], 12, NOW)
    expect(grid).toHaveLength(12)
    expect(grid.every((c) => c.length === 7)).toBe(true)
    const cell = grid.flat().find((c) => c.date === dayKey(NOW))
    expect(cell?.level).toBe(4)
  })
})

describe('summarize / topicProgress', () => {
  const progress: WordProgress[] = [
    {
      ...newProgress('a', 't', 0),
      box: 1,
      status: 'learning',
      firstLearnedAt: NOW,
      nextReviewAt: dueAfterDays(NOW, 1)
    },
    { ...newProgress('b', 't', 0), box: 4, status: 'mastered', firstLearnedAt: daysAgo(20), nextReviewAt: daysAgo(1) },
    newProgress('c', 't', 0)
  ]
  it('tổng hợp dashboard', () => {
    const s = summarize(progress, [session(NOW), session(daysAgo(1))], 20, NOW)
    expect(s.learned).toBe(2)
    expect(s.mastered).toBe(1)
    expect(s.learning).toBe(1)
    expect(s.dueToday).toBe(1)
    expect(s.todayNew).toBe(1)
    expect(s.streak).toBe(2)
    expect(s.totalMinutes).toBe(2)
    expect(s.avgAccuracy).toBe(90)
    expect(s.avgWpm).toBe(20)
    expect(s.todayWords).toBe(10)
  })
  it('tiến độ chủ đề', () => {
    const map = new Map(progress.map((p) => [p.wordId, p]))
    expect(topicProgress(['a', 'b', 'c', 'd'], map, NOW)).toEqual({ total: 4, learned: 2, mastered: 1, due: 1 })
  })
})
