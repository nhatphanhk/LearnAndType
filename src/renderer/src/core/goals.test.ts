import { describe, expect, it } from 'vitest'
import { goalProgress, goalStreak, parseTime, shouldRemind } from './goals'
import { formatDelta, startOfWeek, weeklyReport } from './weekly'
import { dayKey } from './stats'
import { DAY_MS, newProgress } from './srs'
import type { Attempt, Session } from '@/types'

// Thứ 2, 16/11/2026, 15:00
const NOW = new Date(2026, 10, 16, 15, 0, 0).getTime()

function session(startedAt: number, extra: Partial<Session> = {}): Session {
  return {
    kind: 'recall',
    topicId: null,
    startedAt,
    endedAt: startedAt + 60000,
    activeMs: 5 * 60000,
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

function attempt(wordId: string, at: number, correct: boolean): Attempt {
  return { sessionId: 1, wordId, topicId: 't', mode: 'recall', correct, hinted: false, errors: 0, durationMs: 1000, at }
}

describe('goalProgress', () => {
  it('chỉ tính phiên hôm nay', () => {
    const g = goalProgress([session(NOW - 3600_000), session(NOW - DAY_MS)], NOW, { dailyGoalWords: 20, dailyGoalMinutes: 0 })
    expect(g).toMatchObject({ words: 10, minutes: 5, percent: 50, met: false, enabled: true })
  })

  it('đạt khi đủ cả số từ và số phút', () => {
    const sessions = [session(NOW - 3600_000), session(NOW - 7200_000)]
    expect(goalProgress(sessions, NOW, { dailyGoalWords: 20, dailyGoalMinutes: 10 }).met).toBe(true)
    // Thiếu phút → lấy tỉ lệ thấp nhất
    expect(goalProgress(sessions, NOW, { dailyGoalWords: 20, dailyGoalMinutes: 20 })).toMatchObject({ met: false, percent: 50 })
  })

  it('không đặt mục tiêu thì không bao giờ "đạt"', () => {
    expect(goalProgress([session(NOW)], NOW, { dailyGoalWords: 0, dailyGoalMinutes: 0 })).toMatchObject({
      enabled: false,
      met: false
    })
  })
})

describe('shouldRemind', () => {
  it('nhắc khi đã qua giờ, chưa nhắc hôm nay, chưa đạt', () => {
    expect(shouldRemind(NOW, '14:30', null, false)).toBe(true)
    expect(shouldRemind(NOW, '15:00', 'x', false)).toBe(true)
  })
  it('không nhắc trước giờ, khi đã nhắc hoặc đã đạt', () => {
    expect(shouldRemind(NOW, '15:01', null, false)).toBe(false)
    expect(shouldRemind(NOW, '14:00', dayKey(NOW), false)).toBe(false)
    expect(shouldRemind(NOW, '14:00', null, true)).toBe(false)
    expect(shouldRemind(NOW, 'abc', null, false)).toBe(false)
  })
  it('parseTime', () => {
    expect(parseTime('7:05')).toBe(425)
    expect(parseTime('24:00')).toBeNull()
  })
})

describe('goalStreak', () => {
  const goal = { dailyGoalWords: 10, dailyGoalMinutes: 0 }
  it('đếm ngày liên tiếp đạt mục tiêu, hôm nay chưa đạt vẫn giữ chuỗi', () => {
    const s = [session(NOW - DAY_MS), session(NOW - 2 * DAY_MS), session(NOW - 4 * DAY_MS)]
    expect(goalStreak(s, NOW, goal)).toBe(2)
    expect(goalStreak([...s, session(NOW)], NOW, goal)).toBe(3)
  })
})

describe('weeklyReport', () => {
  it('đầu tuần là Thứ 2', () => {
    const wed = new Date(2026, 10, 18, 10).getTime()
    expect(startOfWeek(wed)).toBe(new Date(2026, 10, 16).getTime())
  })

  it('so sánh tuần này với tuần trước và tìm từ khó', () => {
    const lastWeek = NOW - 3 * DAY_MS
    const p1 = { ...newProgress('a', 't', 0), firstLearnedAt: NOW, masteredAt: NOW }
    const p2 = { ...newProgress('b', 't', 0), firstLearnedAt: lastWeek, masteredAt: null }
    const r = weeklyReport(
      [session(NOW - 3600_000), session(lastWeek), session(lastWeek - DAY_MS)],
      [attempt('a', NOW, false), attempt('b', NOW, false), attempt('b', NOW, false), attempt('c', lastWeek, false)],
      [p1, p2],
      NOW
    )
    expect(r.week).toMatchObject({ sessions: 1, newWords: 1, mastered: 1, activeDays: 1, minutes: 5, wpm: 20, accuracy: 90 })
    expect(r.previous).toMatchObject({ sessions: 2, newWords: 1, activeDays: 2 })
    expect(r.hardWords).toEqual([
      { wordId: 'b', wrong: 2 },
      { wordId: 'a', wrong: 1 }
    ])
  })

  it('formatDelta', () => {
    expect(formatDelta(5, 3)).toBe('+2')
    expect(formatDelta(3, 5)).toBe('−2')
    expect(formatDelta(3, 3)).toBe('0')
    expect(formatDelta(null, 3)).toBeNull()
  })
})
