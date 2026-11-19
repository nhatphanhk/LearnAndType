import { describe, expect, it } from 'vitest'
import { attemptXp, levelInfo, longestCorrectRun, totalXp, xpForLevel } from './xp'
import { ACHIEVEMENTS, newlyUnlocked, type AchievementContext } from './achievements'

describe('XP', () => {
  it('tính XP theo chế độ và gợi ý', () => {
    expect(attemptXp({ correct: true, hinted: false, mode: 'copy' })).toBe(2)
    expect(attemptXp({ correct: true, hinted: false, mode: 'recall' })).toBe(10)
    expect(attemptXp({ correct: true, hinted: true, mode: 'listen' })).toBe(5)
    expect(attemptXp({ correct: false, hinted: false, mode: 'recall' })).toBe(0)
    expect(
      totalXp([
        { correct: true, hinted: false, mode: 'cloze' },
        { correct: true, hinted: true, mode: 'copy' }
      ])
    ).toBe(11)
  })

  it('cấp độ', () => {
    expect(levelInfo(0)).toEqual({ level: 1, current: 0, needed: 50 })
    expect(levelInfo(49).level).toBe(1)
    expect(levelInfo(50)).toEqual({ level: 2, current: 0, needed: 150 })
    expect(levelInfo(xpForLevel(10) + 5)).toMatchObject({ level: 10, current: 5 })
  })

  it('chuỗi đúng dài nhất bỏ qua Chép, gợi ý làm đứt chuỗi', () => {
    const a = (at: number, correct: boolean, mode: 'copy' | 'recall' = 'recall', hinted = false) => ({ at, correct, mode, hinted })
    expect(longestCorrectRun([a(1, true), a(2, true), a(3, false, 'copy'), a(4, true), a(5, true, 'recall', true), a(6, true)])).toBe(3)
  })
})

describe('achievements', () => {
  const base: AchievementContext = {
    learned: 0,
    mastered: 0,
    streak: 0,
    bestStreak: 0,
    totalMinutes: 0,
    totalSessions: 0,
    bestWpm: 0,
    bestCorrectRun: 0,
    goalStreak: 0,
    completedTopics: 0,
    myWords: 0,
    level: 1,
    bestGameScore: 0
  }

  it('id không trùng', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
  })

  it('chỉ trả về huy hiệu mới đạt', () => {
    expect(newlyUnlocked(base, {})).toEqual([])
    const ctx = { ...base, totalSessions: 3, learned: 60, bestWpm: 45 }
    expect(newlyUnlocked(ctx, {}).map((a) => a.id)).toEqual(['first-session', 'learned-50', 'wpm-40'])
    expect(newlyUnlocked(ctx, { 'first-session': 1 }).map((a) => a.id)).toEqual(['learned-50', 'wpm-40'])
  })
})
