import { create } from 'zustand'
import { buildQueue, requeue, type QueueItem } from '@/core/queue'
import { calcAccuracy, calcWpm, classifyKeystroke, isMatch, makeCloze, nextHint, wrongKeyPairs } from '@/core/typing'
import { discardSessionIfEmpty, recordAttempt, saveSessionStats, startSession } from '@/db/repo'
import { useSettings } from './settingsStore'
import type { PracticeMode, SessionKind, Word } from '@/types'

/** typing = đang gõ; retype = trả lời sai, phải gõ lại đáp án đúng; done = xong từ, chờ sang từ tiếp. */
export type ItemPhase = 'typing' | 'retype' | 'done'

export interface ItemResult {
  wordId: string
  mode: PracticeMode
  correct: boolean
  hinted: boolean
  retry: number
  learned: boolean
  promoted: boolean
}

/** Khoảng nghỉ giữa 2 phím lớn hơn mức này thì không tính vào thời gian gõ. */
const IDLE_MS = 5000
/** Giới hạn số cặp phím sai lưu cho mỗi lượt. */
const MAX_WRONG_KEYS = 20

interface PracticeData {
  status: 'idle' | 'running' | 'finished'
  kind: SessionKind
  topicId: string | null
  /** Phiên chỉ chữ (trang "Gõ chữ"): không hiện hình ảnh/emoji của từ. */
  textOnly: boolean
  sessionId: number | null
  words: Record<string, Word>
  queue: QueueItem[]
  index: number
  typed: string
  phase: ItemPhase
  lastCorrect: boolean | null
  /** Câu trả lời người dùng đã nộp (để hiển thị khi sai). */
  lastAnswer: string
  hinted: boolean
  itemErrors: number
  /** Các cặp phím sai "đúng>gõ" của lượt đang gõ (để phân tích lỗi). */
  itemWrongKeys: string[]
  itemStartedAt: number
  lastKeyAt: number | null
  /** Tăng mỗi lần nhấn Enter khi chưa đúng để giao diện rung báo hiệu. */
  shake: number
  busy: boolean
  startedAt: number
  keystrokes: number
  correctKeystrokes: number
  /** Phím của từ đang kiểm tra, chỉ cộng vào tổng khi nộp. */
  pendingKeys: number
  pendingCorrectKeys: number
  activeMs: number
  results: ItemResult[]
}

export interface StartOptions {
  textOnly?: boolean
}

interface PracticeActions {
  start: (kind: SessionKind, topicId: string | null, words: Word[], opts?: StartOptions) => Promise<void>
  input: (value: string) => Promise<void>
  submit: () => Promise<void>
  hint: () => Promise<void>
  next: () => Promise<void>
  finish: () => Promise<void>
  reset: () => void
}

export type PracticeState = PracticeData & PracticeActions

const initial: PracticeData = {
  status: 'idle',
  kind: 'lesson',
  topicId: null,
  textOnly: false,
  sessionId: null,
  words: {},
  queue: [],
  index: 0,
  typed: '',
  phase: 'typing',
  lastCorrect: null,
  lastAnswer: '',
  hinted: false,
  itemErrors: 0,
  itemWrongKeys: [],
  itemStartedAt: 0,
  lastKeyAt: null,
  shake: 0,
  busy: false,
  startedAt: 0,
  keystrokes: 0,
  correctKeystrokes: 0,
  pendingKeys: 0,
  pendingCorrectKeys: 0,
  activeMs: 0,
  results: []
}

export function currentItem(s: PracticeData): QueueItem | undefined {
  return s.queue[s.index]
}

export function currentWord(s: PracticeData): Word | undefined {
  const item = currentItem(s)
  return item ? s.words[item.wordId] : undefined
}

/** Đáp án hợp lệ: từ gốc, hoặc (ở chế độ Điền câu) từ kèm hậu tố có trong câu. */
export function acceptsAnswer(word: Word, mode: PracticeMode, typed: string, caseSensitive = false): boolean {
  if (isMatch(word.word, typed, caseSensitive)) return true
  if (mode === 'cloze') {
    const cloze = makeCloze(word.example, word.word)
    if (cloze?.suffix && isMatch(word.word + cloze.suffix, typed, caseSensitive)) return true
  }
  return false
}

export function sessionStats(s: PracticeData, now: number) {
  const learned = s.results.filter((r) => r.learned).length
  const promoted = s.results.filter((r) => r.promoted).length
  return {
    endedAt: now,
    activeMs: Math.round(s.activeMs),
    wordsTotal: s.results.length,
    wordsCorrect: s.results.filter((r) => r.correct).length,
    keystrokes: s.keystrokes,
    correctKeystrokes: s.correctKeystrokes,
    wpm: calcWpm(s.correctKeystrokes, s.activeMs),
    accuracy: calcAccuracy(s.correctKeystrokes, s.keystrokes),
    newWordsLearned: learned,
    promoted
  }
}

export const usePractice = create<PracticeState>()((set, get) => {
  const caseSensitive = (): boolean => useSettings.getState().caseSensitive

  async function record(correct: boolean): Promise<void> {
    const s = get()
    const item = currentItem(s)
    const word = currentWord(s)
    if (!item || !word || s.sessionId === null) return
    const now = Date.now()
    const r = await recordAttempt(
      {
        sessionId: s.sessionId,
        word,
        mode: item.mode,
        correct,
        hinted: s.hinted,
        errors: s.itemErrors,
        durationMs: now - s.itemStartedAt,
        answer: correct ? undefined : s.lastAnswer,
        wrongKeys: s.itemWrongKeys.length > 0 ? s.itemWrongKeys.slice(0, MAX_WRONG_KEYS) : undefined,
        algorithm: useSettings.getState().srsAlgorithm
      },
      now
    )
    set((st) => ({
      results: [
        ...st.results,
        {
          wordId: word.id,
          mode: item.mode,
          correct,
          hinted: st.hinted,
          retry: item.retry,
          learned: r.learned,
          promoted: r.promoted
        }
      ]
    }))
    await saveSessionStats(s.sessionId, sessionStats(get(), now))
  }

  /** Hoàn tất từ ở chế độ Chép khi đã gõ đúng. */
  async function completeCopy(): Promise<void> {
    set({ phase: 'done', lastCorrect: true, busy: true })
    try {
      await record(true)
    } finally {
      set({ busy: false })
    }
  }

  return {
    ...initial,

    async start(kind, topicId, words, opts = {}) {
      const queue = buildQueue(kind, words)
      if (queue.length === 0) return
      const now = Date.now()
      const textOnly = opts.textOnly ?? false
      const sessionId = await startSession(kind, topicId, now, textOnly)
      set({
        ...initial,
        status: 'running',
        kind,
        topicId,
        textOnly,
        sessionId,
        words: Object.fromEntries(words.map((w) => [w.id, w])),
        queue,
        startedAt: now,
        itemStartedAt: now
      })
    },

    async input(raw) {
      const s = get()
      const item = currentItem(s)
      const word = currentWord(s)
      if (s.status !== 'running' || !item || !word || s.phase === 'done' || s.busy) return
      const value = raw.replace(/[\r\n\t]/g, '')
      const now = Date.now()
      const target = word.word
      const k = classifyKeystroke(target, s.typed, value, caseSensitive())
      const gap = s.lastKeyAt === null ? 0 : now - s.lastKeyAt
      const keys = k ? k.correct + k.wrong : 0
      const correctKeys = k ? k.correct : 0
      // Chế độ kiểm tra (không lộ đáp án): giữ riêng số phím đúng/sai tới khi nộp,
      // để độ chính xác hiển thị trực tiếp không tiết lộ chữ nào đang sai.
      const blind = item.mode !== 'copy' && s.phase === 'typing'
      set({
        typed: value.slice(0, target.length + 10),
        ...(blind
          ? { pendingKeys: s.pendingKeys + keys, pendingCorrectKeys: s.pendingCorrectKeys + correctKeys }
          : { keystrokes: s.keystrokes + keys, correctKeystrokes: s.correctKeystrokes + correctKeys }),
        itemErrors: s.itemErrors + (k ? k.wrong : 0),
        ...(s.phase === 'typing' && k && k.wrong > 0
          ? { itemWrongKeys: [...s.itemWrongKeys, ...wrongKeyPairs(target, s.typed, value, caseSensitive())] }
          : {}),
        activeMs: s.activeMs + (gap > 0 && gap < IDLE_MS ? gap : 0),
        lastKeyAt: now
      })
      if (isMatch(target, value, caseSensitive())) {
        if (s.phase === 'retype') set({ phase: 'done' })
        else if (item.mode === 'copy') await completeCopy()
      }
    },

    async submit() {
      const s = get()
      const item = currentItem(s)
      const word = currentWord(s)
      if (s.status !== 'running' || !item || !word || s.busy) return
      if (s.phase === 'done') {
        await get().next()
        return
      }
      if (item.mode === 'copy' || s.phase === 'retype') {
        // Phải gõ đúng mới qua được
        if (isMatch(word.word, s.typed, caseSensitive())) {
          if (s.phase === 'retype') set({ phase: 'done' })
          else await completeCopy()
        } else {
          set({ shake: s.shake + 1 })
        }
        return
      }
      const correct = acceptsAnswer(word, item.mode, s.typed, caseSensitive())
      set({
        busy: true,
        lastAnswer: s.typed,
        keystrokes: s.keystrokes + s.pendingKeys,
        correctKeystrokes: s.correctKeystrokes + s.pendingCorrectKeys,
        pendingKeys: 0,
        pendingCorrectKeys: 0
      })
      try {
        await record(correct)
        if (correct) {
          set({ phase: 'done', lastCorrect: true })
        } else {
          set((st) => ({
            phase: 'retype',
            lastCorrect: false,
            typed: '',
            queue: requeue(st.queue, st.index)
          }))
        }
      } finally {
        set({ busy: false })
      }
    },

    async hint() {
      const s = get()
      const item = currentItem(s)
      const word = currentWord(s)
      if (s.status !== 'running' || !item || !word || s.phase === 'done' || s.busy) return
      const typed = nextHint(word.word, s.typed, caseSensitive())
      set({ typed, hinted: s.phase === 'typing' ? true : s.hinted })
      if (isMatch(word.word, typed, caseSensitive())) {
        if (s.phase === 'retype') set({ phase: 'done' })
        else if (item.mode === 'copy') await completeCopy()
      }
    },

    async next() {
      const s = get()
      if (s.status !== 'running' || s.busy) return
      if (s.index + 1 >= s.queue.length) {
        await get().finish()
        return
      }
      set({
        index: s.index + 1,
        typed: '',
        phase: 'typing',
        lastCorrect: null,
        lastAnswer: '',
        hinted: false,
        itemErrors: 0,
        itemWrongKeys: [],
        pendingKeys: 0,
        pendingCorrectKeys: 0,
        itemStartedAt: Date.now(),
        lastKeyAt: null
      })
    },

    async finish() {
      const s = get()
      if (s.status !== 'running' || s.sessionId === null) return
      set({ status: 'finished' })
      if (s.results.length === 0) {
        await discardSessionIfEmpty(s.sessionId)
      } else {
        await saveSessionStats(s.sessionId, sessionStats(s, Date.now()))
      }
    },

    reset() {
      set({ ...initial })
    }
  }
})
