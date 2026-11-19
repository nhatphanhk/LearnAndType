import type { Attempt, Session, WordProgress } from '@/types'
import { addDays, dayKey } from './stats'
import { startOfDay } from './srs'

/** Đầu tuần (Thứ 2, 0h) chứa `ts`. */
export function startOfWeek(ts: number): number {
  const today = startOfDay(ts)
  const weekday = (new Date(today).getDay() + 6) % 7 // Thứ 2 = 0
  return addDays(today, -weekday)
}

export interface WeekStats {
  start: number
  /** Thời điểm bắt đầu tuần sau (không bao gồm). */
  end: number
  newWords: number
  mastered: number
  minutes: number
  wordsPracticed: number
  sessions: number
  activeDays: number
  wpm: number | null
  accuracy: number | null
}

export interface HardWord {
  wordId: string
  wrong: number
}

export interface WeeklyReport {
  week: WeekStats
  previous: WeekStats
  /** Tối đa 5 từ sai nhiều nhất trong tuần. */
  hardWords: HardWord[]
}

function weekStats(sessions: readonly Session[], progress: readonly WordProgress[], start: number): WeekStats {
  const end = addDays(start, 7)
  const inRange = (t: number | null): boolean => t !== null && t >= start && t < end
  let ms = 0
  let words = 0
  let count = 0
  let keys = 0
  let correctKeys = 0
  let wpmMs = 0
  let wpmChars = 0
  const days = new Set<string>()
  for (const s of sessions) {
    if (!inRange(s.startedAt)) continue
    count++
    ms += s.activeMs
    words += s.wordsTotal
    keys += s.keystrokes
    correctKeys += s.correctKeystrokes
    if (s.wpm > 0) {
      wpmMs += s.activeMs
      wpmChars += (s.wpm * 5 * s.activeMs) / 60000
    }
    days.add(dayKey(s.startedAt))
  }
  let newWords = 0
  let mastered = 0
  for (const p of progress) {
    if (inRange(p.firstLearnedAt)) newWords++
    if (inRange(p.masteredAt)) mastered++
  }
  return {
    start,
    end,
    newWords,
    mastered,
    minutes: Math.round(ms / 60000),
    wordsPracticed: words,
    sessions: count,
    activeDays: days.size,
    wpm: wpmMs > 0 ? Math.round(wpmChars / 5 / (wpmMs / 60000)) : null,
    accuracy: keys > 0 ? Math.round((correctKeys / keys) * 100) : null
  }
}

/**
 * Báo cáo tuần chứa `now` (weekOffset = 0) hoặc các tuần trước (weekOffset = -1, -2…),
 * kèm số liệu tuần liền trước để so sánh.
 */
export function weeklyReport(
  sessions: readonly Session[],
  attempts: readonly Attempt[],
  progress: readonly WordProgress[],
  now: number,
  weekOffset = 0
): WeeklyReport {
  const start = addDays(startOfWeek(now), weekOffset * 7)
  const week = weekStats(sessions, progress, start)
  const previous = weekStats(sessions, progress, addDays(start, -7))
  const wrong = new Map<string, number>()
  for (const a of attempts) {
    if (a.correct || a.at < week.start || a.at >= week.end) continue
    wrong.set(a.wordId, (wrong.get(a.wordId) ?? 0) + 1)
  }
  const hardWords = [...wrong.entries()]
    .map(([wordId, n]) => ({ wordId, wrong: n }))
    .sort((a, b) => b.wrong - a.wrong || a.wordId.localeCompare(b.wordId))
    .slice(0, 5)
  return { week, previous, hardWords }
}

/** Chênh lệch có dấu để hiển thị, ví dụ "+3", "−2", "0". Không có dữ liệu → null. */
export function formatDelta(cur: number | null, prev: number | null): string | null {
  if (cur === null || prev === null) return null
  const d = cur - prev
  if (d === 0) return '0'
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`
}
