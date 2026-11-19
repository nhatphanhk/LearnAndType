import type { Session } from '@/types'
import { dayKey } from './stats'

export interface GoalSettings {
  /** Số lượt gõ cần đạt mỗi ngày (0 = không đặt). */
  dailyGoalWords: number
  /** Số phút gõ cần đạt mỗi ngày (0 = không đặt). */
  dailyGoalMinutes: number
}

export interface GoalProgress {
  words: number
  minutes: number
  /** 0–100, lấy theo mục tiêu đang làm chậm nhất. */
  percent: number
  met: boolean
  /** Có ít nhất một mục tiêu được đặt. */
  enabled: boolean
}

/** Tiến độ mục tiêu trong ngày chứa `now`. */
export function goalProgress(sessions: readonly Session[], now: number, goal: GoalSettings): GoalProgress {
  const today = dayKey(now)
  let words = 0
  let ms = 0
  for (const s of sessions) {
    if (dayKey(s.startedAt) !== today) continue
    words += s.wordsTotal
    ms += s.activeMs
  }
  const minutes = Math.floor(ms / 60000)
  const ratios: number[] = []
  if (goal.dailyGoalWords > 0) ratios.push(words / goal.dailyGoalWords)
  if (goal.dailyGoalMinutes > 0) ratios.push(ms / 60000 / goal.dailyGoalMinutes)
  const enabled = ratios.length > 0
  const ratio = enabled ? Math.min(...ratios) : 0
  return {
    words,
    minutes,
    percent: Math.min(100, Math.floor(ratio * 100)),
    met: enabled && ratio >= 1,
    enabled
  }
}

/** "HH:MM" → số phút kể từ 0h; chuỗi sai định dạng → null. */
export function parseTime(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * Có nên nhắc học lúc `now` không: đã qua giờ nhắc, hôm nay chưa nhắc và chưa đạt mục tiêu.
 * `lastRemindedDay` là `dayKey` của lần nhắc gần nhất.
 */
export function shouldRemind(now: number, reminderTime: string, lastRemindedDay: string | null, met: boolean): boolean {
  if (met) return false
  const at = parseTime(reminderTime)
  if (at === null) return false
  if (lastRemindedDay === dayKey(now)) return false
  const d = new Date(now)
  return d.getHours() * 60 + d.getMinutes() >= at
}

/** Số ngày liên tiếp (kết thúc hôm qua hoặc hôm nay) đã đạt mục tiêu. */
export function goalStreak(sessions: readonly Session[], now: number, goal: GoalSettings): number {
  if (goal.dailyGoalWords <= 0 && goal.dailyGoalMinutes <= 0) return 0
  const byDay = new Map<string, { words: number; ms: number }>()
  for (const s of sessions) {
    const k = dayKey(s.startedAt)
    const v = byDay.get(k) ?? { words: 0, ms: 0 }
    v.words += s.wordsTotal
    v.ms += s.activeMs
    byDay.set(k, v)
  }
  const metOn = (k: string): boolean => {
    const v = byDay.get(k)
    if (!v) return false
    if (goal.dailyGoalWords > 0 && v.words < goal.dailyGoalWords) return false
    if (goal.dailyGoalMinutes > 0 && v.ms / 60000 < goal.dailyGoalMinutes) return false
    return true
  }
  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0)
  if (!metOn(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (metOn(dayKey(cursor.getTime()))) {
    n++
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}
