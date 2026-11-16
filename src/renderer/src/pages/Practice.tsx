import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { db } from '@/db/schema'
import { pickLessonWords } from '@/core/queue'
import { calcAccuracy, calcWpm, makeCloze } from '@/core/typing'
import { currentItem, currentWord, sessionStats, usePractice } from '@/store/practiceStore'
import { useSettings } from '@/store/settingsStore'
import { speak, stopSpeaking } from '@/hooks/useSpeech'
import { sfx } from '@/hooks/sfx'
import { useTopic } from '@/hooks/useData'
import { TypingSlots } from '@/components/TypingSlots'
import { WordImage } from '@/components/WordImage'
import { Badge, Button, Card, Kbd, StatTile, cx } from '@/components/ui'
import { KIND_INFO, MODE_LABEL, formatDuration, posLabel } from '@/labels'
import { launchSession } from '@/launch'
import type { Word } from '@/types'

const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i

export default function Practice(): ReactNode {
  const status = usePractice((s) => s.status)
  if (status === 'idle') return <Navigate to="/" replace />
  if (status === 'finished') return <Summary />
  return <Runner />
}

/** Hiển thị câu ví dụ, tô đậm từ đang học. */
function Example({ word }: { word: Word }): ReactNode {
  if (!word.example) return null
  const cloze = makeCloze(word.example, word.word)
  return (
    <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-800/60">
      <div className="text-lg">
        {cloze ? (
          <>
            {cloze.before}
            <b className="text-indigo-600 dark:text-indigo-400">
              {word.example.slice(cloze.before.length, word.example.length - cloze.after.length)}
            </b>
            {cloze.after}
          </>
        ) : (
          word.example
        )}
      </div>
      {word.exampleVi && <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{word.exampleVi}</div>}
    </div>
  )
}

function SpeakButton({ text, big }: { text: string; big?: boolean }): ReactNode {
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      title="Nghe phát âm (Ctrl+Space)"
      className={cx(
        'cursor-pointer rounded-full text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950',
        big ? 'emoji p-6 text-6xl' : 'emoji p-1.5 text-xl'
      )}
    >
      🔊
    </button>
  )
}

function Runner(): ReactNode {
  const s = usePractice()
  const settings = useSettings()
  const topic = useTopic(s.topicId ?? undefined)
  const inputRef = useRef<HTMLInputElement>(null)
  const prevPhase = useRef(s.phase)
  const item = currentItem(s)
  const word = currentWord(s)
  const [composing, setComposing] = useState(false)

  // Giữ focus vào ô nhập ẩn
  useEffect(() => {
    inputRef.current?.focus()
  }, [s.index, s.phase])

  // Phát âm khi bắt đầu từ mới
  useEffect(() => {
    if (!item || !word) return
    if (item.mode === 'listen' || (item.mode === 'copy' && settings.autoSpeak)) {
      const t = setTimeout(() => speak(word.word), 150)
      return () => clearTimeout(t)
    }
    return undefined
  }, [s.index, word?.id, item?.mode])

  // Âm thanh & phát âm khi có kết quả
  useEffect(() => {
    const prev = prevPhase.current
    prevPhase.current = s.phase
    if (!item || !word || prev === s.phase) return
    if (s.phase === 'retype') {
      sfx.wrong()
      if (settings.autoSpeak || item.mode === 'listen') speak(word.word)
    } else if (s.phase === 'done') {
      sfx.correct()
      if (prev === 'typing' && item.mode !== 'copy' && settings.autoSpeak) speak(word.word)
    }
  }, [s.phase])

  // Tự chuyển từ khi trả lời đúng
  useEffect(() => {
    if (!settings.autoAdvance || s.phase !== 'done' || !s.lastCorrect) return
    const t = setTimeout(() => void usePractice.getState().next(), item?.mode === 'copy' ? 700 : 1300)
    return () => clearTimeout(t)
  }, [settings.autoAdvance, s.phase, s.lastCorrect, s.index, item?.mode])

  useEffect(() => () => stopSpeaking(), [])

  if (!item || !word) return null

  const reveal = item.mode === 'copy' || s.phase !== 'typing'
  const showImage = item.mode !== 'listen' || reveal
  const showMeaning = item.mode !== 'listen' || reveal
  const cloze = item.mode === 'cloze' ? makeCloze(word.example, word.word) : null
  const total = s.queue.length
  const wpm = calcWpm(s.correctKeystrokes, s.activeMs)
  const acc = calcAccuracy(s.correctKeystrokes, s.keystrokes)
  const viWarning = VI_CHARS.test(s.typed) && !VI_CHARS.test(word.word)
  const info = KIND_INFO[s.kind]

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (composing) return
    const st = usePractice.getState()
    if (e.key === 'Enter') {
      e.preventDefault()
      void st.submit()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      void st.hint()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      void st.finish()
    } else if (e.key === ' ' && e.ctrlKey) {
      e.preventDefault()
      speak(word.word)
    }
  }

  let instruction: ReactNode
  if (s.phase === 'done') {
    instruction = (
      <>
        Nhấn <Kbd>Enter</Kbd> để sang từ tiếp theo
      </>
    )
  } else if (s.phase === 'retype') {
    instruction = 'Gõ lại đáp án đúng để ghi nhớ'
  } else if (item.mode === 'copy') {
    instruction = 'Gõ lại từ phía trên'
  } else if (item.mode === 'recall') {
    instruction = (
      <>
        Gõ từ tiếng Anh rồi nhấn <Kbd>Enter</Kbd> · Không nhớ? Nhấn <Kbd>Tab</Kbd> để gợi ý
      </>
    )
  } else if (item.mode === 'listen') {
    instruction = (
      <>
        Gõ từ bạn nghe được rồi nhấn <Kbd>Enter</Kbd> · <Kbd>Ctrl</Kbd>+<Kbd>Space</Kbd> để nghe lại
      </>
    )
  } else {
    instruction = (
      <>
        Điền từ còn thiếu rồi nhấn <Kbd>Enter</Kbd>
      </>
    )
  }

  const slotVariant = item.mode === 'copy' || s.phase === 'retype' ? 'live' : 'blind'
  const slotResult = s.phase === 'done' ? 'correct' : undefined

  return (
    <div className="flex h-full flex-col" onMouseUp={() => inputRef.current?.focus()}>
      {/* Thanh trên */}
      <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-900">
        <Button variant="ghost" size="sm" onClick={() => void usePractice.getState().finish()} title="Kết thúc (Esc)">
          ✕ Kết thúc
        </Button>
        <div className="min-w-0">
          <div className="truncate font-semibold">
            <span className="emoji mr-1">{info.icon}</span>
            {info.title}
            {topic && <span className="font-normal text-slate-500"> · {topic.name}</span>}
          </div>
          {s.kind === 'lesson' && (
            <div className="text-xs text-slate-500">
              {item.phase === 1 ? 'Phần 1/2: Chép để làm quen' : 'Phần 2/2: Tự nhớ lại'}
            </div>
          )}
        </div>
        <div className="mx-4 flex flex-1 items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-indigo-500 transition-all"
              style={{ width: `${(s.index / total) * 100}%` }}
            />
          </div>
          <span className="text-sm text-slate-500 tabular-nums">
            {s.index + 1}/{total}
          </span>
        </div>
        <div className="flex gap-4 text-sm tabular-nums">
          <span title="Tốc độ gõ (từ/phút)">
            <b>{wpm}</b> <span className="text-slate-500">WPM</span>
          </span>
          <span title="Độ chính xác phím gõ">
            <b>{acc}%</b> <span className="text-slate-500">chính xác</span>
          </span>
        </div>
      </header>

      {/* Nội dung */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <Card className="animate-pop w-full max-w-3xl p-8" key={`${s.index}`}>
          <div className="mb-4 flex items-center justify-center gap-2">
            <span data-role="mode" data-mode={item.mode} data-phase={s.phase}>
              <Badge tone="indigo">{MODE_LABEL[item.mode]}</Badge>
            </span>
            {item.retry > 0 && <Badge tone="amber">Ôn lại lần {item.retry}</Badge>}
            {s.hinted && s.phase !== 'typing' && <Badge tone="slate">Đã dùng gợi ý</Badge>}
          </div>

          <div className="flex flex-col items-center text-center">
            {showImage ? (
              <WordImage word={word} size="lg" />
            ) : (
              <SpeakButton text={word.word} big />
            )}

            {reveal && (
              <div className="mt-4 flex items-center gap-2">
                <span data-role="word" className="text-4xl font-bold tracking-tight">{word.word}</span>
                <SpeakButton text={word.word} />
              </div>
            )}
            {reveal && (word.ipa || word.partOfSpeech) && (
              <div className="mt-1 text-slate-500 dark:text-slate-400">
                {word.ipa} {word.partOfSpeech && <i className="ml-1">({posLabel(word.partOfSpeech)})</i>}
              </div>
            )}
            {showMeaning && (
              <div data-role="meaning" className={cx('font-semibold text-indigo-700 dark:text-indigo-300', reveal ? 'mt-2 text-xl' : 'mt-5 text-3xl')}>
                {word.meaningVi}
              </div>
            )}
            {!reveal && item.mode === 'recall' && word.partOfSpeech && (
              <div className="mt-1 text-sm text-slate-500">({posLabel(word.partOfSpeech)})</div>
            )}

            {cloze && s.phase === 'typing' && (
              <div className="mt-5 rounded-xl bg-slate-50 px-5 py-4 text-xl dark:bg-slate-800/60">
                {cloze.before}
                <span className="mx-1 inline-block min-w-24 border-b-2 border-indigo-500 px-1 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                  {s.typed || ' '}
                </span>
                {cloze.suffix}
                {cloze.after}
                {word.exampleVi && <div className="mt-1 text-sm text-slate-500">{word.exampleVi}</div>}
              </div>
            )}
          </div>

          {s.phase === 'retype' && (
            <div className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-center text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
              {s.lastAnswer ? (
                <>
                  Bạn gõ <s className="font-mono">{s.lastAnswer}</s> — đáp án đúng là{' '}
                  <b className="font-mono">{word.word}</b>
                </>
              ) : (
                <>
                  Đáp án là <b className="font-mono">{word.word}</b>
                </>
              )}
            </div>
          )}
          {s.phase === 'done' && item.mode !== 'copy' && (
            <div
              className={cx(
                'mt-5 rounded-xl px-4 py-2 text-center font-medium',
                s.lastCorrect
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
              )}
            >
              {s.lastCorrect ? 'Chính xác! 🎉' : 'Đã gõ lại đúng — từ này sẽ được ôn lại sớm.'}
            </div>
          )}

          <div key={s.shake} className={cx('mt-8', s.shake > 0 && 'animate-shake')}>
            <TypingSlots
              target={word.word}
              typed={s.typed}
              variant={slotVariant}
              hideLength={settings.hideLength}
              result={slotResult}
              caseSensitive={settings.caseSensitive}
            />
          </div>

          {viWarning && (
            <div className="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-center text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
              Có vẻ bộ gõ tiếng Việt (Unikey/EVKey/Telex) đang bật. Hãy chuyển sang chế độ gõ tiếng Anh để gõ đúng.
            </div>
          )}

          {s.phase === 'done' && <Example word={word} />}

          <div className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">{instruction}</div>
        </Card>
      </div>

      <footer className="flex justify-center gap-6 pb-4 text-xs text-slate-500">
        <span>
          <Kbd>Enter</Kbd> nộp / tiếp
        </span>
        <span>
          <Kbd>Tab</Kbd> gợi ý 1 chữ
        </span>
        <span>
          <Kbd>Ctrl</Kbd>+<Kbd>Space</Kbd> nghe lại
        </span>
        <span>
          <Kbd>Esc</Kbd> kết thúc
        </span>
      </footer>

      <input
        ref={inputRef}
        value={s.typed}
        onChange={(e) => void usePractice.getState().input(e.target.value)}
        onKeyDown={onKeyDown}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={(e) => {
          setComposing(false)
          void usePractice.getState().input(e.currentTarget.value)
        }}
        onBlur={() => setTimeout(() => inputRef.current?.focus(), 0)}
        autoFocus
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Ô gõ từ"
        className="pointer-events-none fixed -top-20 left-0 h-px w-px opacity-0"
      />
    </div>
  )
}

function Summary(): ReactNode {
  const s = usePractice()
  const navigate = useNavigate()
  const stats = useMemo(() => sessionStats(s, Date.now()), [s])
  const lessonSize = useSettings((st) => st.lessonSize)

  useEffect(() => {
    if (s.results.length > 0) sfx.done()
  }, [s.results.length])

  // Kết quả theo từng từ: sai nếu có bất kỳ lượt kiểm tra nào sai
  const perWord = useMemo(() => {
    const m = new Map<string, { word: Word; wrong: boolean; tested: boolean; learned: boolean; promoted: boolean }>()
    for (const r of s.results) {
      const w = s.words[r.wordId]
      if (!w) continue
      const e = m.get(r.wordId) ?? { word: w, wrong: false, tested: false, learned: false, promoted: false }
      if (r.mode !== 'copy') e.tested = true
      if (!r.correct) e.wrong = true
      if (r.learned) e.learned = true
      if (r.promoted) e.promoted = true
      m.set(r.wordId, e)
    }
    return [...m.values()]
  }, [s.results, s.words])

  const wrongWords = perWord.filter((p) => p.wrong).map((p) => p.word)

  const leave = (to: string): void => {
    usePractice.getState().reset()
    navigate(to)
  }

  const nextLesson = async (): Promise<void> => {
    if (!s.topicId) return
    const words = await db.words.where('topicId').equals(s.topicId).sortBy('createdAt')
    const progress = new Map((await db.progress.where('topicId').equals(s.topicId).toArray()).map((p) => [p.wordId, p]))
    await launchSession(navigate, 'lesson', s.topicId, pickLessonWords(words, progress, lessonSize))
  }

  if (s.results.length === 0) {
    return <Navigate to={s.topicId ? `/topics/${s.topicId}` : '/'} replace />
  }

  const perfect = wrongWords.length === 0
  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="text-center">
        <div className="emoji text-6xl">{perfect ? '🏆' : '💪'}</div>
        <h1 className="mt-3 text-3xl font-bold">{perfect ? 'Tuyệt vời, không sai từ nào!' : 'Hoàn thành phiên học!'}</h1>
        <p className="mt-1 text-slate-500">
          {KIND_INFO[s.kind].title} · {formatDuration(stats.activeMs)} gõ phím
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Lượt gõ đúng" value={`${stats.wordsCorrect}/${stats.wordsTotal}`} icon="✅" />
        <StatTile label="Từ mới đã học" value={stats.newWordsLearned} icon="🌱" tone="indigo" />
        <StatTile label="Từ lên hộp" value={stats.promoted} icon="⬆️" tone="emerald" hint="Nhớ đúng khi đến hạn ôn" />
        <StatTile label="Tốc độ · Chính xác" value={`${stats.wpm} · ${stats.accuracy}%`} icon="⚡" hint="WPM · % phím đúng" />
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {wrongWords.length > 0 && (
          <Button variant="primary" size="lg" onClick={() => void launchSession(navigate, 'retry', s.topicId, wrongWords)}>
            🎯 Luyện lại {wrongWords.length} từ sai
          </Button>
        )}
        {s.kind === 'lesson' && s.topicId && (
          <Button variant={wrongWords.length ? 'secondary' : 'primary'} size="lg" onClick={() => void nextLesson()}>
            🎓 Bài học tiếp theo
          </Button>
        )}
        {s.topicId && (
          <Button size="lg" onClick={() => leave(`/topics/${s.topicId}`)}>
            📚 Về chủ đề
          </Button>
        )}
        <Button size="lg" variant="ghost" onClick={() => leave('/')}>
          🏠 Trang chủ
        </Button>
      </div>

      <Card className="mt-8 p-0">
        <div className="border-b border-slate-200 px-5 py-3 font-semibold dark:border-slate-800">Các từ trong phiên</div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {perWord.map(({ word, wrong, tested, learned, promoted }) => (
            <li key={word.id} className="flex items-center gap-4 px-5 py-3">
              <WordImage word={word} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">
                  {word.word} <span className="font-normal text-slate-500">{word.ipa}</span>
                </div>
                <div className="truncate text-sm text-slate-500">{word.meaningVi}</div>
              </div>
              <div className="flex gap-1.5">
                {learned && <Badge tone="indigo">Từ mới</Badge>}
                {promoted && <Badge tone="emerald">Lên hộp</Badge>}
                {tested && (wrong ? <Badge tone="rose">Sai</Badge> : <Badge tone="emerald">Đúng</Badge>)}
              </div>
              <SpeakButton text={word.word} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
