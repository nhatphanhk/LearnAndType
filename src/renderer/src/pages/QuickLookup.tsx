import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { autofillRows, isAbort, lookupDictionaryCached, type DictEntry } from '@/core/lookup'
import { buildClassifier, buildTargetOptions, newTarget, targetKey, FALLBACK_TOPIC_NAME, type Target } from '@/core/classify'
import { loadWordnetTopics, type WordnetTopics } from '@/core/wordnet'
import { lookupExam, type ExamIndex } from '@/core/examClassify'
import { explainWordWithGemini, geminiErrorMessage, type AiExplanation } from '@/core/gemini'
import QuickWordDetails from '@/components/QuickWordDetails'
import { loadExamIndex } from '@/data/examIndex'
import { buildWordInfo, extrasForSave, findExisting, pickLookupTerm, reasonLabel } from '@/core/quick'
import type { CsvWord } from '@/core/csv'
import { importIntoTopics } from '@/db/repo'
import { groupByTopic, useTopics, useWords } from '@/hooks/useData'
import { speak } from '@/hooks/useSpeech'
import { useSettings } from '@/store/settingsStore'
import { Button, cx, inputCls } from '@/components/ui'
import type { Word } from '@/types'

const EMPTY_ROW: CsvWord = { word: '', meaningVi: '', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }

type Status = 'idle' | 'loading' | 'done' | 'notfound' | 'offline'

/** Giá trị trong ô chọn chủ đề để tự đặt tên chủ đề mới. */
const CUSTOM_KEY = '__custom__'

/** Popup tra nhanh: mở bằng phím tắt toàn cục với chữ đang có trong clipboard. */
export default function QuickLookup(): ReactNode {
  const [term, setTerm] = useState('')
  const [row, setRow] = useState<CsvWord>(EMPTY_ROW)
  const [definitions, setDefinitions] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [targetKeySel, setTargetKeySel] = useState('')
  const [saved, setSaved] = useState<{ topicId: string; name: string; created: boolean } | null>(null)
  /** Chữ đã tra (trước khi đổi về dạng gốc), để kiểm tra kho theo cả hai dạng. */
  const [queried, setQueried] = useState('')
  /** Từ đã có trong chủ đề của tôi nhưng người dùng vẫn muốn thêm vào chủ đề khác. */
  const [addElsewhere, setAddElsewhere] = useState(false)
  const [customName, setCustomName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  /** Mục từ điển đầy đủ (nhiều nghĩa, đồng/trái nghĩa, audio). */
  const [dict, setDict] = useState<DictEntry | null>(null)
  const [ai, setAi] = useState<AiExplanation | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const aiAbortRef = useRef<AbortController | null>(null)
  const geminiKey = useSettings((s) => s.geminiApiKey)
  const inputRef = useRef<HTMLInputElement>(null)
  const voiceURI = useSettings((s) => s.voiceURI)
  const rate = useSettings((s) => s.speechRate)

  const topics = useTopics()
  const words = useWords()
  const customTopics = useMemo(() => (topics ?? []).filter((t) => !t.isBuiltIn), [topics])
  const [wordnet, setWordnet] = useState<WordnetTopics | undefined>()
  const [exam, setExam] = useState<ExamIndex | undefined>()
  useEffect(() => {
    loadWordnetTopics()
      .then(setWordnet)
      .catch(() => undefined)
    loadExamIndex()
      .then(setExam)
      .catch(() => undefined)
  }, [])

  /** Các nơi từ này đã có (mọi chủ đề, kể cả có sẵn) — so theo chữ đã tra lẫn dạng gốc. */
  const existing: Word[] = useMemo(() => findExisting(words ?? [], [queried, row.word]), [words, queried, row.word])
  const topicById = useMemo(() => new Map((topics ?? []).map((t) => [t.id, t])), [topics])
  /** Dữ liệu offline của từ trong gói TOEIC / IELTS (nếu có). */
  const examEntry = useMemo(
    () => (exam && row.word ? (lookupExam(exam, row.word) ?? (queried ? lookupExam(exam, queried) : undefined)) : undefined),
    [exam, row.word, queried]
  )
  const info = useMemo(
    () => buildWordInfo({ word: row.word, example: row.example, exampleVi: row.exampleVi, dict, pack: examEntry?.data, ai }),
    [row.word, row.example, row.exampleVi, dict, examEntry, ai]
  )
  const existingMine = useMemo(() => existing.filter((w) => topicById.get(w.topicId)?.isBuiltIn === false), [existing, topicById])
  const existingBuiltin = existing.filter((w) => topicById.get(w.topicId)?.isBuiltIn)
  const ownTopicIds = useMemo(() => new Set(existingMine.map((w) => w.topicId)), [existingMine])
  const alreadySaved = existingMine.length > 0
  const topicLabel = (id: string): string => {
    const t = topicById.get(id)
    return t ? `${t.emoji ? `${t.emoji} ` : ''}${t.name}` : id
  }

  // Bỏ chính từ này khỏi dữ liệu phân loại → gợi ý chủ đề khác thay vì chủ đề đang chứa nó
  const wordsByTopic = useMemo(() => {
    const ids = new Set(existing.map((w) => w.id))
    return groupByTopic((words ?? []).filter((w) => !ids.has(w.id)))
  }, [words, existing])
  const classifier = useMemo(
    () => buildClassifier({ topics: customTopics, wordsByTopic, fallback: newTarget(FALLBACK_TOPIC_NAME), wordnet, exam }),
    [customTopics, wordsByTopic, wordnet, exam]
  )
  const rawSuggestion = useMemo(
    () => (row.word ? classifier.suggest({ word: row.word, meaningVi: row.meaningVi, example: row.example, definitions }) : null),
    [classifier, row.word, row.meaningVi, row.example, definitions]
  )
  // Gợi ý trúng chủ đề đã chứa từ → không gợi ý nữa (để người dùng tự chọn chủ đề khác)
  const suggestion =
    rawSuggestion && !(rawSuggestion.target.kind === 'topic' && ownTopicIds.has(rawSuggestion.target.topicId)) ? rawSuggestion : null
  const options = useMemo(() => {
    const m = buildTargetOptions({
      classifier,
      topics: customTopics,
      extra: suggestion ? [suggestion.target] : [],
      withCategories: true
    })
    for (const id of ownTopicIds) m.delete(`topic:${id}`)
    return m
  }, [classifier, customTopics, suggestion, ownTopicIds])
  const suggestedKey = suggestion ? targetKey(classifier.resolve(suggestion.target)) : undefined
  const suggestedOpt = suggestedKey ? options.get(suggestedKey) : undefined
  const selectedKey =
    targetKeySel === CUSTOM_KEY || (targetKeySel && options.has(targetKeySel))
      ? targetKeySel
      : suggestedKey && options.has(suggestedKey)
        ? suggestedKey
        : (options.keys().next().value ?? CUSTOM_KEY)
  const isCustom = selectedKey === CUSTOM_KEY
  const chosenTarget: Target | null = isCustom
    ? customName.trim()
      ? classifier.resolve(newTarget(customName))
      : null
    : (options.get(selectedKey)?.target ?? null)
  const customReuses = isCustom && chosenTarget?.kind === 'topic'

  const lookup = async (raw: string): Promise<void> => {
    abortRef.current?.abort()
    const word = pickLookupTerm(raw)
    setTerm(word || raw)
    setQueried(word)
    setSaved(null)
    setError('')
    setTargetKeySel('')
    setCustomName('')
    setAddElsewhere(false)
    setDefinitions([])
    setDict(null)
    setAi(null)
    setAiError('')
    setAiLoading(false)
    aiAbortRef.current?.abort()
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
    const out: { row: CsvWord; status: Status; entry?: DictEntry; builtin?: boolean } = { row: base, status: 'notfound' }
    try {
      const summary = await autofillRows([base], {
        signal: ac.signal,
        onResult: (r) => {
          out.row = { ...base, ...r.patch }
          out.entry = r.entry
          out.builtin = r.status === 'builtin'
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
    // Bổ sung từ gói TOEIC / IELTS (offline) cho ô còn trống — có ích cả khi mất mạng
    const idx = await loadExamIndex().catch(() => undefined)
    if (ac.signal.aborted) return
    const pack = idx ? (lookupExam(idx, out.row.word) ?? lookupExam(idx, word))?.data : undefined
    if (pack) {
      const r = out.row
      out.row = {
        ...r,
        meaningVi: r.meaningVi || pack.meaningVi || '',
        ipa: r.ipa || pack.ipa || '',
        partOfSpeech: r.partOfSpeech || pack.pos || '',
        example: r.example || pack.example || '',
        exampleVi: r.example ? r.exampleVi : pack.exampleVi || r.exampleVi
      }
      if (out.row.meaningVi) out.status = 'done'
    }
    setRow(out.row)
    setStatus(out.status)
    if (out.entry) setDict(out.entry)
    else if (out.builtin) {
      // Từ có sẵn trong app không qua từ điển online → tra thêm (không chặn giao diện) để có đủ nghĩa / audio
      lookupDictionaryCached(out.row.word, { signal: ac.signal })
        .then((e) => {
          if (!ac.signal.aborted) setDict(e)
        })
        .catch(() => undefined)
    }
  }

  const explain = async (): Promise<void> => {
    if (!row.word.trim() || !geminiKey.trim()) return
    aiAbortRef.current?.abort()
    const ac = new AbortController()
    aiAbortRef.current = ac
    setAiLoading(true)
    setAiError('')
    try {
      const res = await explainWordWithGemini(
        { word: row.word, pos: row.partOfSpeech, meaningVi: row.meaningVi, definitions },
        { apiKey: geminiKey, signal: ac.signal }
      )
      if (!ac.signal.aborted) setAi(res)
    } catch (e) {
      if (!ac.signal.aborted && !isAbort(e)) setAiError(geminiErrorMessage(e))
    } finally {
      if (!ac.signal.aborted) setAiLoading(false)
    }
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
      aiAbortRef.current?.abort()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (): Promise<void> => {
    if (!chosenTarget || !row.word.trim() || !row.meaningVi.trim()) return
    setSaving(true)
    setError('')
    try {
      // Lưu kèm thông tin mở rộng; chưa có ví dụ thì lấy ví dụ đầu tiên có dịch
      const ex = row.example ? null : (info.examples.find((e) => e.vi) ?? info.examples[0])
      const full: CsvWord = {
        ...row,
        ...(ex ? { example: ex.en, exampleVi: ex.vi ?? '' } : {}),
        ...extrasForSave(info, examEntry)
      }
      const [res] = await importIntoTopics([{ target: chosenTarget, rows: [full] }])
      setSaved({ topicId: res.topicId, name: res.name, created: res.created })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const set = (patch: Partial<CsvWord>): void => setRow((r) => ({ ...r, ...patch }))

  const existingBox =
    existing.length === 0 ? null : (
      <div className="mt-3 space-y-2">
        {alreadySaved && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950/40">
            <div className="font-medium text-emerald-700 dark:text-emerald-300">✅ Đã có trong kho từ vựng của bạn</div>
            <ul className="mt-2 space-y-1.5">
              {existingMine.map((w) => (
                <li key={w.id} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{topicLabel(w.topicId)}</div>
                    <div className="truncate text-xs text-slate-600 dark:text-slate-400">
                      {w.word} — {w.meaningVi}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => void window.api?.openMainFromQuick(`/manage/${w.topicId}`)}>
                    Mở chủ đề
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {existingBuiltin.length > 0 && (
          <p className="text-xs text-slate-500">
            Có trong chủ đề có sẵn: {[...new Set(existingBuiltin.map((w) => topicLabel(w.topicId)))].join(', ')}
          </p>
        )}
      </div>
    )

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
        {status === 'loading' && (
          <>
            <p className="mt-6 text-center text-sm text-slate-500">Đang tra “{row.word}”…</p>
            {existingBox}
          </>
        )}

        {(status === 'done' || status === 'notfound' || status === 'offline') && (
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{row.word}</span>
              {row.ipa && <span className="text-slate-500">{row.ipa}</span>}
              {row.partOfSpeech && <span className="text-xs text-slate-500">({row.partOfSpeech})</span>}
              <span className="ml-auto flex items-center gap-1">
                {(['us', 'uk'] as const).map((acc) => {
                  const src = dict?.audio[acc]
                  return src ? (
                    <button
                      key={acc}
                      type="button"
                      className="cursor-pointer rounded px-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => void new Audio(src).play().catch(() => undefined)}
                      title={acc === 'us' ? 'Phát âm Anh-Mỹ' : 'Phát âm Anh-Anh'}
                    >
                      {acc.toUpperCase()}
                    </button>
                  ) : null
                })}
              </span>
              <button
                type="button"
                className="cursor-pointer text-lg"
                onClick={() => speak(row.word, { voiceURI, rate })}
                title="Nghe phát âm"
                aria-label="Nghe phát âm"
              >
                🔊
              </button>
            </div>
            {(examEntry?.cefr || !!examEntry?.exams.length) && (
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                {examEntry.cefr && (
                  <span className="rounded bg-sky-100 px-1.5 font-semibold text-sky-700 dark:bg-sky-900/50 dark:text-sky-300" title="Cấp độ CEFR">
                    {examEntry.cefr}
                  </span>
                )}
                {examEntry.exams.map((x) => (
                  <span key={x} className="rounded bg-violet-100 px-1.5 font-semibold text-violet-700 dark:bg-violet-900/50 dark:text-violet-300">
                    {x.toUpperCase()}
                  </span>
                ))}
                {examEntry.topics[0] && (
                  <span className="text-slate-500">
                    · {examEntry.topics[0].emoji} {examEntry.topics[0].name}
                  </span>
                )}
              </div>
            )}
            {existingBox}
            {status === 'notfound' &&<p className="mt-1 text-sm text-amber-600">Không tìm thấy trong từ điển. Bạn có thể tự nhập nghĩa.</p>}
            {status === 'offline' && (
              <p className="mt-1 text-sm text-amber-600">Không có mạng hoặc hết lượt dịch. Bạn có thể tự nhập nghĩa.</p>
            )}

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Nghĩa tiếng Việt</span>
              <input className={inputCls} value={row.meaningVi} onChange={(e) => set({ meaningVi: e.target.value })} />
            </label>
            <QuickWordDetails
              word={row.word}
              info={info}
              dict={dict}
              ai={ai}
              aiLoading={aiLoading}
              aiError={aiError}
              hasKey={!!geminiKey.trim()}
              onExplain={() => void explain()}
              onLookup={(w) => void lookup(w)}
              onOpenSettings={() => void window.api?.openMainFromQuick('/settings')}
            />
          </div>
        )}
      </div>

      {row.word && status !== 'loading' && (
        <div className="border-t border-slate-200 p-4 dark:border-slate-800">
          {saved ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-emerald-600">
                ✅ Đã thêm vào “{saved.name}”{saved.created && ' (chủ đề mới)'}
              </span>
              <Button size="sm" onClick={() => void window.api?.openMainFromQuick(`/manage/${saved.topicId}`)}>
                Mở chủ đề
              </Button>
            </div>
          ) : alreadySaved && !addElsewhere ? (
            <Button size="sm" className="w-full" onClick={() => setAddElsewhere(true)}>
              ＋ Thêm vào chủ đề khác
            </Button>
          ) : (
            <>
              {suggestedOpt && (
                <button
                  type="button"
                  onClick={() => setTargetKeySel(suggestedOpt.key)}
                  className={cx(
                    'mb-2 block w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    selectedKey === suggestedOpt.key
                      ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/40'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  )}
                  title="Chọn chủ đề gợi ý"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>💡 Gợi ý:</span>
                    <b>{suggestedOpt.label.replace(/ \(mới\)$/, '')}</b>
                    {suggestedOpt.isNew && (
                      <span className="rounded bg-amber-100 px-1.5 text-xs font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                        Chủ đề mới
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{reasonLabel(suggestion!.reason, suggestedOpt.isNew)}</span>
                </button>
              )}
              <div className="flex gap-2">
                <select
                  className={cx(inputCls, 'min-w-0 flex-1')}
                  value={selectedKey}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === CUSTOM_KEY && !customName.trim() && suggestedOpt?.isNew && suggestedOpt.target.kind === 'new') {
                      setCustomName(suggestedOpt.target.name)
                    }
                    setTargetKeySel(v)
                  }}
                  aria-label="Chủ đề"
                >
                  {[...options.values()].map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                      {o.key === suggestedKey ? ' ★' : ''}
                    </option>
                  ))}
                  <option value={CUSTOM_KEY}>＋ Tạo chủ đề mới…</option>
                </select>
                <Button variant="primary" disabled={saving || !row.meaningVi.trim() || !chosenTarget} onClick={() => void save()}>
                  ＋ Thêm
                </Button>
              </div>
              {isCustom && (
                <>
                  <input
                    autoFocus
                    className={cx(inputCls, 'mt-2')}
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void save()
                    }}
                    placeholder="Tên chủ đề mới, VD: Công việc văn phòng"
                    aria-label="Tên chủ đề mới"
                  />
                  {customReuses && (
                    <p className="mt-1 text-xs text-slate-500">Đã có chủ đề tên này — từ sẽ được thêm vào chủ đề đó.</p>
                  )}
                </>
              )}
              {!row.meaningVi.trim() && <p className="mt-1 text-xs text-slate-500">Nhập nghĩa để thêm từ.</p>}
              {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  )
}
