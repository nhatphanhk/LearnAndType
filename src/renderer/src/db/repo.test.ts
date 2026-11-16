import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './schema'
import {
  addWord,
  createTopic,
  deleteTopic,
  discardSessionIfEmpty,
  ensureSeed,
  exportBackup,
  importBackup,
  importWords,
  recordAttempt,
  resetProgress,
  startSession,
  updateWord
} from './repo'
import { DAY_MS } from '@/core/srs'

const NOW = new Date(2026, 10, 16, 10, 0, 0).getTime()

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('ensureSeed', () => {
  it('nạp 12 chủ đề có sẵn và chạy lại không nhân đôi', async () => {
    await ensureSeed(NOW)
    await ensureSeed(NOW)
    expect(await db.topics.count()).toBe(12)
    expect(await db.words.count()).toBe(240)
  })
})

describe('recordAttempt', () => {
  it('cập nhật tiến độ và lưu lịch sử', async () => {
    await ensureSeed(NOW)
    const word = (await db.words.get('animals:cat'))!
    const sid = await startSession('lesson', 'animals', NOW)
    const r1 = await recordAttempt(
      { sessionId: sid, word, mode: 'copy', correct: true, hinted: false, errors: 0, durationMs: 2000 },
      NOW
    )
    expect(r1.learned).toBe(true)
    expect((await db.progress.get('animals:cat'))?.box).toBe(1)

    // Ngày hôm sau ôn đúng → hộp 2
    const r2 = await recordAttempt(
      { sessionId: sid, word, mode: 'recall', correct: true, hinted: false, errors: 0, durationMs: 1500 },
      NOW + DAY_MS
    )
    expect(r2.promoted).toBe(true)
    expect((await db.progress.get('animals:cat'))?.box).toBe(2)
    expect(await db.attempts.count()).toBe(2)
    expect(await discardSessionIfEmpty(sid)).toBe(false)
  })

  it('xóa phiên rỗng', async () => {
    const sid = await startSession('recall', null, NOW)
    expect(await discardSessionIfEmpty(sid)).toBe(true)
    expect(await db.sessions.count()).toBe(0)
  })
})

describe('chủ đề & từ tự tạo', () => {
  it('thêm, import CSV, cập nhật và xóa', async () => {
    await ensureSeed(NOW)
    const tid = await createTopic({ name: 'Văn phòng', nameEn: 'Office', emoji: '🏢' }, NOW)
    const wid = await addWord(tid, {
      word: 'printer',
      meaningVi: 'máy in',
      ipa: '/ˈprɪn.t̬ɚ/',
      partOfSpeech: 'n',
      emoji: '🖨️',
      example: 'The printer is broken.',
      exampleVi: ''
    })
    await expect(
      addWord(tid, { word: 'Printer', meaningVi: 'x', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' })
    ).rejects.toThrow()
    await expect(
      addWord('animals', { word: 'x', meaningVi: 'x', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' })
    ).rejects.toThrow()

    const res = await importWords(tid, [
      { word: 'printer', meaningVi: 'máy in (cập nhật)', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' },
      { word: 'desk', meaningVi: 'bàn làm việc', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }
    ])
    expect(res).toEqual({ added: 1, updated: 1 })
    const updatedWord = await db.words.get(wid)
    expect(updatedWord?.meaningVi).toBe('máy in (cập nhật)')
    // Ô trống trong CSV giữ nguyên dữ liệu cũ
    expect(updatedWord?.example).toBe('The printer is broken.')
    expect(updatedWord?.ipa).toBe('/ˈprɪn.t̬ɚ/')
    expect(updatedWord?.emoji).toBe('🖨️')

    await updateWord(
      wid,
      { word: 'printer', meaningVi: 'máy in', ipa: '', partOfSpeech: 'n', emoji: '🖨️', example: '', exampleVi: '' },
      new Blob(['img'], { type: 'image/png' })
    )
    expect(await db.images.count()).toBe(1)

    await deleteTopic(tid)
    expect(await db.words.where('topicId').equals(tid).count()).toBe(0)
    expect(await db.images.count()).toBe(0)
    await expect(deleteTopic('animals')).rejects.toThrow()
  })
})

describe('sao lưu / khôi phục', () => {
  it('khôi phục đúng chủ đề tự tạo và tiến độ', async () => {
    await ensureSeed(NOW)
    const tid = await createTopic({ name: 'Riêng', nameEn: 'Mine', emoji: '⭐' }, NOW)
    await addWord(
      tid,
      { word: 'hello', meaningVi: 'xin chào', ipa: '', partOfSpeech: '', emoji: '👋', example: '', exampleVi: '' },
      new Blob(['abc'], { type: 'image/png' })
    )
    const word = (await db.words.get('food:rice'))!
    const sid = await startSession('copy', 'food', NOW)
    await recordAttempt({ sessionId: sid, word, mode: 'copy', correct: true, hinted: false, errors: 0, durationMs: 1 }, NOW)

    const backup = JSON.parse(JSON.stringify(await exportBackup(NOW)))
    expect(backup.images[0].dataUrl).toMatch(/^data:image\/png;base64,/)

    await deleteTopic(tid)
    await resetProgress()
    expect(await db.progress.count()).toBe(0)

    await importBackup(backup)
    expect(await db.topics.get(tid)).toBeDefined()
    expect(await db.words.where('topicId').equals(tid).count()).toBe(1)
    expect(await db.progress.get('food:rice')).toBeDefined()
    expect(await db.sessions.count()).toBe(1)
    expect(await db.images.count()).toBe(1)
    expect(await db.topics.count()).toBe(13)
  })
})
