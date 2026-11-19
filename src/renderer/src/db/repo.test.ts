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
  installedPacks,
  installPack,
  saveWordLabels,
  uninstallPack,
  moveWords,
  recordAttempt,
  resetProgress,
  startSession,
  updateWord
} from './repo'
import { DAY_MS } from '@/core/srs'
import { newTarget } from '@/core/classify'
import { samplePack } from '@/core/packs.fixture'

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

  it('lưu câu trả lời sai và phím sai; dùng FSRS khi được chọn', async () => {
    await ensureSeed(NOW)
    const word = (await db.words.get('animals:cat'))!
    const sid = await startSession('recall', 'animals', NOW)
    await recordAttempt({ sessionId: sid, word, mode: 'copy', correct: true, hinted: false, errors: 0, durationMs: 2000 }, NOW)
    await recordAttempt(
      {
        sessionId: sid,
        word,
        mode: 'recall',
        correct: false,
        hinted: false,
        errors: 1,
        durationMs: 3000,
        answer: 'kat',
        wrongKeys: ['c>k'],
        algorithm: 'fsrs'
      },
      NOW + DAY_MS
    )
    const [, wrong] = await db.attempts.orderBy('id').toArray()
    expect(wrong).toMatchObject({ answer: 'kat', wrongKeys: ['c>k'], correct: false })
    const ok = (await db.attempts.orderBy('id').first())!
    expect(ok.answer).toBeUndefined()
    expect(ok.wrongKeys).toBeUndefined()
    const p = (await db.progress.get('animals:cat'))!
    // Only copied, never tested → new FSRS card: a wrong answer is not a "lapse"
    expect(p.fsrsState).toBeDefined()
    expect(p.lapses).toBe(0)
    expect(p.box).toBe(1)
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

describe('moveWords (phân loại lại)', () => {
  const blank = { ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }
  const r = (word: string, meaningVi: string, extra: Partial<typeof blank> = {}) => ({ word, meaningVi, ...blank, ...extra })

  const setup = async () => {
    await ensureSeed(NOW)
    const other = await createTopic({ name: 'Từ vựng khác', nameEn: '', emoji: '' }, NOW)
    const law = await createTopic({ name: 'Pháp luật', nameEn: '', emoji: '⚖️' }, NOW)
    await importWords(other, [r('verdict', 'phán quyết'), r('violin', 'đàn vi-ô-lông'), r('judge', '', {}), r('jury', 'bồi thẩm đoàn', { ipa: '/ˈdʒʊr.i/' })], NOW)
    await importWords(law, [r('jury', 'bồi thẩm', {})], NOW)
    const words = await db.words.where('topicId').equals(other).toArray()
    const id = (w: string) => words.find((x) => x.word === w)!.id
    return { other, law, id }
  }

  it('giữ id, đổi topicId của từ và tiến độ; chủ đề mới tạo một lần và gộp theo tên', async () => {
    const { other, law, id } = await setup()
    const session = await startSession('lesson', other, NOW)
    const verdict = (await db.words.get(id('verdict')))!
    await recordAttempt({ sessionId: session, word: verdict, mode: 'copy', correct: true, hinted: false, errors: 0, durationMs: 900 }, NOW)
    const res = await moveWords(
      [
        { target: { kind: 'topic', topicId: law }, wordIds: [id('verdict')] },
        { target: newTarget('Nghệ thuật', { emoji: '🎨' }), wordIds: [id('violin')] },
        { target: newTarget('NGHE THUAT'), wordIds: [] }
      ],
      NOW
    )
    expect(res).toMatchObject({ moved: 2, merged: 0 })
    expect(res.results.map((x) => [x.name, x.created, x.count])).toEqual([
      ['Pháp luật', false, 1],
      ['Nghệ thuật', true, 1]
    ])
    expect((await db.words.get(id('verdict')))?.topicId).toBe(law)
    expect((await db.progress.get(id('verdict')))?.topicId).toBe(law)
    // Lịch sử lượt gõ giữ nguyên
    expect((await db.attempts.toArray())[0].topicId).toBe(other)
    expect((await db.topics.toArray()).filter((t) => t.name === 'Nghệ thuật')).toHaveLength(1)
    expect(await db.words.where('topicId').equals(other).count()).toBe(1)
  })

  it('từ trùng ở chủ đề đích: gộp ô trống, chuyển tiến độ, xóa từ nguồn', async () => {
    const { other, law, id } = await setup()
    const jurySrc = id('jury')
    const session = await startSession('lesson', other, NOW)
    await recordAttempt({ sessionId: session, word: (await db.words.get(jurySrc))!, mode: 'copy', correct: true, hinted: false, errors: 0, durationMs: 900 }, NOW)
    const res = await moveWords([{ target: { kind: 'topic', topicId: law }, wordIds: [jurySrc] }], NOW)
    expect(res).toMatchObject({ moved: 0, merged: 1 })
    expect(await db.words.get(jurySrc)).toBeUndefined()
    expect(await db.progress.get(jurySrc)).toBeUndefined()
    const dst = (await db.words.where('topicId').equals(law).toArray()).find((w) => w.word === 'jury')!
    expect(dst.meaningVi).toBe('bồi thẩm') // không ghi đè ô đã có
    expect(dst.ipa).toBe('/ˈdʒʊr.i/') // điền ô trống
    expect((await db.progress.get(dst.id))?.topicId).toBe(law)
  })

  it('không chuyển vào chủ đề có sẵn, không thay đổi gì khi lỗi', async () => {
    const { other, id } = await setup()
    await expect(
      moveWords(
        [
          { target: newTarget('Tạm'), wordIds: [id('verdict')] },
          { target: { kind: 'topic', topicId: 'animals' }, wordIds: [id('violin')] }
        ],
        NOW
      )
    ).rejects.toThrow()
    expect(await db.words.where('topicId').equals(other).count()).toBe(3)
    expect((await db.topics.toArray()).some((t) => t.name === 'Tạm')).toBe(false)
  })
})

describe('gói luyện thi', () => {
  it('cài hai lần không nhân đôi, không đụng dữ liệu có sẵn', async () => {
    await ensureSeed(NOW)
    const r = await installPack(samplePack(), NOW)
    expect(r).toMatchObject({ topics: 2, words: 3, removed: 0, skipped: 1 })
    await installPack(samplePack(), NOW)
    expect(await db.words.where('packId').equals('toeic').count()).toBe(3)
    expect(await db.topics.count()).toBe(14)
    expect(await db.words.count()).toBe(243)
    expect(await installedPacks()).toMatchObject({ toeic: { version: 1, name: 'TOEIC' } })
    // ensureSeed (VD khi tăng BUILTIN_VERSION) không xóa từ của gói
    await db.meta.delete('seedVersion')
    await ensureSeed(NOW)
    expect(await db.words.count()).toBe(243)
    // Tìm theo nhãn / CEFR (index v2)
    expect(await db.words.where('tags').equals('barrons').count()).toBe(1)
    expect(await db.words.where('cefr').equals('B2').count()).toBe(2)
  })

  it('cập nhật gói giữ tiến độ, đổi chủ đề theo từ, xóa từ bị bỏ', async () => {
    await installPack(samplePack(), NOW)
    const agenda = (await db.words.get('pack-toeic:agenda'))!
    const deadline = (await db.words.get('pack-toeic:deadline'))!
    const sessionId = await startSession('lesson', agenda.topicId, NOW)
    for (const word of [agenda, deadline]) {
      await recordAttempt({ sessionId, word, mode: 'recall', correct: true, hinted: false, errors: 0, durationMs: 1000 }, NOW)
    }
    const v2 = samplePack({ version: 2 })
    v2.topics[0].words = v2.topics[0].words.filter((w) => w.word !== 'agenda' && w.word !== 'deadline')
    v2.topics[1].words.push({ word: 'agenda', meaningVi: 'chương trình họp' })
    const r = await installPack(v2, NOW + 1)
    expect(r.removed).toBe(1)
    expect(await db.words.get('pack-toeic:deadline')).toBeUndefined()
    expect(await db.progress.get('pack-toeic:deadline')).toBeUndefined()
    expect((await db.words.get('pack-toeic:agenda'))?.topicId).toBe('pack-toeic-finance')
    expect(await db.progress.get('pack-toeic:agenda')).toMatchObject({ topicId: 'pack-toeic-finance' })
    // Chủ đề "office" không còn từ nào nhưng vẫn có trong gói → giữ
    expect(await db.topics.get('pack-toeic-office')).toBeDefined()
    expect((await installedPacks()).toeic.version).toBe(2)
  })

  it('gỡ gói xóa chủ đề, từ, tiến độ; sao lưu không chứa từ của gói', async () => {
    await installPack(samplePack(), NOW)
    const word = (await db.words.get('pack-toeic:invoice'))!
    const sessionId = await startSession('lesson', word.topicId, NOW)
    await recordAttempt({ sessionId, word, mode: 'recall', correct: true, hinted: false, errors: 0, durationMs: 1000 }, NOW)
    const backup = await exportBackup(NOW)
    expect(backup.words.some((w) => w.packId)).toBe(false)
    await uninstallPack('toeic')
    expect(await db.words.where('packId').equals('toeic').count()).toBe(0)
    expect(await db.topics.where('packId').equals('toeic').count()).toBe(0)
    expect(await db.progress.count()).toBe(0)
    expect(await installedPacks()).toEqual({})
  })

  it('từ chối gói không hợp lệ hoặc rỗng', async () => {
    await expect(installPack({ ...samplePack(), app: 'x' } as never)).rejects.toThrow('không hợp lệ')
    const empty = samplePack()
    empty.topics.forEach((t) => (t.words = []))
    await expect(installPack(empty)).rejects.toThrow('không có từ nào')
  })
})

describe('saveWordLabels', () => {
  it('gắn CEFR + nhãn cho từ có sẵn, giữ qua ensureSeed, bỏ qua từ của gói', async () => {
    await ensureSeed(NOW)
    await installPack(samplePack(), NOW)
    const n = await saveWordLabels([
      { id: 'animals:cat', cefr: 'A1', tags: ['general'] },
      { id: 'animals:cat', tags: ['general'] },
      { id: 'pack-toeic:agenda', cefr: 'A1' },
      { id: 'missing', cefr: 'B1' }
    ])
    expect(n).toBe(1)
    expect(await db.words.get('animals:cat')).toMatchObject({ cefr: 'A1', tags: ['general'] })
    expect((await db.words.get('pack-toeic:agenda'))?.cefr).toBe('B2')
    await db.meta.delete('seedVersion')
    await ensureSeed(NOW)
    expect(await db.words.get('animals:cat')).toMatchObject({ cefr: 'A1', tags: ['general'] })
  })
})
