export type WordStatus = 'new' | 'learning' | 'mastered'

/** Cách hiển thị/gõ của từng lượt (mỗi lượt = 1 từ). */
export type PracticeMode = 'copy' | 'recall' | 'listen' | 'cloze'

/** Loại phiên luyện tập. */
export type SessionKind = 'lesson' | 'copy' | 'recall' | 'listen' | 'cloze' | 'review' | 'retry'

export interface Topic {
  id: string
  name: string
  nameEn: string
  emoji: string
  description?: string
  isBuiltIn: boolean
  order: number
  createdAt: number
}

export interface Word {
  id: string
  topicId: string
  word: string
  ipa: string
  partOfSpeech: string
  meaningVi: string
  emoji: string
  imageUrl?: string
  imageId?: string
  example: string
  exampleVi: string
  isBuiltIn: boolean
  createdAt: number
}

export interface StoredImage {
  id: string
  blob: Blob
  mime: string
}

export interface WordProgress {
  wordId: string
  topicId: string
  box: number
  status: WordStatus
  correct: number
  wrong: number
  lastSeenAt: number
  nextReviewAt: number
  firstLearnedAt: number | null
  masteredAt: number | null
}

export interface Session {
  id?: number
  kind: SessionKind
  topicId: string | null
  startedAt: number
  endedAt: number
  activeMs: number
  wordsTotal: number
  wordsCorrect: number
  keystrokes: number
  correctKeystrokes: number
  wpm: number
  accuracy: number
  newWordsLearned: number
  promoted: number
  /** Phiên luyện ở trang "Gõ chữ": không hiện hình ảnh/emoji của từ. */
  textOnly?: boolean
}

export interface Attempt {
  id?: number
  sessionId: number
  wordId: string
  topicId: string
  mode: PracticeMode
  correct: boolean
  hinted: boolean
  errors: number
  durationMs: number
  at: number
}

export interface MetaEntry {
  key: string
  value: unknown
}
