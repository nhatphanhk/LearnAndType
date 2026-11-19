import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import type { Attempt, Session, Topic, Word, WordProgress } from '@/types'

export function useTopics(): Topic[] | undefined {
  return useLiveQuery(() => db.topics.orderBy('order').toArray(), [])
}

export function useTopic(id: string | undefined): Topic | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.topics.get(id)) ?? null) : null), [id])
}

export function useWords(topicId?: string): Word[] | undefined {
  return useLiveQuery(
    () => (topicId ? db.words.where('topicId').equals(topicId).sortBy('createdAt') : db.words.toArray()),
    [topicId]
  )
}

export function useProgressMap(): Map<string, WordProgress> | undefined {
  return useLiveQuery(async () => new Map((await db.progress.toArray()).map((p) => [p.wordId, p])), [])
}

export function useSessions(): Session[] | undefined {
  return useLiveQuery(() => db.sessions.orderBy('startedAt').toArray(), [])
}

/** Thời điểm hiện tại, cập nhật định kỳ để số liệu "đến hạn" luôn đúng. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Nhóm từ theo chủ đề. */
export function groupByTopic(words: readonly Word[]): Map<string, Word[]> {
  const m = new Map<string, Word[]>()
  for (const w of words) {
    const list = m.get(w.topicId)
    if (list) list.push(w)
    else m.set(w.topicId, [w])
  }
  return m
}

/** Các lượt gõ từ thời điểm `since` (ms) trở đi. */
export function useAttemptsSince(since: number): Attempt[] | undefined {
  return useLiveQuery(() => db.attempts.where('at').aboveOrEqual(since).toArray(), [since])
}

/** Giá trị trong bảng meta (cập nhật trực tiếp). `undefined` khi đang tải. */
export function useMeta<T>(key: string, fallback: T): T | undefined {
  return useLiveQuery(async () => {
    const row = await db.meta.get(key)
    return row === undefined ? fallback : (row.value as T)
  }, [key])
}
