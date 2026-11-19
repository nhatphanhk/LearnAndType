export type WordStatus = 'new' | 'learning' | 'mastered'

/** Cách hiển thị/gõ của từng lượt (mỗi lượt = 1 từ). */
export type PracticeMode = 'copy' | 'recall' | 'listen' | 'cloze' | 'choice' | 'family' | 'synonym' | 'collocation'

/** Thuật toán lặp lại ngắt quãng. */
export type SrsAlgorithm = 'fsrs' | 'leitner'

/** Loại phiên luyện tập. */
export type SessionKind =
  | 'lesson'
  | 'copy'
  | 'recall'
  | 'listen'
  | 'cloze'
  | 'choice'
  | 'drill'
  | 'review'
  | 'retry'
  | 'game'

/** Cấp độ CEFR của từ (theo Oxford 3000/5000, English Vocabulary Profile…). */
export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

export interface Topic {
  id: string
  name: string
  nameEn: string
  emoji: string
  description?: string
  isBuiltIn: boolean
  /** Thuộc gói luyện thi nào (VD "toeic"). Chủ đề của gói là chỉ đọc như chủ đề có sẵn. */
  packId?: string
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
  /* ---- Thông tin luyện thi (tùy chọn) ---- */
  packId?: string
  /** Nhãn nguồn / nhóm, VD "toeic", "awl-3", "barrons-600:lesson-12". */
  tags?: string[]
  cefr?: Cefr
  synonyms?: string[]
  collocations?: string[]
  /** Họ từ, VD decide → decision, decisive, decisively. */
  family?: string[]
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
  /* Trạng thái FSRS (chỉ có khi từ đã được ôn bằng FSRS). */
  stability?: number
  difficulty?: number
  reps?: number
  lapses?: number
  /** 0 = mới, 1 = đang học, 2 = ôn, 3 = học lại (theo FSRS). */
  fsrsState?: number
  /** Số ngày đã lên lịch ở lần ôn gần nhất. */
  scheduledDays?: number
  lastReviewAt?: number
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
  /** Câu trả lời đã nộp khi sai (để phân tích lỗi). */
  answer?: string
  /** Cặp phím gõ sai trong lượt, dạng "chữ đúng>chữ đã gõ". */
  wrongKeys?: string[]
  at: number
}

export interface MetaEntry {
  key: string
  value: unknown
}
