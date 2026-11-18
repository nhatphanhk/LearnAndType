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
  importIntoTopics,
  importWords,
  recordAttempt,
  resetProgress,
  startSession,
  updateWord
} from './repo'
import { DAY_MS } from '@/core/srs'
import { newTarget } from '@/core/classify'

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

  it('đánh dấu phiên chỉ chữ khi bật textOnly', async () => {
    const plain = await startSession('copy', null, NOW)
    const text = await startSession('copy', null, NOW, true)
    expect((await db.sessions.get(plain))?.textOnly).toBeUndefined()
    expect((await db.sessions.get(text))?.textOnly).toBe(true)
  })
})

describe('dữ liệu không ảnh, không icon', () => {
  it('chủ đề không icon giữ emoji rỗng, từ chỉ có từ + nghĩa', async () => {
    const tid = await createTopic({ name: 'Danh sách dán', nameEn: '', emoji: '  ' }, NOW)
    expect((await db.topics.get(tid))?.emoji).toBe('')
    const r = await importWords(tid, [
      { word: 'laptop', meaningVi: 'máy tính xách tay', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }
    ])
    expect(r).toEqual({ added: 1, updated: 0, skipped: 0 })
    const [w] = await db.words.where('topicId').equals(tid).toArray()
    expect(w).toMatchObject({ word: 'laptop', meaningVi: 'máy tính xách tay', emoji: '' })
    expect(w.imageUrl).toBeUndefined()
    expect(w.imageId).toBeUndefined()
  })

  it('bỏ qua từ chưa có nghĩa (nhập thông minh chưa tra được)', async () => {
    const tid = await createTopic({ name: 'Tra dở', nameEn: '', emoji: '' }, NOW)
    const blank = { ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }
    const r = await importWords(tid, [
      { word: 'negotiate', meaningVi: '  ', ...blank },
      { word: 'deadline', meaningVi: 'hạn chót', ...blank },
      { word: ' ', meaningVi: 'trống', ...blank }
    ])
    expect(r).toEqual({ added: 1, updated: 0, skipped: 2 })
    expect((await db.words.where('topicId').equals(tid).toArray()).map((w) => w.word)).toEqual(['deadline'])
  })
})

describe('importIntoTopics (phân loại khi nhập)', () => {
  const blank = { ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }
  const r = (word: string, meaningVi: string) => ({ word, meaningVi, ...blank })

  it('tạo chủ đề mới đúng một lần, dùng lại chủ đề cùng tên, mỗi từ vào đúng chủ đề', async () => {
    await ensureSeed(NOW)
    const office = await createTopic({ name: 'Văn phòng', nameEn: '', emoji: '' }, NOW)
    const res = await importIntoTopics(
      [
        { target: { kind: 'topic', topicId: office }, rows: [r('printer', 'máy in')] },
        { target: newTarget('Kinh doanh & tài chính', { emoji: '💰' }), rows: [r('invoice', 'hóa đơn')] },
        // Cùng tên viết khác → gộp vào chủ đề vừa tạo
        { target: newTarget('kinh doanh & TAI CHINH'), rows: [r('profit', 'lợi nhuận')] },
        // Trùng tên chủ đề đã có → dùng lại "Văn phòng"
        { target: newTarget('văn phòng'), rows: [r('stapler', 'cái dập ghim')] },
        { target: newTarget('Rỗng'), rows: [] }
      ],
      NOW
    )
    expect(res.map((x) => [x.name, x.created, x.added])).toEqual([
      ['Văn phòng', false, 2],
      ['Kinh doanh & tài chính', true, 2]
    ])
    const custom = (await db.topics.toArray()).filter((t) => !t.isBuiltIn)
    expect(custom.map((t) => t.name).sort()).toEqual(['Kinh doanh & tài chính', 'Văn phòng'])
    expect(custom.find((t) => t.name.startsWith('Kinh'))?.emoji).toBe('💰')
    const words = async (id: string) => (await db.words.where('topicId').equals(id).toArray()).map((w) => w.word).sort()
    expect(await words(office)).toEqual(['printer', 'stapler'])
    expect(await words(res[1].topicId)).toEqual(['invoice', 'profit'])
  })

  it('không ghi vào chủ đề có sẵn và không tạo dở dang khi lỗi', async () => {
    await ensureSeed(NOW)
    await expect(
      importIntoTopics(
        [
          { target: newTarget('Tạm'), rows: [r('a', 'b')] },
          { target: { kind: 'topic', topicId: 'animals' }, rows: [r('zebra', 'ngựa vằn')] }
        ],
        NOW
      )
    ).rejects.toThrow()
    expect((await db.topics.toArray()).filter((t) => !t.isBuiltIn)).toEqual([])
  })

  it('báo lỗi khi không lưu được từ nào và không để lại chủ đề rỗng', async () => {
    await ensureSeed(NOW)
    await expect(importIntoTopics([{ target: newTarget('Rỗng'), rows: [r('', '')] }], NOW)).rejects.toThrow(/Không có từ nào/)
    await expect(importIntoTopics([], NOW)).rejects.toThrow(/Không có từ nào/)
    expect((await db.topics.toArray()).filter((t) => !t.isBuiltIn)).toEqual([])
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
    expect(res).toEqual({ added: 1, updated: 1, skipped: 0 })
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
