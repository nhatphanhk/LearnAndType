/**
 * Lộ trình luyện thi: từ ngày thi + điểm mục tiêu → cấp độ CEFR cần nắm → số từ mới cần học mỗi ngày.
 *
 * Quy đổi điểm → CEFR (gần đúng, theo bảng ánh xạ chính thức của ETS và IELTS):
 *   TOEIC L+R: < 550 → A2, 550–780 → B1, 785–940 → B2, ≥ 945 → C1
 *   IELTS:     ≤ 5.0 → B1, 5.5–6.5 → B2, 7.0–8.0 → C1, ≥ 8.5 → C2
 * Từ cần học = từ của gói có CEFR ≤ mức trần, cộng từ chưa gắn cấp độ (thường là từ chuyên đề của kỳ thi).
 */
import { CEFR_LEVELS, type PackExam } from './packs'
import { DAY_MS } from './srs'
import { dayKey } from './stats'
import type { Cefr, Word, WordProgress } from '@/types'

export const EXAM_PLAN_META_KEY = 'examPlan'

export interface ExamPlan {
  packId: string
  exam: PackExam
  /** Điểm mục tiêu: TOEIC 10–990, IELTS 1–9, gói chung: chỉ số CEFR 1–6. */
  target: number
  /** Ngày thi, dạng YYYY-MM-DD. */
  examDate: string
  createdAt: number
}

export const TARGET_OPTIONS: Record<PackExam, { value: number; label: string }[]> = {
  toeic: [450, 550, 650, 750, 850, 950].map((v) => ({ value: v, label: `${v}+` })),
  ielts: [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5].map((v) => ({ value: v, label: v.toFixed(1) })),
  general: CEFR_LEVELS.map((lv, i) => ({ value: i + 1, label: lv }))
}

export function cefrCeiling(exam: PackExam, target: number): Cefr {
  if (exam === 'toeic') return target < 550 ? 'A2' : target < 785 ? 'B1' : target < 945 ? 'B2' : 'C1'
  if (exam === 'ielts') return target <= 5 ? 'B1' : target <= 6.5 ? 'B2' : target <= 8 ? 'C1' : 'C2'
  return CEFR_LEVELS[Math.min(CEFR_LEVELS.length, Math.max(1, Math.round(target))) - 1]
}

const rank = (c?: Cefr): number => (c ? CEFR_LEVELS.indexOf(c) : -1)

/** Từ cần nắm cho mục tiêu, theo thứ tự học: cấp độ thấp → cao (từ chưa gắn cấp học cùng nhóm đầu), rồi thứ tự trong gói. */
export function requiredWords(words: readonly Word[], ceiling: Cefr): Word[] {
  const max = rank(ceiling)
  return words
    .filter((w) => rank(w.cefr) <= max)
    .sort((a, b) => Math.max(0, rank(a.cefr)) - Math.max(0, rank(b.cefr)) || a.createdAt - b.createdAt)
}

/** Nửa đêm (giờ máy) của ngày YYYY-MM-DD. */
export function parseDate(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const t = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  return Number.isNaN(t) ? null : t
}

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Số ngày cuối dành riêng để ôn (không học từ mới): ~15% thời gian, 2–14 ngày. */
export function reviewDays(daysLeft: number): number {
  if (daysLeft <= 3) return 0
  return Math.min(14, Math.max(2, Math.round(daysLeft * 0.15)))
}

export interface PlanStatus {
  ceiling: Cefr
  required: number
  learned: number
  mastered: number
  remaining: number
  /** Số ngày còn lại tới ngày thi (hôm nay tính là 1; 0 = đã qua ngày thi). */
  daysLeft: number
  /** Số ngày dùng để học từ mới (trừ giai đoạn ôn cuối). */
  learnDays: number
  /** Số từ mới cần học mỗi ngày từ hôm nay. */
  newPerDay: number
  /** Số từ cần học mới đã học hôm nay. */
  learnedToday: number
  /** Còn phải học hôm nay. */
  todayLeft: number
  /** Các từ nên học tiếp theo (chưa học, theo thứ tự lộ trình). */
  next: Word[]
}

export function planStatus(
  plan: ExamPlan,
  words: readonly Word[],
  progress: ReadonlyMap<string, WordProgress>,
  now: number,
  nextCount = 50
): PlanStatus {
  const ceiling = cefrCeiling(plan.exam, plan.target)
  const req = requiredWords(words, ceiling)
  const today = dayKey(now)
  let learned = 0
  let mastered = 0
  let learnedToday = 0
  const fresh: Word[] = []
  for (const w of req) {
    const p = progress.get(w.id)
    if (!p || p.box <= 0) {
      fresh.push(w)
      continue
    }
    learned++
    if (p.status === 'mastered') mastered++
    if (p.firstLearnedAt !== null && dayKey(p.firstLearnedAt) === today) learnedToday++
  }
  const exam = parseDate(plan.examDate)
  const daysLeft = exam === null ? 0 : Math.max(0, Math.round((exam - startOfDay(now)) / DAY_MS))
  const learnDays = Math.max(daysLeft > 0 ? 1 : 0, daysLeft - reviewDays(daysLeft))
  const remaining = fresh.length
  // Chỉ tiêu hôm nay tính cả số từ đã học hôm nay, để chỉ tiêu không giảm dần khi đang học
  const newPerDay = learnDays > 0 ? Math.ceil((remaining + learnedToday) / learnDays) : remaining
  const todayLeft = Math.max(0, Math.min(remaining, newPerDay - learnedToday))
  return {
    ceiling,
    required: req.length,
    learned,
    mastered,
    remaining,
    daysLeft,
    learnDays,
    newPerDay,
    learnedToday,
    todayLeft,
    next: fresh.slice(0, nextCount)
  }
}

/**
 * Gợi ý mục tiêu "lượt gõ mỗi ngày" (dailyGoalWords) cho lộ trình:
 * mỗi từ mới ≈ 2 lượt (Chép + Nhớ) + lượt ôn các từ đã học (~1 lượt mỗi từ mới).
 */
export function suggestedDailyAttempts(newPerDay: number): number {
  return Math.max(10, Math.ceil((newPerDay * 3) / 5) * 5)
}
