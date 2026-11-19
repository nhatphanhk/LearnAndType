import { db } from './schema'
import { builtinEntities, BUILTIN_VERSION } from '@/data/builtin'
import { applyReview, newProgress, type ReviewResult } from '@/core/srs'
import type { CsvWord } from '@/core/csv'
import { normalizeName, type Target } from '@/core/classify'
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

export async function startSession(
  kind: SessionKind,
  topicId: string | null,
  now = Date.now(),
  textOnly = false
): Promise<number> {
  const id = await db.sessions.add({
    kind,
    topicId,
    ...(textOnly ? { textOnly: true } : {}),
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
    emoji: input.emoji.trim(),
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
    emoji: input.emoji.trim(),
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

/** Thêm / cập nhật nhiều từ. Dòng thiếu từ hoặc nghĩa bị bỏ qua (đếm trong `skipped`). */
export async function importWords(
  topicId: string,
  rows: readonly CsvWord[],
  now = Date.now()
): Promise<{ added: number; updated: number; skipped: number }> {
  await assertCustomTopic(topicId)
  return db.transaction('rw', [db.words], async () => {
    const existing = await db.words.where('topicId').equals(topicId).toArray()
    const byWord = new Map(existing.map((w) => [w.word.toLowerCase(), w]))
    let added = 0
    let updated = 0
    let skipped = 0
    const puts: Word[] = []
    rows.forEach((row, i) => {
      const data = cleanWord(row)
      if (!data.word || !data.meaningVi) {
        skipped++
        return
      }
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
    return { added, updated, skipped }
  })
}

export interface TopicImportResult {
  topicId: string
  name: string
  /** Chủ đề vừa được tạo trong lần nhập này. */
  created: boolean
  added: number
  updated: number
  skipped: number
}

type TopicByName = Map<string, Topic>

/**
 * Chủ đề đích của một Target: chủ đề đã có theo id, hoặc chủ đề "mới" — trùng tên (không phân biệt hoa thường / dấu)
 * với chủ đề tự tạo đã có thì dùng lại, nếu không thì tạo. Gọi bên trong transaction có bảng topics.
 */
async function resolveTargetTopic(
  target: Target,
  byName: TopicByName,
  now: number
): Promise<{ topicId: string; name: string; created: boolean }> {
  if (target.kind === 'topic') {
    const t = await db.topics.get(target.topicId)
    if (!t) throw new Error('Chủ đề không tồn tại.')
    if (t.isBuiltIn) throw new Error('Chỉ có thể thêm từ vào chủ đề do bạn tạo.')
    return { topicId: t.id, name: t.name, created: false }
  }
  const key = normalizeName(target.name)
  const hit = byName.get(key)
  if (hit) return { topicId: hit.id, name: hit.name, created: false }
  const input: TopicInput = { name: target.name, nameEn: target.nameEn, emoji: target.emoji, description: target.description }
  const topicId = await createTopic(input, now)
  byName.set(key, { ...input, description: input.description ?? '', id: topicId, isBuiltIn: false, order: 0, createdAt: now })
  return { topicId, name: input.name.trim(), created: true }
}

async function customTopicsByName(): Promise<TopicByName> {
  const custom = (await db.topics.toArray()).filter((t) => !t.isBuiltIn)
  return new Map(custom.map((t) => [normalizeName(t.name), t]))
}

/**
 * Nhập từ vào nhiều chủ đề (sau khi phân loại) trong một transaction.
 * Chủ đề "mới" trùng tên (không phân biệt hoa thường / dấu) với chủ đề tự tạo đã có thì dùng lại.
 */
export async function importIntoTopics(
  groups: readonly { target: Target; rows: readonly CsvWord[] }[],
  now = Date.now()
): Promise<TopicImportResult[]> {
  return db.transaction('rw', [db.topics, db.words], async () => {
    const byName = await customTopicsByName()
    const results = new Map<string, TopicImportResult>()
    for (const { target, rows } of groups) {
      if (rows.length === 0) continue
      const { topicId, name, created } = await resolveTargetTopic(target, byName, now)
      const r = await importWords(topicId, rows, now)
      const prev = results.get(topicId)
      results.set(topicId, {
        topicId,
        name,
        created: created || !!prev?.created,
        added: r.added + (prev?.added ?? 0),
        updated: r.updated + (prev?.updated ?? 0),
        skipped: r.skipped + (prev?.skipped ?? 0)
      })
    }
    const list = [...results.values()]
    // Không lưu được từ nào → báo lỗi (rollback chủ đề vừa tạo), tránh báo "thành công" giả
    if (!list.some((x) => x.added + x.updated > 0)) throw new Error('Không có từ nào được lưu (thiếu từ hoặc nghĩa).')
    return list
  })
}

export interface TopicMoveResult {
  topicId: string
  name: string
  created: boolean
  /** Số từ chuyển sang (kể cả từ gộp vào từ trùng đã có). */
  count: number
}

export interface MoveWordsResult {
  /** Từ được chuyển nguyên vẹn (giữ id, tiến độ, ảnh). */
  moved: number
  /** Từ trùng với từ đã có ở chủ đề đích → gộp vào từ đó. */
  merged: number
  results: TopicMoveResult[]
}

/**
 * Chuyển từ đã lưu sang chủ đề khác (phân loại lại) trong một transaction.
 * Giữ id từ nên tiến độ SRS và ảnh đi theo; lịch sử lượt gõ (attempts) giữ nguyên.
 * Chủ đề đích đã có từ trùng: giữ từ ở đích, điền ô trống bằng dữ liệu từ nguồn, chuyển tiến độ nếu đích chưa có, rồi xóa từ nguồn.
 */
export async function moveWords(
  groups: readonly { target: Target; wordIds: readonly string[] }[],
  now = Date.now()
): Promise<MoveWordsResult> {
  return db.transaction('rw', [db.topics, db.words, db.progress, db.images], async () => {
    const byName = await customTopicsByName()
    const results = new Map<string, TopicMoveResult>()
    let moved = 0
    let merged = 0
    for (const { target, wordIds } of groups) {
      if (wordIds.length === 0) continue
      const { topicId, name, created } = await resolveTargetTopic(target, byName, now)
      const existing = await db.words.where('topicId').equals(topicId).toArray()
      const byWord = new Map(existing.map((w) => [w.word.toLowerCase(), w]))
      let count = 0
      for (const id of wordIds) {
        const w = await db.words.get(id)
        if (!w) throw new Error('Từ không tồn tại.')
        if (w.isBuiltIn) throw new Error('Không thể chuyển từ có sẵn.')
        if (w.topicId === topicId) continue
        count++
        const dup = byWord.get(w.word.toLowerCase())
        if (!dup) {
          await db.words.update(id, { topicId })
          await db.progress.update(id, { topicId })
          byWord.set(w.word.toLowerCase(), { ...w, topicId })
          moved++
          continue
        }
        // Gộp vào từ đã có ở đích: chỉ điền ô đang trống
        const patch: Partial<Word> = {}
        for (const k of ['meaningVi', 'ipa', 'partOfSpeech', 'emoji', 'example', 'exampleVi', 'imageUrl'] as const) {
          if (!dup[k] && w[k]) patch[k] = w[k]
        }
        let imageKept = false
        if (!dup.imageId && w.imageId) {
          patch.imageId = w.imageId
          imageKept = true
        }
        if (Object.keys(patch).length) await db.words.update(dup.id, patch)
        const [srcProg, dstProg] = await Promise.all([db.progress.get(id), db.progress.get(dup.id)])
        if (srcProg && !dstProg) await db.progress.put({ ...srcProg, wordId: dup.id, topicId })
        await db.progress.delete(id)
        if (w.imageId && !imageKept) await db.images.delete(w.imageId)
        await db.words.delete(id)
        merged++
      }
      const prev = results.get(topicId)
      results.set(topicId, { topicId, name, created: created || !!prev?.created, count: count + (prev?.count ?? 0) })
    }
    return { moved, merged, results: [...results.values()].filter((r) => r.count > 0) }
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

/* ------------------------------ Trạng thái nhỏ (meta) ------------------------------ */

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.meta.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value })
}
