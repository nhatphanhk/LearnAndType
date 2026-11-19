import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { autofillRows, isAbort } from '@/core/lookup'
import { buildClassifier, buildTargetOptions, newTarget, targetKey, FALLBACK_TOPIC_NAME } from '@/core/classify'
import { loadWordnetTopics, type WordnetTopics } from '@/core/wordnet'
import { pickLookupTerm } from '@/core/quick'
import type { CsvWord } from '@/core/csv'
import { importIntoTopics } from '@/db/repo'
import { groupByTopic, useTopics, useWords } from '@/hooks/useData'
import { speak } from '@/hooks/useSpeech'
import { useSettings } from '@/store/settingsStore'
import { Button, cx, inputCls } from '@/components/ui'
import type { Word } from '@/types'

const EMPTY_ROW: CsvWord = { word: '', meaningVi: '', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }

type Status = 'idle' | 'loading' | 'done' | 'notfound' | 'offline'

/** Popup tra nhanh: mở bằng phím tắt toàn cục với chữ đang có trong clipboard. */
export default function QuickLookup(): ReactNode {
  const [term, setTerm] = useState('')
  const [row, setRow] = useState<CsvWord>(EMPTY_ROW)
  const [definitions, setDefinitions] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [targetKeySel, setTargetKeySel] = useState('')
  const [saved, setSaved] = useState<{ topicId: string; name: string } | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.speechRate)

  const topics = useTopics()
  const words = useWords()
  const customTopics = useMemo(() => (topics ?? []).filter((t) => !t.isBuiltIn), [topics])
  const wordsByTopic = useMemo(() => groupByTopic(words ?? []), [words])
  const [wordnet, setWordnet] = useState<WordnetTopics | undefined>()
  useEffect(() => {
    loadWordnetTopics()
      .then(setWordnet)
      .catch(() => undefined)
  }, [])

  const classifier = useMemo(
    () => buildClassifier({ topics: customTopics, wordsByTopic, fallback: newTarget(FALLBACK_TOPIC_NAME), wordnet }),
    [customTopics, wordsByTopic, wordnet]
  )
  const suggestion = useMemo(
    () => (row.word ? classifier.suggest({ word: row.word, meaningVi: row.meaningVi, example: row.example, definitions }) : null),
    [classifier, row.word, row.meaningVi, row.example, definitions]
  )
  const options = useMemo(
    () =>
      buildTargetOptions({
        classifier,
        topics: customTopics,
        extra: suggestion ? [suggestion.target] : [],
        withCategories: true
      }),
    [classifier, customTopics, suggestion]
  )
  const suggestedKey = suggestion ? targetKey(classifier.resolve(suggestion.target)) : undefined
  const selectedKey =
    targetKeySel && options.has(targetKeySel)
      ? targetKeySel
      : suggestedKey && options.has(suggestedKey)
        ? suggestedKey
        : (options.keys().next().value ?? '')

  /** Các nơi từ này đã có (mọi chủ đề, kể cả có sẵn). */
  const existing: Word[] = useMemo(() => {
    const k = row.word.trim().toLowerCase()
    return k ? (words ?? []).filter((w) => w.word.toLowerCase() === k) : []
  }, [words, row.word])
  const topicName = (id: string): string => topics?.find((t) => t.id === id)?.name ?? id

  const lookup = async (raw: string): Promise<void> => {
    abortRef.current?.abort()
    const word = pickLookupTerm(raw)
    setTerm(word || raw)
    setSaved(null)
    setError('')
    setTargetKeySel('')
    setDefinitions([])
    if (!word) {
      setRow(EMPTY_ROW)
      setStatus('idle')
      return
    }
    const base: CsvWord = { ...EMPTY_ROW, word }
    setRow(base)
    setStatus('loading')
    const ac = new AbortController()
    abortRef.current = ac
    const out: { row: CsvWord; status: Status } = { row: base, status: 'notfound' }
    try {
      const summary = await autofillRows([base], {
        signal: ac.signal,
        onResult: (r) => {
          out.row = { ...base, ...r.patch }
          if (r.definitions) setDefinitions(r.definitions)
          out.status = r.status === 'builtin' || r.status === 'online' ? 'done' : r.status === 'error' ? 'offline' : 'notfound'
        }
      })
      if (summary.aborted) return
      if (summary.networkErrors > 0 && out.status !== 'done') out.status = 'offline'
    } catch (e) {
      if (isAbort(e)) return
      out.status = 'offline'
    }
    setRow(out.row)
    setStatus(out.status)
  }

  // Lấy chữ khi mở lần đầu và mỗi lần nhấn phím tắt
  useEffect(() => {
    void window.api?.getQuickText().then((t) => void lookup(t))
    const off = window.api?.onQuickText((t) => {
      void lookup(t)
      inputRef.current?.focus()
    })
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void window.api?.hideQuick()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off?.()
      window.removeEventListener('keydown', onKey)
      abortRef.current?.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (): Promise<void> => {
    const opt = options.get(selectedKey)
    if (!opt || !row.word.trim() || !row.meaningVi.trim()) return
    setSaving(true)
    setError('')
    try {
      const [res] = await importIntoTopics([{ target: opt.target, rows: [row] }])
      setSaved({ topicId: res.topicId, name: res.name })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<CsvWord>): void => setRow((r) => ({ ...r, ...patch }))

  return (
    <div className="flex h-full flex-col bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100">
      <div
        className="flex items-center justify-between border-b border-slate-200 px-4 py-2 text-sm dark:border-slate-800"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="font-semibold">⌨️ Tra nhanh</span>
        <button
          type="button"
          onClick={() => void window.api?.hideQuick()}
          className="cursor-pointer rounded px-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label="Đóng"
          title="Đóng (Esc)"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void lookup(term)
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            autoFocus
            className={cx(inputCls, 'flex-1')}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Copy một từ tiếng Anh rồi nhấn phím tắt, hoặc gõ vào đây"
            spellCheck={false}
            aria-label="Từ cần tra"
          />
          <Button type="submit">Tra</Button>
        </form>

        {status === 'idle' && (
          <p className="mt-6 text-center text-sm text-slate-500">
            Bôi đen một từ ở bất kỳ ứng dụng nào, nhấn <b>Ctrl + C</b> rồi nhấn phím tắt tra nhanh.
          </p>
        )}
        {status === 'loading' && <p className="mt-6 text-center text-sm text-slate-500">Đang tra “{row.word}”…</p>}

        {(status === 'done' || status === 'notfound' || status === 'offline') && (
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{row.word}</span>
              {row.ipa && <span className="text-slate-500">{row.ipa}</span>}
              {row.partOfSpeech && <span className="text-xs text-slate-500">({row.partOfSpeech})</span>}
              <button
                type="button"
                className="ml-auto cursor-pointer text-lg"
                onClick={() => speak(row.word, { voiceURI, rate })}
                title="Nghe phát âm"
                aria-label="Nghe phát âm"
              >
                🔊
              </button>
            </div>
            {status === 'notfound' && <p className="mt-1 text-sm text-amber-600">Không tìm thấy trong từ điển. Bạn có thể tự nhập nghĩa.</p>}
            {status === 'offline' && (
              <p className="mt-1 text-sm text-amber-600">Không có mạng hoặc hết lượt dịch. Bạn có thể tự nhập nghĩa.</p>
            )}

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Nghĩa tiếng Việt</span>
              <input className={inputCls} value={row.meaningVi} onChange={(e) => set({ meaningVi: e.target.value })} />
            </label>
            {row.example && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <div className="italic">{row.example}</div>
                {row.exampleVi && <div className="mt-1 text-slate-500">{row.exampleVi}</div>}
              </div>
            )}
            {definitions.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
                {definitions.slice(0, 3).map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            )}
            {existing.length > 0 && (
              <p className="mt-3 text-xs text-slate-500">
                Đã có trong: {[...new Set(existing.map((w) => topicName(w.topicId)))].join(', ')}
              </p>
            )}
          </div>
        )}
      </div>

      {row.word && status !== 'loading' && (
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          {saved ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-emerald-600">✅ Đã thêm vào “{saved.name}”</span>
              <Button size="sm" onClick={() => void window.api?.openMainFromQuick(`/manage/${saved.topicId}`)}>
                Mở chủ đề
              </Button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <select
                  className={cx(inputCls, 'min-w-0 flex-1')}
                  value={selectedKey}
                  onChange={(e) => setTargetKeySel(e.target.value)}
                  aria-label="Chủ đề"
                >
                  {[...options.values()].map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                      {o.key === suggestedKey ? ' ★' : ''}
                    </option>
                  ))}
                </select>
                <Button variant="primary" disabled={saving || !row.meaningVi.trim()} onClick={() => void save()}>
                  ＋ Thêm
                </Button>
              </div>
              {!row.meaningVi.trim() && <p className="mt-1 text-xs text-slate-500">Nhập nghĩa để thêm từ.</p>}
              {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
