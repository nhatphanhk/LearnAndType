import { describe, expect, it } from 'vitest'
import { Rating, State } from 'ts-fsrs'
import { applyReview, boxForInterval, DAY_MS, dueAfterDays, gradeFor, MASTERED_BOX, newProgress, startOfDay, statusForBox, toCard } from './srs'
import type { WordProgress } from '@/types'

const NOW = new Date(2026, 10, 16, 20, 0, 0).getTime()

function at(box: number, nextReviewAt: number): WordProgress {
  return {
    ...newProgress('w', 't', NOW - 30 * DAY_MS),
    box,
    status: statusForBox(box),
    nextReviewAt,
    firstLearnedAt: NOW - 30 * DAY_MS
  }
}

describe('dueAfterDays', () => {
  it('đến hạn vào đầu ngày', () => {
    const tomorrow = new Date(startOfDay(NOW))
    tomorrow.setDate(tomorrow.getDate() + 1)
    expect(dueAfterDays(NOW, 1)).toBe(tomorrow.getTime())
  })
})

describe('applyReview', () => {
  it('Chép từ mới → hộp 1, đến hạn ngày mai', () => {
    const r = applyReview(newProgress('w', 't', NOW), { mode: 'copy', correct: true, hinted: false }, NOW)
    expect(r.learned).toBe(true)
    expect(r.progress.box).toBe(1)
    expect(r.progress.status).toBe('learning')
    expect(r.progress.nextReviewAt).toBe(dueAfterDays(NOW, 1))
    expect(r.progress.firstLearnedAt).toBe(NOW)
  })

  it('Chép không bao giờ thăng hạng', () => {
    const r = applyReview(at(2, NOW - DAY_MS), { mode: 'copy', correct: true, hinted: false }, NOW)
    expect(r.promoted).toBe(false)
    expect(r.progress.box).toBe(2)
  })

  it('đúng, không gợi ý, đã đến hạn → lên hộp', () => {
    const r = applyReview(at(2, NOW - 1), { mode: 'recall', correct: true, hinted: false }, NOW)
    expect(r.promoted).toBe(true)
    expect(r.progress.box).toBe(3)
    expect(r.progress.nextReviewAt).toBe(dueAfterDays(NOW, 7))
    expect(r.progress.correct).toBe(1)
  })

  it('đúng khi chưa đến hạn → không thăng hạng', () => {
    const due = dueAfterDays(NOW, 2)
    const r = applyReview(at(2, due), { mode: 'recall', correct: true, hinted: false }, NOW)
    expect(r.promoted).toBe(false)
    expect(r.progress.box).toBe(2)
    expect(r.progress.nextReviewAt).toBe(due)
  })

  it('dùng gợi ý → không thăng hạng', () => {
    const r = applyReview(at(2, NOW - 1), { mode: 'listen', correct: true, hinted: true }, NOW)
    expect(r.promoted).toBe(false)
    expect(r.progress.box).toBe(2)
  })

  it('sai → về hộp 1', () => {
    const r = applyReview(
      { ...at(4, NOW - 1), status: 'mastered', masteredAt: NOW - DAY_MS },
      { mode: 'cloze', correct: false, hinted: false },
      NOW
    )
    expect(r.demoted).toBe(true)
    expect(r.progress.box).toBe(1)
    expect(r.progress.status).toBe('learning')
    expect(r.progress.masteredAt).toBeNull()
    expect(r.progress.wrong).toBe(1)
  })

  it('từ mới trả lời sai vẫn được tính là đã học (hộp 1)', () => {
    const r = applyReview(newProgress('w', 't', NOW), { mode: 'recall', correct: false, hinted: false }, NOW)
    expect(r.learned).toBe(true)
    expect(r.progress.box).toBe(1)
  })

  it('lên hộp 4 → đã thuộc', () => {
    const r = applyReview(at(MASTERED_BOX - 1, NOW - 1), { mode: 'recall', correct: true, hinted: false }, NOW)
    expect(r.progress.status).toBe('mastered')
    expect(r.progress.masteredAt).toBe(NOW)
  })

  it('hộp cao nhất vẫn ở hộp 5 và gia hạn', () => {
    const r = applyReview(at(5, NOW - 1), { mode: 'recall', correct: true, hinted: false }, NOW)
    expect(r.progress.box).toBe(5)
    expect(r.progress.nextReviewAt).toBe(dueAfterDays(NOW, 30))
  })
})

describe('FSRS', () => {
  const fsrsInput = (correct: boolean, extra: Partial<Parameters<typeof applyReview>[1]> = {}) => ({
    mode: 'recall' as const,
    correct,
    hinted: false,
    algorithm: 'fsrs' as const,
    errors: 0,
    durationMs: 3000,
    answerLength: 5,
    ...extra
  })

  it('chấm điểm theo lỗi, gợi ý và tốc độ', () => {
    expect(gradeFor(fsrsInput(false))).toBe(Rating.Again)
    expect(gradeFor(fsrsInput(true, { hinted: true }))).toBe(Rating.Hard)
    expect(gradeFor(fsrsInput(true, { errors: 1 }))).toBe(Rating.Hard)
    expect(gradeFor(fsrsInput(true, { durationMs: 60_000 }))).toBe(Rating.Hard)
    expect(gradeFor(fsrsInput(true, { durationMs: 1000 }))).toBe(Rating.Easy)
    expect(gradeFor(fsrsInput(true))).toBe(Rating.Good)
  })

  it('map khoảng ôn → hộp', () => {
    expect([1, 2, 3, 6, 7, 13, 14, 29, 30, 200].map(boxForInterval)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5])
  })

  it('ôn đúng khi đến hạn: lưu trạng thái FSRS, Easy cho khoảng dài hơn Good', () => {
    const prev = at(2, NOW - 1)
    const good = applyReview(prev, fsrsInput(true), NOW).progress
    const easy = applyReview(prev, fsrsInput(true, { durationMs: 500 }), NOW).progress
    expect(good.stability).toBeGreaterThan(0)
    expect(good.lastReviewAt).toBe(NOW)
    expect(good.scheduledDays).toBeGreaterThanOrEqual(1)
    expect(easy.scheduledDays!).toBeGreaterThan(good.scheduledDays!)
    expect(good.nextReviewAt).toBe(dueAfterDays(NOW, good.scheduledDays!))
    expect(good.box).toBe(boxForInterval(good.scheduledDays!))
  })

  it('sai → khoảng ngắn (hộp 1), tăng số lần quên', () => {
    const prev = { ...at(4, NOW + 5 * DAY_MS), status: 'mastered' as const, masteredAt: NOW - DAY_MS }
    const r = applyReview(prev, fsrsInput(false), NOW)
    expect(r.progress.box).toBe(1)
    expect(r.demoted).toBe(true)
    expect(r.progress.masteredAt).toBeNull()
    expect(r.progress.lapses).toBe(1)
  })

  it('đúng khi chưa đến hạn → không đổi lịch (chống học dồn)', () => {
    const prev = at(2, NOW + DAY_MS)
    const r = applyReview(prev, fsrsInput(true), NOW)
    expect(r.progress.nextReviewAt).toBe(prev.nextReviewAt)
    expect(r.progress.stability).toBeUndefined()
    expect(r.progress.correct).toBe(1)
  })

  it('Chép từ mới vẫn chỉ đánh dấu đã học', () => {
    const r = applyReview(newProgress('w', 't', NOW), { ...fsrsInput(true), mode: 'copy' }, NOW)
    expect(r.progress.box).toBe(1)
    expect(r.progress.stability).toBeUndefined()
  })

  it('ôn liên tiếp đúng thì khoảng ôn tăng dần tới "đã thuộc"', () => {
    let p = at(1, NOW - 1)
    let t = NOW
    const intervals: number[] = []
    for (let i = 0; i < 5; i++) {
      p = applyReview(p, fsrsInput(true), t).progress
      intervals.push(p.scheduledDays!)
      t = p.nextReviewAt + 3600_000
    }
    for (let i = 1; i < intervals.length; i++) expect(intervals[i]).toBeGreaterThan(intervals[i - 1])
    expect(p.status).toBe('mastered')
  })

  it('toCard: từ mới học → thẻ mới; từ Leitner cũ → độ bền theo hộp', () => {
    expect(toCard(at(1, NOW), NOW).state).toBe(State.New)
    const c = toCard({ ...at(3, NOW), correct: 2 }, NOW)
    expect(c.state).toBe(State.Review)
    expect(c.stability).toBe(7)
  })
})
