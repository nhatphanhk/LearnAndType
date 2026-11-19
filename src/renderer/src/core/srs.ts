import { Rating, State, createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs'
import type { PracticeMode, SrsAlgorithm, WordProgress, WordStatus } from '@/types'

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
  /** Mặc định 'leitner'. */
  algorithm?: SrsAlgorithm
  /** Số phím sai trong lượt (FSRS dùng để chấm Hard). */
  errors?: number
  /** Thời gian làm lượt này (ms). */
  durationMs?: number
  /** Độ dài đáp án (để xét gõ nhanh/chậm). */
  answerLength?: number
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
      p = input.algorithm === 'fsrs' ? withFsrs(p, prev, Rating.Again, now) : withBox(p, 1, now)
    }
    return { progress: p, learned, promoted, demoted }
  }

  p.correct += 1
  if (input.algorithm === 'fsrs') {
    if (!wasNew && isDue(prev, now)) {
      p = withFsrs(p, prev, gradeFor(input), now)
      promoted = p.box > prev.box
    }
    return { progress: p, learned, promoted, demoted }
  }
  if (!wasNew && !input.hinted && isDue(prev, now) && prev.box < MAX_BOX) {
    p = withBox(p, prev.box + 1, now)
    promoted = true
  } else if (!wasNew && !input.hinted && isDue(prev, now) && prev.box >= MAX_BOX) {
    // Đã ở hộp cao nhất: gia hạn thêm một chu kỳ
    p = withBox(p, MAX_BOX, now)
  }
  return { progress: p, learned, promoted, demoted }
}

/* ------------------------------------ FSRS ------------------------------------ */

/**
 * Lịch theo ngày (không dùng bước học ngắn hạn tính bằng phút) để khớp với cách app
 * tính "đến hạn" theo đầu ngày; tắt fuzz để kết quả ổn định, dễ kiểm thử.
 */
const scheduler = fsrs({ enable_fuzz: false, enable_short_term: false, maximum_interval: 365 })

/** Ngưỡng thời gian (ms) để coi là gõ chậm / nhanh, theo độ dài từ. */
export function slowThresholdMs(len: number): number {
  return 4000 + 600 * len
}
export function fastThresholdMs(len: number): number {
  return 1500 + 250 * len
}

/**
 * Chấm điểm FSRS cho một lượt gõ: sai → Again; dùng gợi ý, có phím sai hoặc gõ chậm → Hard;
 * gõ sạch và nhanh → Easy; còn lại → Good.
 */
export function gradeFor(input: ReviewInput): Grade {
  if (!input.correct) return Rating.Again
  if (input.hinted || (input.errors ?? 0) > 0) return Rating.Hard
  const len = Math.max(1, input.answerLength ?? 5)
  const ms = input.durationMs
  if (ms !== undefined && ms > slowThresholdMs(len)) return Rating.Hard
  // Trắc nghiệm chỉ là nhận diện (dễ hơn tự nhớ) → tối đa Good
  if (ms !== undefined && ms < fastThresholdMs(len)) return input.mode === 'choice' || input.mode === 'synonym' ? Rating.Good : Rating.Easy
  return Rating.Good
}

/** Hộp hiển thị suy ra từ khoảng ôn (ngày), giữ nguyên ý nghĩa 5 hộp của Leitner. */
export function boxForInterval(days: number): number {
  if (days < BOX_INTERVALS_DAYS[2]) return 1
  if (days < BOX_INTERVALS_DAYS[3]) return 2
  if (days < BOX_INTERVALS_DAYS[4]) return 3
  if (days < BOX_INTERVALS_DAYS[5]) return 4
  return 5
}

/** Thẻ FSRS tương ứng tiến độ. Từ chưa có dữ liệu FSRS thì suy ra từ hộp Leitner hiện tại. */
export function toCard(p: WordProgress, now: number): Card {
  if (p.stability !== undefined && p.difficulty !== undefined) {
    return {
      due: new Date(p.nextReviewAt),
      stability: p.stability,
      difficulty: p.difficulty,
      elapsed_days: 0,
      scheduled_days: p.scheduledDays ?? 0,
      learning_steps: 0,
      reps: p.reps ?? 0,
      lapses: p.lapses ?? 0,
      state: (p.fsrsState ?? State.Review) as State,
      last_review: new Date(p.lastReviewAt ?? p.lastSeenAt)
    }
  }
  // Từ mới học (hộp 1, chưa từng được kiểm tra) → thẻ mới; ngược lại coi là đang ôn với độ bền = khoảng của hộp
  if (p.box <= 1 && p.correct + p.wrong === 0) return createEmptyCard(new Date(now))
  const interval = BOX_INTERVALS_DAYS[Math.max(1, Math.min(MAX_BOX, p.box))]
  return {
    due: new Date(p.nextReviewAt),
    stability: interval,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: interval,
    learning_steps: 0,
    reps: p.correct,
    lapses: 0,
    state: State.Review,
    last_review: new Date(Math.min(p.lastSeenAt, p.nextReviewAt - interval * DAY_MS))
  }
}

function withFsrs(p: WordProgress, prev: WordProgress, grade: Grade, now: number): WordProgress {
  const { card } = scheduler.next(toCard(prev, now), new Date(now), grade)
  const days = Math.max(1, Math.round(card.scheduled_days))
  const box = boxForInterval(days)
  const status = statusForBox(box)
  return {
    ...p,
    box,
    status,
    nextReviewAt: dueAfterDays(now, days),
    masteredAt: status === 'mastered' ? (p.masteredAt ?? now) : null,
    stability: card.stability,
    difficulty: card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    fsrsState: card.state,
    scheduledDays: days,
    lastReviewAt: now
  }
}
