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

  it('phiên Gõ chữ mang cờ textOnly vào state và bản ghi phiên', async () => {
    const words = (await db.words.where('topicId').equals('food').limit(2).toArray()) as Word[]
    await s().start('copy', 'food', words, { textOnly: true })
    expect(s().textOnly).toBe(true)
    expect((await db.sessions.get(s().sessionId!))?.textOnly).toBe(true)

    // Phiên thường không bị ảnh hưởng bởi phiên trước
    s().reset()
    await s().start('copy', 'food', words)
    expect(s().textOnly).toBe(false)
    expect((await db.sessions.get(s().sessionId!))?.textOnly).toBeUndefined()
  })

  it('Điền câu chấp nhận cả dạng có hậu tố', async () => {
    const carrot = (await db.words.get('fruits:carrot'))!
    expect(acceptsAnswer(carrot, 'cloze', 'carrot')).toBe(true)
    expect(acceptsAnswer(carrot, 'cloze', 'carrots')).toBe(true)
    expect(acceptsAnswer(carrot, 'recall', 'carrots')).toBe(false)
  })
})

describe('trắc nghiệm', () => {
  it('chọn đúng → xong; chọn sai → gõ lại đáp án và gặp lại sau', async () => {
    const pool = (await db.words.where('topicId').equals('animals').toArray()) as Word[]
    const words = pool.slice(0, 3)
    await s().start('choice', 'animals', words, { pool })
    expect(s().queue).toHaveLength(3)
    for (const item of s().queue) {
      expect(item.mode).toBe('choice')
      expect(item.options).toHaveLength(4)
      expect(item.options).toContain(s().words[item.wordId].word)
    }

    // Gõ phím / Enter bị bỏ qua khi đang chọn
    await s().input('abc')
    await s().submit()
    expect(s().typed).toBe('')
    expect(s().phase).toBe('typing')

    const first = currentWord(s())!
    await s().choose(first.word)
    expect(s().phase).toBe('done')
    expect(s().lastCorrect).toBe(true)
    await s().submit()

    const second = currentWord(s())!
    const wrong = currentItem(s())!.options!.find((o) => o !== second.word)!
    await s().choose(wrong)
    expect(s().phase).toBe('retype')
    expect(s().lastAnswer).toBe(wrong)
    expect(s().queue).toHaveLength(4)
    await typeWord(second.word)
    expect(s().phase).toBe('done')

    const attempts = await db.attempts.toArray()
    expect(attempts.map((a) => [a.mode, a.correct])).toEqual([
      ['choice', true],
      ['choice', false]
    ])
    expect(attempts[1].answer).toBe(wrong)
  })
})

describe('luyện chuyên sâu', () => {
  it('họ từ: gõ dạng từ được hỏi; đồng nghĩa: chọn phương án', async () => {
    const base = (await db.words.where('topicId').equals('animals').toArray()) as Word[]
    const decide: Word = { ...base[0], id: 'd', word: 'decide', family: ['decision (n)'], synonyms: undefined, collocations: undefined }
    const big: Word = { ...base[1], id: 'b', word: 'big', synonyms: ['large'], family: undefined, collocations: undefined }
    await s().start('drill', null, [decide, big], { pool: [decide, big, ...base] })
    expect(s().queue).toHaveLength(2)
    for (let i = 0; i < 2; i++) {
      const item = currentItem(s())!
      if (item.mode === 'family') {
        expect(item.answer).toBe('decision')
        await typeWord('decide')
        await s().submit()
        expect(s().phase).toBe('retype')
        await typeWord('decision')
        expect(s().phase).toBe('done')
      } else {
        expect(item.mode).toBe('synonym')
        expect(item.options).toContain('large')
        await s().choose('large')
        expect(s().lastCorrect).toBe(true)
      }
      await s().submit()
    }
    const attempts = await db.attempts.toArray()
    expect(attempts.map((a) => a.mode).sort()).toEqual(['family', 'synonym'])
  })

  it('collocation chấp nhận từ kèm hậu tố trong cụm', () => {
    const w = { word: 'meet', example: '' } as Word
    expect(acceptsAnswer(w, 'collocation', 'meets', false, { prompt: 'she meets a deadline' })).toBe(true)
    expect(acceptsAnswer(w, 'collocation', 'meet', false, { prompt: 'meet a deadline' })).toBe(true)
    expect(acceptsAnswer(w, 'recall', 'meets')).toBe(false)
  })
})
