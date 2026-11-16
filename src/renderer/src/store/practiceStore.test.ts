import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/db/schema'
import { ensureSeed } from '@/db/repo'
import { acceptsAnswer, currentItem, currentWord, usePractice } from './practiceStore'
import type { Word } from '@/types'

const s = usePractice.getState

async function typeWord(text: string): Promise<void> {
  let acc = ''
  for (const ch of text) {
    acc += ch
    await s().input(acc)
  }
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureSeed()
  usePractice.getState().reset()
})

describe('practice store', () => {
  it('bài học: Chép rồi Nhớ, từ sai được đưa lại hàng đợi', async () => {
    const words = (await db.words.where('topicId').equals('animals').limit(2).toArray()) as Word[]
    await s().start('lesson', 'animals', words)
    expect(s().status).toBe('running')
    expect(s().queue).toHaveLength(4)

    // Pha Chép: gõ đúng tự hoàn tất
    for (let i = 0; i < 2; i++) {
      const w = currentWord(s())!
      expect(currentItem(s())!.mode).toBe('copy')
      await typeWord(w.word)
      expect(s().phase).toBe('done')
      await s().submit() // Enter → từ tiếp
    }
    expect(await db.progress.count()).toBe(2)

    // Pha Nhớ: trả lời sai từ đầu tiên
    const first = currentWord(s())!
    expect(currentItem(s())!.mode).toBe('recall')
    await typeWord('zzz')
    await s().submit()
    expect(s().phase).toBe('retype')
    expect(s().lastCorrect).toBe(false)
    expect(s().queue).toHaveLength(5)
    await typeWord(first.word)
    expect(s().phase).toBe('done')
    await s().submit()

    // Trả lời đúng các từ còn lại (kể cả từ bị đưa lại)
    while (s().status === 'running') {
      const w = currentWord(s())!
      await typeWord(w.word)
      await s().submit()
      expect(s().lastCorrect).toBe(true)
      await s().submit()
    }

    expect(s().status).toBe('finished')
    expect(s().results).toHaveLength(5)
    expect(s().results.filter((r) => r.learned)).toHaveLength(2)
    const session = (await db.sessions.toArray())[0]
    expect(session.wordsTotal).toBe(5)
    expect(session.wordsCorrect).toBe(4)
    expect(session.newWordsLearned).toBe(2)
    expect(session.keystrokes).toBeGreaterThan(0)
    expect(await db.attempts.count()).toBe(5)
  })

  it('Enter khi chép chưa đúng thì rung, không ghi nhận', async () => {
    const words = (await db.words.where('topicId').equals('food').limit(1).toArray()) as Word[]
    await s().start('copy', 'food', words)
    await typeWord('x')
    await s().submit()
    expect(s().shake).toBe(1)
    expect(s().phase).toBe('typing')
    expect(await db.attempts.count()).toBe(0)
  })

  it('gợi ý đánh dấu hinted', async () => {
    const words = (await db.words.where('topicId').equals('food').limit(1).toArray()) as Word[]
    await s().start('recall', 'food', words)
    await s().hint()
    expect(s().typed).toBe(words[0].word[0])
    expect(s().hinted).toBe(true)
  })

  it('chế độ Nhớ không lộ độ chính xác trước khi nộp', async () => {
    const words = (await db.words.where('topicId').equals('animals').limit(1).toArray()) as Word[]
    await s().start('recall', 'animals', words)
    await typeWord('zz')
    expect(s().keystrokes).toBe(0)
    expect(s().correctKeystrokes).toBe(0)
    await s().submit()
    expect(s().keystrokes).toBe(2)
    expect(s().correctKeystrokes).toBe(0)
    expect(s().pendingKeys).toBe(0)
  })

  it('thoát sớm khi chưa gõ gì thì xóa phiên', async () => {
    const words = (await db.words.where('topicId').equals('food').limit(3).toArray()) as Word[]
    await s().start('listen', 'food', words)
    await s().finish()
    expect(await db.sessions.count()).toBe(0)
  })

  it('Điền câu chấp nhận cả dạng có hậu tố', async () => {
    const carrot = (await db.words.get('fruits:carrot'))!
    expect(acceptsAnswer(carrot, 'cloze', 'carrot')).toBe(true)
    expect(acceptsAnswer(carrot, 'cloze', 'carrots')).toBe(true)
    expect(acceptsAnswer(carrot, 'recall', 'carrots')).toBe(false)
  })
})
