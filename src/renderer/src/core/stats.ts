import type { Session, WordProgress } from '@/types'
import { startOfDay } from './srs'

/** Khóa ngày theo giờ địa phương: YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(ts: number, days: number): number {
  const d = new Date(startOfDay(ts))
  d.setDate(d.getDate() + days)
  return d.getTime()
}

/**
 * Chuỗi ngày học liên tiếp. Nếu hôm nay chưa học thì vẫn tính chuỗi tới hôm qua.
 */
export function computeStreak(activeDays: Iterable<string>, now: number): number {
  const set = new Set(activeDays)
  let cursor = startOfDay(now)
  if (!set.has(dayKey(cursor))) cursor = addDays(cursor, -1)
  let streak = 0
  while (set.has(dayKey(cursor))) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

export function longestStreak(activeDays: Iterable<string>): number {
  const sorted = [...new Set(activeDays)].sort()
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const key of sorted) {
    const [y, m, d] = key.split('-').map(Number)
    const ts = new Date(y, m - 1, d).getTime()
    run = prev !== null && dayKey(addDays(prev, 1)) === key ? run + 1 : 1
    best = Math.max(best, run)
    prev = ts
  }
  return best
}

export interface DailyPoint {
  date: string
  label: string
  newWords: number
  wordsPracticed: number
  minutes: number
  accuracy: number | null
  wpm: number | null
}

/** Chuỗi số liệu theo ngày cho `days` ngày gần nhất (kết thúc hôm nay). */
export function dailySeries(
  sessions: readonly Session[],
  progress: readonly WordProgress[],
  days: number,
  now: number
): DailyPoint[] {
  const points = new Map<string, DailyPoint & { keys: number; correctKeys: number; wpmMs: number; wpmChars: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const ts = addDays(now, -i)
    const d = new Date(ts)
    const key = dayKey(ts)
    points.set(key, {
      date: key,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
      newWords: 0,
      wordsPracticed: 0,
      minutes: 0,
      accuracy: null,
      wpm: null,
      keys: 0,
      correctKeys: 0,
      wpmMs: 0,
      wpmChars: 0
    })
  }
  for (const s of sessions) {
    const pt = points.get(dayKey(s.startedAt))
    if (!pt) continue
    pt.wordsPracticed += s.wordsTotal
    pt.minutes += s.activeMs / 60000
    pt.keys += s.keystrokes
    pt.correctKeys += s.correctKeystrokes
    if (s.wpm > 0) {
      pt.wpmMs += s.activeMs
      pt.wpmChars += (s.wpm * 5 * s.activeMs) / 60000
    }
  }
  for (const p of progress) {
    if (p.firstLearnedAt === null) continue
    const pt = points.get(dayKey(p.firstLearnedAt))
    if (pt) pt.newWords++
  }
  return [...points.values()].map(({ keys, correctKeys, wpmMs, wpmChars, ...pt }) => ({
    ...pt,
    minutes: Math.round(pt.minutes * 10) / 10,
    accuracy: keys > 0 ? Math.round((correctKeys / keys) * 100) : null,
    wpm: wpmMs > 0 ? Math.round(wpmChars / 5 / (wpmMs / 60000)) : null
  }))
}

export interface HeatCell {
  date: string
  count: number
  /** 0 = không học, 1–4 = mức độ tăng dần. */
  level: 0 | 1 | 2 | 3 | 4
  future: boolean
}

/** Lưới heatmap `weeks` tuần, mỗi cột là 1 tuần (Thứ 2 → Chủ nhật). */
export function heatmap(sessions: readonly Session[], weeks: number, now: number): HeatCell[][] {
  const counts = new Map<string, number>()
  for (const s of sessions) {
    const k = dayKey(s.startedAt)
    counts.set(k, (counts.get(k) ?? 0) + s.wordsTotal)
  }
  const today = startOfDay(now)
  const weekday = (new Date(today).getDay() + 6) % 7 // Thứ 2 = 0
  const start = addDays(today, -weekday - (weeks - 1) * 7)
  const max = Math.max(1, ...counts.values())
  const columns: HeatCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = []
    for (let d = 0; d < 7; d++) {
      const ts = addDays(start, w * 7 + d)
      const key = dayKey(ts)
      const count = counts.get(key) ?? 0
      const ratio = count / max
      const level = count === 0 ? 0 : ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1
      col.push({ date: key, count, level, future: ts > today })
    }
    columns.push(col)
  }
  return columns
}

export interface Summary {
  learned: number
  mastered: number
  learning: number
  dueToday: number
  totalWords: number
  streak: number
  bestStreak: number
  totalMinutes: number
  totalSessions: number
  totalKeystrokes: number
  avgAccuracy: number | null
  avgWpm: number | null
  todayWords: number
  todayNew: number
}

export function summarize(
  progress: readonly WordProgress[],
  sessions: readonly Session[],
  totalWords: number,
  now: number
): Summary {
  let learned = 0
  let mastered = 0
  let dueToday = 0
  let todayNew = 0
  const todayKey = dayKey(now)
  const endOfToday = addDays(now, 1)
  for (const p of progress) {
    if (p.box <= 0) continue
    learned++
    if (p.status === 'mastered') mastered++
    if (p.nextReviewAt < endOfToday) dueToday++
    if (p.firstLearnedAt !== null && dayKey(p.firstLearnedAt) === todayKey) todayNew++
  }
  let activeMs = 0
  let keys = 0
  let correctKeys = 0
  let wpmMs = 0
  let wpmChars = 0
  let todayWords = 0
  const days = new Set<string>()
  for (const s of sessions) {
    activeMs += s.activeMs
    keys += s.keystrokes
    correctKeys += s.correctKeystrokes
    if (s.wpm > 0) {
      wpmMs += s.activeMs
      wpmChars += (s.wpm * 5 * s.activeMs) / 60000
    }
    const k = dayKey(s.startedAt)
    days.add(k)
    if (k === todayKey) todayWords += s.wordsTotal
  }
  return {
    learned,
    mastered,
    learning: learned - mastered,
    dueToday,
    totalWords,
    streak: computeStreak(days, now),
    bestStreak: longestStreak(days),
    totalMinutes: Math.round(activeMs / 60000),
    totalSessions: sessions.length,
    totalKeystrokes: keys,
    avgAccuracy: keys > 0 ? Math.round((correctKeys / keys) * 100) : null,
    avgWpm: wpmMs > 0 ? Math.round(wpmChars / 5 / (wpmMs / 60000)) : null,
    todayWords,
    todayNew
  }
}

export interface TopicProgress {
  total: number
  learned: number
  mastered: number
  due: number
}

export function topicProgress(
  wordIds: readonly string[],
  progress: ReadonlyMap<string, WordProgress>,
  now: number
): TopicProgress {
  let learned = 0
  let mastered = 0
  let due = 0
  for (const id of wordIds) {
    const p = progress.get(id)
    if (!p || p.box <= 0) continue
    learned++
    if (p.status === 'mastered') mastered++
    if (p.nextReviewAt <= now) due++
  }
  return { total: wordIds.length, learned, mastered, due }
}
