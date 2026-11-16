import { describe, expect, it } from 'vitest'
import { applyReview, DAY_MS, dueAfterDays, MASTERED_BOX, newProgress, startOfDay, statusForBox } from './srs'
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
