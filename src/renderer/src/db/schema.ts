import Dexie, { type EntityTable } from 'dexie'
import type { Attempt, MetaEntry, Session, StoredImage, Topic, Word, WordProgress } from '@/types'

export class LearnDB extends Dexie {
  topics!: EntityTable<Topic, 'id'>
  words!: EntityTable<Word, 'id'>
  images!: EntityTable<StoredImage, 'id'>
  progress!: EntityTable<WordProgress, 'wordId'>
  sessions!: EntityTable<Session, 'id'>
  attempts!: EntityTable<Attempt, 'id'>
  meta!: EntityTable<MetaEntry, 'key'>

  constructor(name = 'learn-and-type') {
    super(name)
    this.version(1).stores({
      topics: 'id, order',
      words: 'id, topicId, word',
      images: 'id',
      progress: 'wordId, topicId, box, nextReviewAt, firstLearnedAt',
      sessions: '++id, startedAt, kind, topicId',
      attempts: '++id, sessionId, wordId, at',
      meta: 'key'
    })
    // v2: gói luyện thi (TOEIC / IELTS) + nhãn, cấp độ CEFR
    this.version(2).stores({
      topics: 'id, order, packId',
      words: 'id, topicId, word, packId, *tags, cefr'
    })
  }
}

export const db = new LearnDB()
