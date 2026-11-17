import type { PracticeMode, SessionKind, Word, WordProgress } from '@/types'
import { isDue } from './srs'
import { makeCloze } from './typing'

export interface QueueItem {
  wordId: string
  mode: PracticeMode
  /** 1 = pha Chép của bài học, 2 = pha kiểm tra. */
  phase: 1 | 2
  /** Số lần từ này đã được đưa lại vào hàng đợi trong phiên. */
  retry: number
}

export type Rng = () => number

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const a = items.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function canCloze(word: Word): boolean {
  return makeCloze(word.example, word.word) !== null
}

/**
 * Chọn từ cho một bài học: ưu tiên từ mới theo thứ tự trong chủ đề;
 * nếu không đủ thì bổ sung từ đến hạn / từ yếu (hộp thấp, gặp lâu nhất).
 */
export function pickLessonWords(
  words: readonly Word[],
  progress: ReadonlyMap<string, WordProgress>,
  size: number
): Word[] {
  const fresh = words.filter((w) => (progress.get(w.id)?.box ?? 0) === 0)
  if (fresh.length >= size) return fresh.slice(0, size)
  const rest = words
    .filter((w) => (progress.get(w.id)?.box ?? 0) > 0)
    .sort((a, b) => {
      const pa = progress.get(a.id)!
      const pb = progress.get(b.id)!
      return pa.nextReviewAt - pb.nextReviewAt || pa.box - pb.box || pa.lastSeenAt - pb.lastSeenAt
    })
  return [...fresh, ...rest].slice(0, size)
}

/**
 * Chọn từ cho chế độ kiểm tra (Nhớ/Nghe/Điền): ưu tiên từ đã học đến hạn sớm nhất, hộp thấp,
 * sau đó mới tới từ chưa học.
 */
export function pickPracticeWords(
  words: readonly Word[],
  progress: ReadonlyMap<string, WordProgress>,
  size: number
): Word[] {
  const learned = words
    .filter((w) => (progress.get(w.id)?.box ?? 0) > 0)
    .sort((a, b) => {
      const pa = progress.get(a.id)!
      const pb = progress.get(b.id)!
      return pa.nextReviewAt - pb.nextReviewAt || pa.box - pb.box || pa.lastSeenAt - pb.lastSeenAt
    })
  const fresh = words.filter((w) => (progress.get(w.id)?.box ?? 0) === 0)
  return [...learned, ...fresh].slice(0, size)
}

/** Chọn danh sách từ cho một phiên của chủ đề theo loại phiên. */
export function pickWordsForKind(
  kind: SessionKind,
  words: readonly Word[],
  progress: ReadonlyMap<string, WordProgress>,
  size: number,
  now: number
): Word[] {
  switch (kind) {
    case 'lesson':
    case 'copy':
      return pickLessonWords(words, progress, size)
    case 'review':
      return words.filter((w) => isDue(progress.get(w.id), now))
    case 'cloze':
      return pickPracticeWords(words.filter(canCloze), progress, size)
    default:
      return pickPracticeWords(words, progress, size)
  }
}

/** Chọn chế độ kiểm tra cho lượt ôn tập, xoay vòng Nhớ → Nghe → Điền câu. */
function reviewMode(word: Word, index: number): PracticeMode {
  const modes: PracticeMode[] = canCloze(word) ? ['recall', 'listen', 'cloze'] : ['recall', 'listen']
  return modes[index % modes.length]
}

export function buildQueue(kind: SessionKind, words: readonly Word[], rng: Rng = Math.random): QueueItem[] {
  const item = (w: Word, mode: PracticeMode, phase: 1 | 2 = 2): QueueItem => ({
    wordId: w.id,
    mode,
    phase,
    retry: 0
  })
  switch (kind) {
    case 'lesson':
      return [...words.map((w) => item(w, 'copy', 1)), ...shuffle(words, rng).map((w) => item(w, 'recall'))]
    case 'copy':
      return words.map((w) => item(w, 'copy', 1))
    case 'recall':
    case 'retry':
      return shuffle(words, rng).map((w) => item(w, 'recall'))
    case 'listen':
      return shuffle(words, rng).map((w) => item(w, 'listen'))
    case 'cloze':
      return shuffle(words, rng).map((w) => item(w, canCloze(w) ? 'cloze' : 'recall'))
    case 'review':
      return shuffle(words, rng).map((w, i) => item(w, reviewMode(w, i)))
  }
}

export const MAX_RETRIES = 3
export const REQUEUE_GAP = 3

/**
 * Đưa từ trả lời sai trở lại hàng đợi sau vài từ (để nhớ lại sau một khoảng ngắn).
 * Trả về hàng đợi mới; không đổi nếu đã vượt số lần thử lại.
 */
export function requeue(queue: readonly QueueItem[], index: number): QueueItem[] {
  const current = queue[index]
  if (!current || current.retry >= MAX_RETRIES || current.mode === 'copy') return queue.slice()
  const next = queue.slice()
  const at = Math.min(index + 1 + REQUEUE_GAP, next.length)
  next.splice(at, 0, { ...current, retry: current.retry + 1 })
  return next
}
