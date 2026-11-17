import { describe, expect, it } from 'vitest'
import { buildQueue, MAX_RETRIES, pickLessonWords, pickPracticeWords, pickWordsForKind, requeue } from './queue'
import { newProgress } from './srs'
import type { Word, WordProgress } from '@/types'

function word(id: string, example = ''): Word {
  return {
    id,
    topicId: 't',
    word: id,
    ipa: '',
    partOfSpeech: 'n',
    meaningVi: id,
    emoji: '',
    example,
    exampleVi: '',
    isBuiltIn: true,
    createdAt: 0
  }
}

const rng = (): number => 0.5
const words = ['a', 'b', 'c', 'd'].map((id) => word(id))

describe('pickLessonWords', () => {
  it('ưu tiên từ mới, bổ sung từ đến hạn sớm nhất', () => {
    const progress = new Map<string, WordProgress>([
      ['a', { ...newProgress('a', 't', 0), box: 2, nextReviewAt: 200 }],
      ['b', { ...newProgress('b', 't', 0), box: 1, nextReviewAt: 100 }]
    ])
    expect(pickLessonWords(words, progress, 2).map((w) => w.id)).toEqual(['c', 'd'])
    expect(pickLessonWords(words, progress, 3).map((w) => w.id)).toEqual(['c', 'd', 'b'])
  })
})

describe('pickPracticeWords', () => {
  it('ưu tiên từ đã học đến hạn, rồi tới từ mới', () => {
    const progress = new Map<string, WordProgress>([
      ['a', { ...newProgress('a', 't', 0), box: 2, nextReviewAt: 200 }],
      ['c', { ...newProgress('c', 't', 0), box: 1, nextReviewAt: 100 }]
    ])
    expect(pickPracticeWords(words, progress, 3).map((w) => w.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('pickWordsForKind', () => {
  const progress = new Map<string, WordProgress>([
    ['a', { ...newProgress('a', 't', 0), box: 2, nextReviewAt: 200 }],
    ['c', { ...newProgress('c', 't', 0), box: 1, nextReviewAt: 100 }]
  ])
  const ids = (ws: Word[]): string[] => ws.map((w) => w.id)

  it('Chép / Bài học ưu tiên từ mới; Nhớ / Nghe ưu tiên từ đã học', () => {
    expect(ids(pickWordsForKind('copy', words, progress, 2, 0))).toEqual(['b', 'd'])
    expect(ids(pickWordsForKind('lesson', words, progress, 2, 0))).toEqual(['b', 'd'])
    expect(ids(pickWordsForKind('recall', words, progress, 3, 0))).toEqual(['c', 'a', 'b'])
    expect(ids(pickWordsForKind('listen', words, progress, 3, 0))).toEqual(['c', 'a', 'b'])
  })

  it('Điền câu chỉ lấy từ có câu ví dụ chứa từ đó', () => {
    const mixed = [word('cat', 'The cat sleeps.'), word('dog'), word('sun', 'No match here.')]
    expect(ids(pickWordsForKind('cloze', mixed, new Map(), 10, 0))).toEqual(['cat'])
  })

  it('Ôn tập lấy mọi từ đã đến hạn', () => {
    expect(ids(pickWordsForKind('review', words, progress, 1, 150))).toEqual(['c'])
    expect(ids(pickWordsForKind('review', words, progress, 1, 500))).toEqual(['a', 'c'])
  })
})

describe('buildQueue', () => {
  it('bài học: Chép theo thứ tự rồi Nhớ', () => {
    const q = buildQueue('lesson', words, rng)
    expect(q).toHaveLength(8)
    expect(q.slice(0, 4).map((i) => [i.wordId, i.mode, i.phase])).toEqual([
      ['a', 'copy', 1],
      ['b', 'copy', 1],
      ['c', 'copy', 1],
      ['d', 'copy', 1]
    ])
    expect(q.slice(4).every((i) => i.mode === 'recall' && i.phase === 2)).toBe(true)
    expect(new Set(q.slice(4).map((i) => i.wordId))).toEqual(new Set(['a', 'b', 'c', 'd']))
  })

  it('điền câu: dùng Nhớ khi câu không chứa từ', () => {
    const q = buildQueue('cloze', [word('cat', 'The cat sleeps.'), word('dog', 'No match.')], rng)
    const modes = Object.fromEntries(q.map((i) => [i.wordId, i.mode]))
    expect(modes).toEqual({ cat: 'cloze', dog: 'recall' })
  })

  it('ôn tập: xoay vòng các chế độ kiểm tra', () => {
    const q = buildQueue('review', words, rng)
    expect(q.every((i) => i.mode !== 'copy')).toBe(true)
    expect(new Set(q.map((i) => i.mode)).size).toBeGreaterThan(1)
  })
})

describe('requeue', () => {
  it('đưa từ sai về sau vài từ', () => {
    const q = buildQueue('recall', words, () => 0.999)
    const next = requeue(q, 0)
    expect(next).toHaveLength(5)
    expect(next[4].wordId).toBe(q[0].wordId)
    expect(next[4].retry).toBe(1)
  })

  it('không đưa lại quá số lần cho phép', () => {
    const q = buildQueue('recall', [word('a')], rng)
    const capped = [{ ...q[0], retry: MAX_RETRIES }]
    expect(requeue(capped, 0)).toHaveLength(1)
  })

  it('đưa lại ngay sau nếu ở gần cuối hàng đợi', () => {
    const q = buildQueue('recall', words, rng)
    const next = requeue(q, 3)
    expect(next).toHaveLength(5)
    expect(next[4].retry).toBe(1)
  })
})
