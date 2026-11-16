import type { PracticeMode, WordProgress, WordStatus } from '@/types'

export const DAY_MS = 24 * 60 * 60 * 1000

/** Khoảng ôn (ngày) theo hộp Leitner. Hộp 0 = chưa học. */
export const BOX_INTERVALS_DAYS = [0, 1, 3, 7, 14, 30] as const
export const MAX_BOX = BOX_INTERVALS_DAYS.length - 1
export const MASTERED_BOX = 4

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Thời điểm đến hạn: đầu ngày thứ `days` kể từ hôm nay (theo giờ địa phương). */
export function dueAfterDays(now: number, days: number): number {
  const d = new Date(startOfDay(now))
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function statusForBox(box: number): WordStatus {
  if (box <= 0) return 'new'
  if (box >= MASTERED_BOX) return 'mastered'
  return 'learning'
}

export function newProgress(wordId: string, topicId: string, now: number): WordProgress {
  return {
    wordId,
    topicId,
    box: 0,
    status: 'new',
    correct: 0,
    wrong: 0,
    lastSeenAt: now,
    nextReviewAt: now,
    firstLearnedAt: null,
    masteredAt: null
  }
}

export function isDue(p: WordProgress | undefined, now: number): boolean {
  return !!p && p.box > 0 && p.nextReviewAt <= now
}

export interface ReviewInput {
  mode: PracticeMode
  correct: boolean
  hinted: boolean
}

export interface ReviewResult {
  progress: WordProgress
  /** Từ vừa chuyển từ "mới" sang "đã học". */
  learned: boolean
  /** Từ được lên hộp cao hơn. */
  promoted: boolean
  /** Từ bị đưa về hộp 1 do sai. */
  demoted: boolean
}

function withBox(p: WordProgress, box: number, now: number): WordProgress {
  const status = statusForBox(box)
  return {
    ...p,
    box,
    status,
    nextReviewAt: dueAfterDays(now, BOX_INTERVALS_DAYS[box]),
    masteredAt: status === 'mastered' ? (p.masteredAt ?? now) : null
  }
}

/**
 * Cập nhật tiến độ một từ sau một lượt gõ.
 * - Chế độ Chép: chỉ đánh dấu đã học (hộp 0 → 1), không thăng hạng.
 * - Nhớ/Nghe/Điền: đúng, không gợi ý và đã đến hạn → lên hộp; sai → về hộp 1;
 *   đúng khi chưa đến hạn → chỉ ghi nhận (chống học dồn).
 */
export function applyReview(prev: WordProgress, input: ReviewInput, now: number): ReviewResult {
  let p: WordProgress = { ...prev, lastSeenAt: now }
  const wasNew = prev.box <= 0
  let learned = false
  let promoted = false
  let demoted = false

  if (wasNew) {
    p = withBox(p, 1, now)
    p.firstLearnedAt = p.firstLearnedAt ?? now
    learned = true
  }

  if (input.mode === 'copy') {
    return { progress: p, learned, promoted, demoted }
  }

  if (!input.correct) {
    p.wrong += 1
    if (!wasNew) {
      demoted = prev.box > 1
      p = withBox(p, 1, now)
    }
    return { progress: p, learned, promoted, demoted }
  }

  p.correct += 1
  if (!wasNew && !input.hinted && isDue(prev, now) && prev.box < MAX_BOX) {
    p = withBox(p, prev.box + 1, now)
    promoted = true
  } else if (!wasNew && !input.hinted && isDue(prev, now) && prev.box >= MAX_BOX) {
    // Đã ở hộp cao nhất: gia hạn thêm một chu kỳ
    p = withBox(p, MAX_BOX, now)
  }
  return { progress: p, learned, promoted, demoted }
}
