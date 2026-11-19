import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  FALLING_LIVES,
  GAME_INFO,
  SPRINT_MS,
  matchFalling,
  pickLane,
  spawnInterval,
  stepFalling,
  wordPoints,
  type FallingItem,
  type GameId,
  type Highscores
} from '@/core/game'
import { shuffle } from '@/core/queue'
import { calcAccuracy, calcWpm, isMatch } from '@/core/typing'
import { discardSessionIfEmpty, recordAttempt, saveSessionStats, setMeta, startSession, getMeta } from '@/db/repo'
import { useMeta, useProgressMap, useTopics, useWords } from '@/hooks/useData'
import { sfx } from '@/hooks/sfx'
import { useSettings } from '@/store/settingsStore'
import { toast } from '@/components/Toast'
import { Button, Card, Kbd, PageHeader, cx, inputCls } from '@/components/ui'
import { topicLabel } from '@/labels'
import type { Word } from '@/types'

const MIN_WORDS = 4
const IDLE_MS = 5000

interface GameResult {
  game: GameId
  score: number
  best: number
  isRecord: boolean
  correct: number
  missed: Word[]
  wpm: number
  accuracy: number
}

/* ------------------------------- Ghi phiên chơi ------------------------------- */

interface Tracker {
  sessionId: number | null
  keys: number
  correctKeys: number
  activeMs: number
  lastKeyAt: number | null
  total: number
  correct: number
  learned: number
  promoted: number
}

const EMPTY_TRACKER: Tracker = {
  sessionId: null,
  keys: 0,
  correctKeys: 0,
  activeMs: 0,
  lastKeyAt: null,
  total: 0,
  correct: 0,
  learned: 0,
  promoted: 0
}

/** Ghi lượt chơi vào lịch sử học (phiên loại "Trò chơi") và cập nhật tiến độ ôn tập của từ. */
function useGameSession(topicId: string | null) {
  const t = useRef<Tracker>({ ...EMPTY_TRACKER })
  const algorithm = useSettings((s) => s.srsAlgorithm)

  const start = useCallback(async (): Promise<void> => {
    t.current = { ...EMPTY_TRACKER, sessionId: await startSession('game', topicId) }
  }, [topicId])

  /** Gọi mỗi khi ô nhập thay đổi, để tính số phím và thời gian gõ. */
  const keystroke = useCallback((prev: string, next: string): void => {
    const now = Date.now()
    const cur = t.current
    if (next.length > prev.length) cur.keys += next.length - prev.length
    if (cur.lastKeyAt !== null && now - cur.lastKeyAt < IDLE_MS) cur.activeMs += now - cur.lastKeyAt
    cur.lastKeyAt = now
  }, [])

  const record = useCallback(
    async (word: Word, correct: boolean, durationMs: number, errors: number, answer?: string): Promise<void> => {
      const cur = t.current
      if (cur.sessionId === null) return
      cur.total++
      if (correct) {
        cur.correct++
        cur.correctKeys += word.word.length
      }
      const r = await recordAttempt({
        sessionId: cur.sessionId,
        word,
        mode: 'recall',
        correct,
        hinted: false,
        errors,
        durationMs,
        answer: correct ? undefined : answer,
        algorithm
      })
      if (r.learned) cur.learned++
      if (r.promoted) cur.promoted++
    },
    [algorithm]
  )

  /** Kết thúc phiên, lưu điểm cao. */
  const finish = useCallback(async (game: GameId, score: number): Promise<{ best: number; isRecord: boolean; wpm: number; accuracy: number }> => {
    const cur = t.current
    const now = Date.now()
    const wpm = calcWpm(cur.correctKeys, cur.activeMs)
    const accuracy = calcAccuracy(Math.min(cur.correctKeys, cur.keys), cur.keys)
    if (cur.sessionId !== null) {
      if (cur.total === 0) await discardSessionIfEmpty(cur.sessionId)
      else
        await saveSessionStats(cur.sessionId, {
          endedAt: now,
          activeMs: Math.round(cur.activeMs),
          wordsTotal: cur.total,
          wordsCorrect: cur.correct,
          keystrokes: cur.keys,
          correctKeystrokes: Math.min(cur.correctKeys, cur.keys),
          wpm,
          accuracy,
          newWordsLearned: cur.learned,
          promoted: cur.promoted
        })
      cur.sessionId = null
    }
    const scores = await getMeta<Highscores>('highscores', {})
    const prev = scores[game] ?? 0
    const isRecord = score > prev
    if (isRecord) await setMeta('highscores', { ...scores, [game]: score })
    return { best: Math.max(prev, score), isRecord, wpm, accuracy }
  }, [])

  return { start, keystroke, record, finish }
}

/* --------------------------------- Từ rơi --------------------------------- */

function FallingGame({
  pool,
  topicId,
  onDone
}: {
  pool: Word[]
  topicId: string | null
  onDone: (r: GameResult) => void
}): ReactNode {
  const session = useGameSession(topicId)
  const caseSensitive = useSettings((s) => s.caseSensitive)
  const sound = useSettings((s) => s.soundEffects)
  const [, setTick] = useState(0)
  const [typed, setTyped] = useState('')
  const typingStartedAt = useRef<number | null>(null)
  const st = useRef({
    items: [] as FallingItem[],
    lives: FALLING_LIVES,
    score: 0,
    combo: 0,
    correct: 0,
    missed: [] as Word[],
    startedAt: 0,
    lastFrame: 0,
    nextSpawnAt: 0,
    nextKey: 1,
    order: shuffle(pool),
    cursor: 0,
    over: false,
    flash: null as null | { text: string; good: boolean; at: number }
  })
  const byId = useMemo(() => new Map(pool.map((w) => [w.id, w])), [pool])
  const inputRef = useRef<HTMLInputElement>(null)

  const end = useCallback(async () => {
    const s = st.current
    if (s.over) return
    s.over = true
    sound && sfx.done()
    const r = await session.finish('falling', s.score)
    onDone({ game: 'falling', score: s.score, correct: s.correct, missed: s.missed, ...r })
  }, [session, onDone, sound])

  useEffect(() => {
    let raf = 0
    let alive = true
    void session.start().then(() => {
      if (!alive) return
      const now = performance.now()
      st.current.startedAt = now
      st.current.lastFrame = now
      st.current.nextSpawnAt = now
      const frame = (t: number): void => {
        const s = st.current
        if (s.over || !alive) return
        const elapsed = t - s.startedAt
        const dt = Math.min(100, t - s.lastFrame)
        s.lastFrame = t
        if (t >= s.nextSpawnAt) {
          if (s.cursor >= s.order.length) {
            s.order = shuffle(pool)
            s.cursor = 0
          }
          const w = s.order[s.cursor++]
          s.items.push({ key: s.nextKey++, wordId: w.id, answer: w.word, y: 0, x: pickLane(s.items), spawnedAt: t })
          s.nextSpawnAt = t + spawnInterval(elapsed)
        }
        const { alive: rest, missed } = stepFalling(s.items, dt, elapsed)
        s.items = rest
        if (missed.length > 0) {
          s.lives -= missed.length
          s.combo = 0
          for (const m of missed) {
            const w = byId.get(m.wordId)
            if (w) s.missed.push(w)
          }
          s.flash = { text: `Trượt: ${missed.map((m) => m.answer).join(', ')}`, good: false, at: t }
          sound && sfx.wrong()
          if (s.lives <= 0) {
            void end()
            setTick((n) => n + 1)
            return
          }
        }
        setTick((n) => n + 1)
        raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    })
    inputRef.current?.focus()
    return () => {
      alive = false
      cancelAnimationFrame(raf)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const onInput = (value: string): void => {
    const v = value.replace(/[\r\n\t]/g, '')
    session.keystroke(typed, v)
    if (typed === '' && v !== '') typingStartedAt.current = Date.now()
    const s = st.current
    const i = matchFalling(s.items, v, caseSensitive)
    if (i < 0) {
      setTyped(v)
      return
    }
    const hit = s.items[i]
    s.items = s.items.filter((_, j) => j !== i)
    s.score += wordPoints(s.combo, hit.answer.length)
    s.combo++
    s.correct++
    s.flash = { text: `+${wordPoints(s.combo - 1, hit.answer.length)} ${hit.answer}`, good: true, at: performance.now() }
    sound && sfx.correct()
    const w = byId.get(hit.wordId)
    if (w) void session.record(w, true, Date.now() - (typingStartedAt.current ?? Date.now()), 0)
    typingStartedAt.current = null
    setTyped('')
  }

  const s = st.current
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-sm">
        <div className="flex gap-4 font-semibold tabular-nums">
          <span>Điểm: {s.score}</span>
          <span>Combo: ×{s.combo}</span>
          <span aria-label={`${Math.max(0, s.lives)} mạng`}>{'❤️'.repeat(Math.max(0, s.lives))}{'🤍'.repeat(FALLING_LIVES - Math.max(0, s.lives))}</span>
        </div>
        <Button size="sm" onClick={() => void end()}>
          Kết thúc (Esc)
        </Button>
      </div>
      <div className="relative h-[440px] overflow-hidden rounded-2xl bg-gradient-to-b from-indigo-50 to-white ring-1 ring-slate-200 dark:from-indigo-950/60 dark:to-slate-900 dark:ring-slate-800">
        {s.items.map((it) => {
          const w = byId.get(it.wordId)
          return (
            <div
              key={it.key}
              className={cx(
                'absolute max-w-[180px] -translate-x-1/2 rounded-xl bg-white px-3 py-1.5 text-center text-sm font-medium shadow ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700',
                it.y > 0.75 && 'ring-2 ring-rose-400'
              )}
              style={{ left: `${it.x * 100}%`, top: `${it.y * 88}%` }}
            >
              {w?.meaningVi ?? '?'}
            </div>
          )
        })}
        <div className="absolute inset-x-0 bottom-0 h-1 bg-rose-400/60" />
        {s.flash && performance.now() - s.flash.at < 1200 && (
          <div
            className={cx(
              'absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-sm font-semibold text-white',
              s.flash.good ? 'bg-emerald-600' : 'bg-rose-600'
            )}
          >
            {s.flash.text}
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        value={typed}
        onChange={(e) => onInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') void end()
          if (e.key === 'Enter') setTyped('')
        }}
        className={cx(inputCls, 'mt-4 py-3 text-center text-xl')}
        placeholder="Gõ từ tiếng Anh…"
        autoComplete="off"
        spellCheck={false}
        aria-label="Gõ từ tiếng Anh"
      />
      <p className="mt-2 text-center text-xs text-slate-500">
        Gõ đúng là phá ngay, không cần Enter · <Kbd>Enter</Kbd> xóa ô gõ
      </p>
    </div>
  )
}

/* ------------------------------- Đua 60 giây ------------------------------- */

function SprintGame({
  pool,
  topicId,
  onDone
}: {
  pool: Word[]
  topicId: string | null
  onDone: (r: GameResult) => void
}): ReactNode {
  const session = useGameSession(topicId)
  const caseSensitive = useSettings((s) => s.caseSensitive)
  const sound = useSettings((s) => s.soundEffects)
  const [order, setOrder] = useState(() => shuffle(pool))
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState('')
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [missed, setMissed] = useState<Word[]>([])
  const [errors, setErrors] = useState(0)
  const [shake, setShake] = useState(0)
  const [lastSkip, setLastSkip] = useState<Word | null>(null)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const wordStartedAt = useRef(Date.now())
  const over = useRef(false)
  const scoreRef = useRef(0)
  const correctRef = useRef(0)
  const missedRef = useRef<Word[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  scoreRef.current = score
  correctRef.current = correct
  missedRef.current = missed

  const word = order[index % order.length]

  const end = useCallback(async () => {
    if (over.current) return
    over.current = true
    sound && sfx.done()
    const r = await session.finish('sprint', scoreRef.current)
    onDone({ game: 'sprint', score: scoreRef.current, correct: correctRef.current, missed: missedRef.current, ...r })
  }, [session, onDone, sound])

  useEffect(() => {
    void session.start().then(() => {
      setEndsAt(Date.now() + SPRINT_MS)
      wordStartedAt.current = Date.now()
    })
    inputRef.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (endsAt === null) return
    const t = setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n >= endsAt) {
        clearInterval(t)
        void end()
      }
    }, 200)
    return () => clearInterval(t)
  }, [endsAt, end])

  const advance = (): void => {
    const next = index + 1
    if (next % order.length === 0) setOrder(shuffle(pool))
    setIndex(next)
    setTyped('')
    setErrors(0)
    wordStartedAt.current = Date.now()
  }

  const onInput = (value: string): void => {
    if (over.current || endsAt === null) return
    const v = value.replace(/[\r\n\t]/g, '')
    session.keystroke(typed, v)
    setTyped(v)
    if (!isMatch(word.word, v, caseSensitive)) return
    const pts = wordPoints(combo, word.word.length)
    setScore((x) => x + pts)
    setCombo((c) => c + 1)
    setCorrect((c) => c + 1)
    setLastSkip(null)
    sound && sfx.correct()
    void session.record(word, true, Date.now() - wordStartedAt.current, errors)
    advance()
  }

  const skip = (): void => {
    if (over.current || endsAt === null) return
    setCombo(0)
    setMissed((m) => [...m, word])
    setLastSkip(word)
    sound && sfx.wrong()
    void session.record(word, false, Date.now() - wordStartedAt.current, errors + 1, typed)
    advance()
  }

  const left = endsAt === null ? SPRINT_MS : Math.max(0, endsAt - now)

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between text-sm font-semibold tabular-nums">
        <span>Điểm: {score}</span>
        <span>Combo: ×{combo}</span>
        <span className={cx(left < 10_000 && 'text-rose-600')}>⏱️ {Math.ceil(left / 1000)} giây</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="h-full bg-indigo-500 transition-[width] duration-200" style={{ width: `${(left / SPRINT_MS) * 100}%` }} />
      </div>
      <Card className="mt-6 text-center">
        <div className="text-sm text-slate-500">{word.partOfSpeech && `(${word.partOfSpeech})`}</div>
        <div className="mt-1 text-3xl font-bold">{word.meaningVi}</div>
        <div className="mt-2 text-sm text-slate-400">{word.word.length} chữ cái</div>
        <input
          ref={inputRef}
          key={shake}
          value={typed}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              skip()
            } else if (e.key === 'Enter') {
              setErrors((x) => x + 1)
              setShake((x) => x + 1)
              sound && sfx.wrong()
            } else if (e.key === 'Escape') void end()
          }}
          className={cx(inputCls, 'mt-5 py-3 text-center text-xl', shake > 0 && 'animate-shake')}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="Gõ từ tiếng Anh"
        />
        <div className="mt-3 h-5 text-sm text-rose-600">{lastSkip && `Bỏ qua: ${lastSkip.word}`}</div>
      </Card>
      <p className="mt-3 text-center text-xs text-slate-500">
        Gõ đúng là tự sang từ mới · <Kbd>Tab</Kbd> bỏ qua · <Kbd>Esc</Kbd> kết thúc
      </p>
    </div>
  )
}

/* --------------------------------- Trang chính --------------------------------- */

export default function Games(): ReactNode {
  const topics = useTopics()
  const words = useWords()
  const progress = useProgressMap()
  const highscores = useMeta<Highscores>('highscores', {})
  const [source, setSource] = useState<string>('learned')
  const [playing, setPlaying] = useState<{ game: GameId; pool: Word[]; round: number } | null>(null)
  const [result, setResult] = useState<GameResult | null>(null)

  const pool = useMemo(() => {
    if (!words || !progress) return []
    const usable = words.filter((w) => w.word.trim() && w.meaningVi.trim())
    return source === 'learned'
      ? usable.filter((w) => (progress.get(w.id)?.box ?? 0) > 0)
      : usable.filter((w) => w.topicId === source)
  }, [words, progress, source])

  const topicId = source === 'learned' ? null : source

  const play = (game: GameId): void => {
    if (pool.length < MIN_WORDS) {
      toast.info(`Cần ít nhất ${MIN_WORDS} từ có nghĩa để chơi. Hãy học thêm từ hoặc chọn chủ đề khác.`)
      return
    }
    setResult(null)
    setPlaying((p) => ({ game, pool: [...pool], round: (p?.round ?? 0) + 1 }))
  }

  const onDone = useCallback((r: GameResult) => {
    setPlaying(null)
    setResult(r)
  }, [])

  if (!topics || !words || !progress) return null

  if (playing) {
    const Game = playing.game === 'falling' ? FallingGame : SprintGame
    return (
      <div>
        <PageHeader title={`${GAME_INFO[playing.game].icon} ${GAME_INFO[playing.game].title}`} />
        <Game key={playing.round} pool={playing.pool} topicId={topicId} onDone={onDone} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="🎮 Trò chơi"
        subtitle="Luyện gõ từ vựng theo kiểu chơi game. Mỗi từ gõ đúng vẫn được tính vào tiến độ và mục tiêu hằng ngày."
      />

      {result && (
        <Card className="mb-6 border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-sm text-slate-500">
                {GAME_INFO[result.game].icon} {GAME_INFO[result.game].title}
              </div>
              <div className="text-3xl font-bold tabular-nums">
                {result.score} điểm {result.isRecord && <span className="ml-2 text-base text-amber-600">🏆 Kỷ lục mới!</span>}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {result.correct} từ đúng · {result.wpm} WPM · kỷ lục {result.best}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => play(result.game)}>
                Chơi lại
              </Button>
              <Button onClick={() => setResult(null)}>Đóng</Button>
            </div>
          </div>
          {result.missed.length > 0 && (
            <div className="mt-4 text-sm">
              <span className="text-slate-500">Cần ôn lại: </span>
              {[...new Map(result.missed.map((w) => [w.id, w])).values()].map((w, i) => (
                <span key={w.id}>
                  {i > 0 && ', '}
                  <b>{w.word}</b> <span className="text-slate-500">({w.meaningVi})</span>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <label className="flex flex-wrap items-center gap-3">
          <span className="font-medium">Nguồn từ</span>
          <select className={cx(inputCls, 'w-auto min-w-64')} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="learned">⭐ Tất cả từ đã học</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {topicLabel(t)}
              </option>
            ))}
          </select>
          <span className={cx('text-sm', pool.length < MIN_WORDS ? 'text-amber-600' : 'text-slate-500')}>{pool.length} từ</span>
        </label>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {(Object.keys(GAME_INFO) as GameId[]).map((g) => (
          <Card key={g} className="flex flex-col">
            <div className="text-4xl">{GAME_INFO[g].icon}</div>
            <h2 className="mt-3 text-lg font-semibold">{GAME_INFO[g].title}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-500">{GAME_INFO[g].desc}</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">Kỷ lục: {highscores?.[g] ?? 0}</span>
              <Button variant="primary" onClick={() => play(g)} disabled={pool.length < MIN_WORDS}>
                ▶ Chơi
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Từ gõ đúng được ghi như một lượt “Nhớ từ” (chỉ lên lịch ôn khi từ đã đến hạn). Ở Từ rơi, từ bị trượt không bị tính là sai
        vì có thể do tốc độ; ở Đua 60 giây, bỏ qua một từ được tính là chưa nhớ.
      </p>
    </div>
  )
}
