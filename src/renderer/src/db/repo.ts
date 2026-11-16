import { db } from './schema'
import { builtinEntities, BUILTIN_VERSION } from '@/data/builtin'
import { applyReview, newProgress, type ReviewResult } from '@/core/srs'
import type { CsvWord } from '@/core/csv'
import type { Attempt, PracticeMode, Session, SessionKind, StoredImage, Topic, Word, WordProgress } from '@/types'

const uid = (): string => crypto.randomUUID()

/* ----------------------------- Seed dữ liệu có sẵn ----------------------------- */

export async function ensureSeed(now = Date.now()): Promise<void> {
  const current = await db.meta.get('seedVersion')
  if (current?.value === BUILTIN_VERSION) return
  const { topics, words } = builtinEntities(now)
  await db.transaction('rw', [db.topics, db.words, db.progress, db.meta], async () => {
    const keepIds = new Set(words.map((w) => w.id))
    const oldBuiltin = await db.words.filter((w) => w.isBuiltIn).primaryKeys()
    const removed = oldBuiltin.filter((id) => !keepIds.has(id))
    if (removed.length) {
      await db.words.bulkDelete(removed)
      await db.progress.bulkDelete(removed)
    }
    // Giữ createdAt cũ để thứ tự ổn định
    const existing = new Map((await db.words.bulkGet(words.map((w) => w.id))).flatMap((w) => (w ? [[w.id, w]] : [])))
    await db.topics.bulkPut(topics)
    await db.words.bulkPut(words.map((w) => ({ ...w, createdAt: existing.get(w.id)?.createdAt ?? w.createdAt })))
    await db.meta.put({ key: 'seedVersion', value: BUILTIN_VERSION })
  })
}

/* ---------------------------------- Phiên học ---------------------------------- */

export async function startSession(kind: SessionKind, topicId: string | null, now = Date.now()): Promise<number> {
  const id = await db.sessions.add({
    kind,
    topicId,
    startedAt: now,
    endedAt: now,
    activeMs: 0,
    wordsTotal: 0,
    wordsCorrect: 0,
    keystrokes: 0,
    correctKeystrokes: 0,
    wpm: 0,
    accuracy: 100,
    newWordsLearned: 0,
    promoted: 0
  })
  return id as number
}

export type SessionStats = Pick<
  Session,
  | 'endedAt'
  | 'activeMs'
  | 'wordsTotal'
  | 'wordsCorrect'
  | 'keystrokes'
  | 'correctKeystrokes'
  | 'wpm'
  | 'accuracy'
  | 'newWordsLearned'
  | 'promoted'
>

export async function saveSessionStats(id: number, stats: SessionStats): Promise<void> {
  await db.sessions.update(id, stats)
}

/** Xóa phiên không có lượt gõ nào (mở ra rồi thoát ngay). */
export async function discardSessionIfEmpty(id: number): Promise<boolean> {
  const count = await db.attempts.where('sessionId').equals(id).count()
  if (count > 0) return false
  await db.sessions.delete(id)
  return true
}

export interface AttemptInput {
  sessionId: number
  word: Word
  mode: PracticeMode
  correct: boolean
  hinted: boolean
  errors: number
  durationMs: number
}

/** Ghi lượt gõ và cập nhật tiến độ SRS của từ trong một transaction. */
export async function recordAttempt(input: AttemptInput, now = Date.now()): Promise<ReviewResult> {
  return db.transaction('rw', [db.progress, db.attempts], async () => {
    const prev = (await db.progress.get(input.word.id)) ?? newProgress(input.word.id, input.word.topicId, now)
    const result = applyReview(
      { ...prev, topicId: input.word.topicId },
      { mode: input.mode, correct: input.correct, hinted: input.hinted },
      now
    )
    await db.progress.put(result.progress)
    const attempt: Attempt = {
      sessionId: input.sessionId,
      wordId: input.word.id,
      topicId: input.word.topicId,
      mode: input.mode,
      correct: input.correct,
      hinted: input.hinted,
      errors: input.errors,
      durationMs: input.durationMs,
      at: now
    }
    await db.attempts.add(attempt)
    return result
  })
}

/* ----------------------------------- Chủ đề ----------------------------------- */

export interface TopicInput {
  name: string
  nameEn: string
  emoji: string
  description?: string
}

export async function createTopic(input: TopicInput, now = Date.now()): Promise<string> {
  const last = await db.topics.orderBy('order').last()
  const id = `custom-${uid()}`
  await db.topics.add({
    id,
    name: input.name.trim(),
    nameEn: input.nameEn.trim(),
    emoji: input.emoji.trim() || '📘',
    description: input.description?.trim() ?? '',
    isBuiltIn: false,
    order: (last?.order ?? 0) + 1,
    createdAt: now
  })
  return id
}

export async function updateTopic(id: string, input: TopicInput): Promise<void> {
  const t = await db.topics.get(id)
  if (!t || t.isBuiltIn) throw new Error('Không thể sửa chủ đề có sẵn.')
  await db.topics.update(id, {
    name: input.name.trim(),
    nameEn: input.nameEn.trim(),
    emoji: input.emoji.trim() || '📘',
    description: input.description?.trim() ?? ''
  })
}

export async function deleteTopic(id: string): Promise<void> {
  const t = await db.topics.get(id)
  if (!t || t.isBuiltIn) throw new Error('Không thể xóa chủ đề có sẵn.')
  await db.transaction('rw', [db.topics, db.words, db.progress, db.images], async () => {
    const words = await db.words.where('topicId').equals(id).toArray()
    const imageIds = words.flatMap((w) => (w.imageId ? [w.imageId] : []))
    await db.images.bulkDelete(imageIds)
    await db.progress.where('topicId').equals(id).delete()
    await db.words.where('topicId').equals(id).delete()
    await db.topics.delete(id)
  })
}

/* ------------------------------------ Từ ------------------------------------ */

export type WordInput = Pick<Word, 'word' | 'meaningVi' | 'ipa' | 'partOfSpeech' | 'emoji' | 'example' | 'exampleVi'> & {
  imageUrl?: string
}

function cleanWord(input: WordInput): WordInput {
  const imageUrl = input.imageUrl?.trim()
  return {
    word: input.word.trim().replace(/\s+/g, ' '),
    meaningVi: input.meaningVi.trim(),
    ipa: input.ipa.trim(),
    partOfSpeech: input.partOfSpeech.trim(),
    emoji: input.emoji.trim(),
    example: input.example.trim(),
    exampleVi: input.exampleVi.trim(),
    imageUrl: imageUrl || undefined
  }
}

async function saveImage(file: Blob): Promise<string> {
  const image: StoredImage = { id: uid(), blob: file, mime: file.type || 'image/png' }
  await db.images.add(image)
  return image.id
}

async function assertCustomTopic(topicId: string): Promise<void> {
  const t = await db.topics.get(topicId)
  if (!t) throw new Error('Chủ đề không tồn tại.')
  if (t.isBuiltIn) throw new Error('Chỉ có thể thêm từ vào chủ đề do bạn tạo.')
}

export async function addWord(topicId: string, input: WordInput, image?: Blob, now = Date.now()): Promise<string> {
  await assertCustomTopic(topicId)
  const data = cleanWord(input)
  if (!data.word || !data.meaningVi) throw new Error('Cần nhập từ và nghĩa.')
  const dup = await db.words
    .where('topicId')
    .equals(topicId)
    .filter((w) => w.word.toLowerCase() === data.word.toLowerCase())
    .first()
  if (dup) throw new Error(`Từ "${data.word}" đã có trong chủ đề.`)
  const id = `${topicId}:${uid()}`
  const imageId = image ? await saveImage(image) : undefined
  await db.words.add({ ...data, id, topicId, imageId, isBuiltIn: false, createdAt: now })
  return id
}

/**
 * Cập nhật từ. `image`: Blob = thay ảnh, null = xóa ảnh đã tải lên, undefined = giữ nguyên.
 */
export async function updateWord(id: string, input: WordInput, image?: Blob | null): Promise<void> {
  const w = await db.words.get(id)
  if (!w || w.isBuiltIn) throw new Error('Không thể sửa từ có sẵn.')
  const data = cleanWord(input)
  if (!data.word || !data.meaningVi) throw new Error('Cần nhập từ và nghĩa.')
  let imageId = w.imageId
  if (image !== undefined) {
    if (w.imageId) await db.images.delete(w.imageId)
    imageId = image ? await saveImage(image) : undefined
  }
  await db.words.put({ ...w, ...data, imageId })
}

export async function deleteWord(id: string): Promise<void> {
  const w = await db.words.get(id)
  if (!w || w.isBuiltIn) throw new Error('Không thể xóa từ có sẵn.')
  await db.transaction('rw', [db.words, db.progress, db.images], async () => {
    if (w.imageId) await db.images.delete(w.imageId)
    await db.progress.delete(id)
    await db.words.delete(id)
  })
}

export async function importWords(
  topicId: string,
  rows: readonly CsvWord[],
  now = Date.now()
): Promise<{ added: number; updated: number }> {
  await assertCustomTopic(topicId)
  return db.transaction('rw', [db.words], async () => {
    const existing = await db.words.where('topicId').equals(topicId).toArray()
    const byWord = new Map(existing.map((w) => [w.word.toLowerCase(), w]))
    let added = 0
    let updated = 0
    const puts: Word[] = []
    rows.forEach((row, i) => {
      const data = cleanWord(row)
      const old = byWord.get(data.word.toLowerCase())
      if (old) {
        // Ô trống trong CSV không xóa dữ liệu đã có
        const filled = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''))
        puts.push({ ...old, ...filled })
        updated++
      } else {
        const w: Word = { ...data, id: `${topicId}:${uid()}`, topicId, isBuiltIn: false, createdAt: now + i }
        byWord.set(data.word.toLowerCase(), w)
        puts.push(w)
        added++
      }
    })
    await db.words.bulkPut(puts)
    return { added, updated }
  })
}

/* --------------------------- Sao lưu / khôi phục --------------------------- */

export interface BackupFile {
  app: 'LearnAndType'
  version: 1
  exportedAt: number
  topics: Topic[]
  words: Word[]
  images: { id: string; mime: string; dataUrl: string }[]
  progress: WordProgress[]
  sessions: Session[]
  attempts: Attempt[]
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function exportBackup(now = Date.now()): Promise<BackupFile> {
  const [topics, words, images, progress, sessions, attempts] = await Promise.all([
    db.topics.filter((t) => !t.isBuiltIn).toArray(),
    db.words.filter((w) => !w.isBuiltIn).toArray(),
    db.images.toArray(),
    db.progress.toArray(),
    db.sessions.toArray(),
    db.attempts.toArray()
  ])
  return {
    app: 'LearnAndType',
    version: 1,
    exportedAt: now,
    topics,
    words,
    images: await Promise.all(images.map(async (i) => ({ id: i.id, mime: i.mime, dataUrl: await blobToDataUrl(i.blob) }))),
    progress,
    sessions,
    attempts
  }
}

export function isBackupFile(x: unknown): x is BackupFile {
  const b = x as BackupFile
  return (
    !!b &&
    b.app === 'LearnAndType' &&
    b.version === 1 &&
    [b.topics, b.words, b.images, b.progress, b.sessions, b.attempts].every(Array.isArray)
  )
}

/** Thay toàn bộ dữ liệu người dùng (chủ đề tự tạo + tiến độ) bằng bản sao lưu. */
export async function importBackup(backup: BackupFile): Promise<void> {
  if (!isBackupFile(backup)) throw new Error('File sao lưu không hợp lệ.')
  const images: StoredImage[] = await Promise.all(
    backup.images.map(async (i) => ({ id: i.id, mime: i.mime, blob: await dataUrlToBlob(i.dataUrl) }))
  )
  await db.transaction('rw', [db.topics, db.words, db.images, db.progress, db.sessions, db.attempts], async () => {
    await db.topics.filter((t) => !t.isBuiltIn).delete()
    await db.words.filter((w) => !w.isBuiltIn).delete()
    await Promise.all([db.images.clear(), db.progress.clear(), db.sessions.clear(), db.attempts.clear()])
    await db.topics.bulkPut(backup.topics.map((t) => ({ ...t, isBuiltIn: false })))
    await db.words.bulkPut(backup.words.map((w) => ({ ...w, isBuiltIn: false })))
    await db.images.bulkPut(images)
    // Chỉ khôi phục tiến độ của những từ còn tồn tại
    const wordIds = new Set(await db.words.toCollection().primaryKeys())
    await db.progress.bulkPut(backup.progress.filter((p) => wordIds.has(p.wordId)))
    await db.sessions.bulkPut(backup.sessions)
    await db.attempts.bulkPut(backup.attempts)
  })
}

export async function resetProgress(): Promise<void> {
  await db.transaction('rw', [db.progress, db.sessions, db.attempts], async () => {
    await Promise.all([db.progress.clear(), db.sessions.clear(), db.attempts.clear()])
  })
}
