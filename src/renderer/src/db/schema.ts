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
  }
}

export const db = new LearnDB()
