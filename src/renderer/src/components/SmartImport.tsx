import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CsvWord } from '@/core/csv'
import { parseSmart } from '@/core/smartParse'
import { extractVocab } from '@/core/extract'
import { autofillRows, builtinTopicOf, needsLookup, type FillStatus } from '@/core/lookup'
import {
  FALLBACK_TOPIC_NAME,
  buildClassifier,
  buildTargetOptions,
  newTarget,
  targetKey,
  type Suggestion,
  type Target,
  type TargetOption
} from '@/core/classify'
import type { TopicImportResult } from '@/db/repo'
import { groupByTopic, useTopics, useWords } from '@/hooks/useData'
import { posLabel } from '@/labels'
import { pickFile } from '@/download'
import type { Topic, Word } from '@/types'
import { GeminiError, classifyWithGemini, geminiErrorMessage } from '@/core/gemini'
import { loadWordnetTopics, type WordnetTopics } from '@/core/wordnet'
import { useSettings } from '@/store/settingsStore'
import { toast } from './Toast'
import { Badge, Button, Field, cx, inputCls } from './ui'

type Tab = 'list' | 'passage'
type RowStatus = 'idle' | 'loading' | FillStatus

interface ReviewRow {
  key: number
  checked: boolean
  data: CsvWord
  status: RowStatus
  /** Định nghĩa tiếng Anh (để đoán chủ đề). */
  definitions?: string[]
  /** Chủ đề người dùng tự chọn (targetKey) — không bị đoán lại. */
  manualTarget?: string
  /** Chủ đề AI (Gemini) chọn cho từ không đoán được (targetKey). */
  aiTarget?: string
}

/** Một nhóm từ lưu vào cùng một chủ đề. */
export interface ImportGroup {
  target: Target
  rows: CsvWord[]
}

const NO_TOPICS: readonly Topic[] = []
const NO_WORDS: readonly Word[] = []
const MAX_FILE_BYTES = 2 * 1024 * 1024
const PREVIEW_ROWS = 5
const PREVIEW_CHIPS = 40
const DEFAULT_FALLBACK = newTarget(FALLBACK_TOPIC_NAME)

const LIST_PLACEHOLDER = `laptop - máy tính xách tay
meeting (n) /ˈmiː.t̬ɪŋ/: cuộc họp
hạn chót | deadline
negotiate
crucial
(chỉ có từ tiếng Anh cũng được — app sẽ tự tra nghĩa, phiên âm, ví dụ)`

const PASSAGE_PLACEHOLDER = `Dán một đoạn văn tiếng Anh: bài báo, email, phụ đề phim…
App sẽ chọn ra các từ đáng học (bỏ qua từ quá cơ bản, tên riêng, từ đã có) và lấy câu trong đoạn văn làm câu ví dụ.`

const blankWord = (word: string, example = ''): CsvWord => ({
  word,
  meaningVi: '',
  ipa: '',
  partOfSpeech: '',
  emoji: '',
  example,
  exampleVi: ''
})

/** Điền kết quả tra vào ô còn trống; chỉ đổi từ (về dạng gốc) nếu người dùng chưa sửa từ đó. */
function applyPatch(d: CsvWord, patch: Partial<CsvWord>, originalWord: string): CsvWord {
  const out = { ...d }
  for (const [k, val] of Object.entries(patch) as [keyof CsvWord, string | undefined][]) {
    if (!val) continue
    if (k === 'word') {
      if (d.word === originalWord) out.word = val
    } else if (!d[k]?.trim()) {
      out[k] = val
    }
  }
  return out
}

/** Mở hộp thoại chọn file từ vựng (.csv/.tsv/.txt) và đọc nội dung; null nếu hủy hoặc file không dùng được. */
export async function readImportFile(): Promise<string | null> {
  const f = await pickFile('.csv,.tsv,.txt,text/csv,text/plain,text/tab-separated-values')
  if (!f) return null
  if (f.size > MAX_FILE_BYTES) {
    toast.error('File quá lớn (tối đa 2 MB).')
    return null
  }
  const text = await f.text()
  if (!text.trim()) {
    toast.error(`File "${f.name}" trống.`)
    return null
  }
  return text
}

/** Thông báo sau khi lưu (một hoặc nhiều chủ đề). */
export function importMessage(results: readonly TopicImportResult[]): string {
  const added = results.reduce((s, r) => s + r.added, 0)
  const updated = results.reduce((s, r) => s + r.updated, 0)
  const created = results.filter((r) => r.created).length
  if (results.length === 1) {
    const r = results[0]
    return `Đã thêm ${r.added} từ${r.updated ? `, cập nhật ${r.updated} từ` : ''} vào "${r.name}"${r.created ? ' (chủ đề mới)' : ''}.`
  }
  const names = results.map((r) => `"${r.name}"${r.created ? ' (mới)' : ''}`).join(', ')
  return `Đã lưu ${added + updated} từ vào ${results.length} chủ đề${created ? ` (${created} chủ đề mới)` : ''}: ${names}. Xem ở mục "Của tôi" trên trang Chủ đề.`
}

function StatusBadge({ status }: { status: RowStatus }): ReactNode {
  switch (status) {
    case 'loading':
      return <Badge tone="indigo">Đang tra…</Badge>
    case 'builtin':
      return <Badge tone="emerald">Có sẵn</Badge>
    case 'online':
      return <Badge tone="emerald">Đã tra</Badge>
    case 'notfound':
      return <Badge tone="amber">Không tìm thấy</Badge>
    case 'error':
      return <Badge tone="rose">Lỗi mạng</Badge>
    default:
      return null
  }
}

/**
 * Nhập thông minh: dán danh sách lộn xộn / chỉ từ tiếng Anh / cả đoạn văn / file CSV → xem lại → lưu.
 * Từ còn thiếu nghĩa hoặc phiên âm được tự tra (từ có sẵn → dictionaryapi.dev → MyMemory).
 * Bật "Phân loại vào nhiều chủ đề" thì mỗi từ được gợi ý một chủ đề (chủ đề của bạn, hoặc chủ đề mẫu tạo khi lưu).
 *
 * `fallback`: chủ đề lưu từ khi không phân loại / không đoán được (bỏ qua nếu `withTopicName`).
 * `classify`: bật sẵn phân loại (tự bật khi file CSV có cột chủ đề).
 */
export function SmartImport({
  withTopicName = false,
  fallback = DEFAULT_FALLBACK,
  classify = false,
  initialText = '',
  submitLabel,
  onSubmit,
  onCancel
}: {
  withTopicName?: boolean
  fallback?: Target
  classify?: boolean
  /** Nội dung có sẵn (VD: file vừa chọn bằng nút "Nhập từ file"). */
  initialText?: string
  submitLabel: string
  onSubmit: (groups: ImportGroup[], topicName: string) => Promise<void>
  onCancel: () => void
}): ReactNode {
  const [step, setStep] = useState<'input' | 'review'>('input')
  const [tab, setTab] = useState<Tab>('list')
  const [name, setName] = useState('')
  const [text, setText] = useState(initialText)
  const [passage, setPassage] = useState('')
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [classifyOn, setClassifyOn] = useState(classify)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  // Đóng modal thì dừng tra
  useEffect(
    () => () => {
      abortRef.current?.abort()
      aiAbortRef.current?.abort()
    },
    []
  )
  const apiKey = useSettings((s) => s.geminiApiKey)
  const aiAuto = useSettings((s) => s.aiClassify)
  /** Số từ đang gửi cho AI (0 = không chạy). */
  const [aiBusy, setAiBusy] = useState(0)
  const aiAbortRef = useRef<AbortController | null>(null)
  const aiTriedRef = useRef(new Set<string>())

  const topics = useTopics() ?? NO_TOPICS
  const allWords = useWords() ?? NO_WORDS
  const customTopics = useMemo(() => topics.filter((t) => !t.isBuiltIn), [topics])
  const wordsByTopic = useMemo(() => groupByTopic(allWords), [allWords])

  const topicName = name.trim()
  // Khóa theo nội dung để không tạo lại khi component cha truyền object mới mỗi lần render
  const fallbackPropKey = targetKey(fallback)
  const fallbackTarget = useMemo(
    () => (withTopicName ? newTarget(topicName || 'Chủ đề mới') : fallback),
    [withTopicName, topicName, fallbackPropKey] // eslint-disable-line react-hooks/exhaustive-deps
  )
  // Bảng chủ đề WordNet (offline, ~1 MB) — tải khi mở hộp nhập; chưa tải xong thì phân loại như cũ
  const [wordnet, setWordnet] = useState<WordnetTopics | undefined>()
  const [wordnetDone, setWordnetDone] = useState(false)
  useEffect(() => {
    let alive = true
    loadWordnetTopics()
      .then((m) => alive && setWordnet(m))
      .catch(() => undefined)
      .finally(() => alive && setWordnetDone(true))
    return () => {
      alive = false
    }
  }, [])
  const classifier = useMemo(
    () => buildClassifier({ topics: customTopics, wordsByTopic, fallback: fallbackTarget, wordnet }),
    [customTopics, wordsByTopic, fallbackTarget, wordnet]
  )
  const fallbackResolved = useMemo(() => classifier.resolve(fallbackTarget), [classifier, fallbackTarget])
  const fallbackKey = targetKey(fallbackResolved)

  // Từ đã có: ở chủ đề dự phòng, hoặc ở mọi chủ đề của bạn khi phân loại
  const existing = useMemo(() => {
    const set = new Set<string>()
    const add = (ws: readonly Word[] | undefined): void => ws?.forEach((w) => set.add(w.word.toLowerCase()))
    if (classify) customTopics.forEach((t) => add(wordsByTopic.get(t.id)))
    else if (fallbackResolved.kind === 'topic') add(wordsByTopic.get(fallbackResolved.topicId))
    return set
  }, [classify, customTopics, wordsByTopic, fallbackResolved])

  const parsed = useMemo(() => parseSmart(text), [text])
  const candidates = useMemo(() => extractVocab(passage, { exclude: existing }), [passage, existing])
  const inputCount = tab === 'list' ? parsed.rows.length : candidates.length

  /* ------------------------------ Gợi ý chủ đề ------------------------------ */

  const suggestCache = useMemo(() => new Map<string, Suggestion>(), [classifier])
  const suggestionOf = (r: ReviewRow): Suggestion => {
    const d = r.data
    const k = [d.word, d.meaningVi, d.topic ?? '', d.example.length, r.definitions?.length ?? 0].join('\u0001')
    let s = suggestCache.get(k)
    if (!s) {
      s = classifier.suggest({ word: d.word, meaningVi: d.meaningVi, example: d.example, definitions: r.definitions, topic: d.topic })
      suggestCache.set(k, s)
    }
    return s
  }

  // Danh sách chủ đề để chọn: chủ đề của bạn + chủ đề mới (mẫu, tên trong CSV, dự phòng)
  const options = buildTargetOptions({
    classifier,
    topics: customTopics,
    extra: [fallbackTarget, ...(classifyOn ? rows.map((r) => suggestionOf(r).target) : [])],
    withCategories: classifyOn
  })
  if (!options.has(fallbackKey)) {
    // Danh sách chủ đề chưa tải xong
    options.set(fallbackKey, { key: fallbackKey, target: fallbackResolved, label: 'Chủ đề hiện tại', isNew: false })
  }

  const targetOf = (r: ReviewRow): string => {
    if (!classifyOn) return fallbackKey
    if (r.manualTarget && options.has(r.manualTarget)) return r.manualTarget
    if (r.aiTarget && options.has(r.aiTarget)) return r.aiTarget
    return targetKey(suggestionOf(r).target)
  }

  /* ------------------------- AI phân loại (Gemini) ------------------------- */

  const aiSig = (r: ReviewRow): string => `${r.data.word.trim().toLowerCase()}\u0001${r.data.meaningVi.trim()}`
  // Từ bộ phân loại offline không đoán được (sẽ rơi vào chủ đề dự phòng)
  const aiPending = classifyOn
    ? rows.filter(
        (r) =>
          r.checked &&
          !r.manualTarget &&
          !(r.aiTarget && options.has(r.aiTarget)) &&
          r.status !== 'loading' &&
          r.data.word.trim() &&
          suggestionOf(r).reason === 'fallback'
      )
    : []
  const aiPendingKey = aiPending.map(aiSig).join('\u0002')

  const runAi = async (list: readonly ReviewRow[]): Promise<void> => {
    if (list.length === 0 || !apiKey) return
    list.forEach((r) => aiTriedRef.current.add(aiSig(r)))
    // Chủ đề AI được chọn: mọi chủ đề trừ chủ đề dự phòng
    const topicsForAi = [...options.values()]
      .filter((o) => o.key !== fallbackKey)
      .map((o) => ({ key: o.key, label: o.label.replace(/ \(mới\)$/, '') }))
    aiAbortRef.current?.abort()
    const ctrl = new AbortController()
    aiAbortRef.current = ctrl
    setAiBusy(list.length)
    try {
      const picks = await classifyWithGemini(
        list.map((r) => ({ word: r.data.word, meaningVi: r.data.meaningVi, definitions: r.definitions })),
        topicsForAi,
        { apiKey, signal: ctrl.signal }
      )
      const byKey = new Map(list.map((r, i) => [r.key, picks[i]]))
      setRows((rs) => rs.map((r) => (byKey.get(r.key) ? { ...r, aiTarget: byKey.get(r.key)! } : r)))
      const n = picks.filter(Boolean).length
      if (n < list.length) toast.info(`AI đã phân loại ${n}/${list.length} từ; số còn lại giữ ở chủ đề dự phòng.`)
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const busy = e instanceof GeminiError && (e.kind === 'unavailable' || e.kind === 'quota')
        toast.error(
          busy
            ? `${geminiErrorMessage(e)} Đã dùng phân loại offline — bấm "🤖 Phân loại bằng AI" để thử lại.`
            : `Không phân loại bằng AI được: ${geminiErrorMessage(e)}`
        )
      }
    } finally {
      if (aiAbortRef.current === ctrl) {
        aiAbortRef.current = null
        setAiBusy(0)
      }
    }
  }

  // Tự gọi AI sau khi tra từ xong (mỗi từ một lần; bấm nút để thử lại)
  useEffect(() => {
    // Chờ WordNet tải xong, để chỉ gửi cho AI những từ offline thật sự không đoán được
    if (step !== 'review' || !apiKey || !aiAuto || progress || aiBusy || !wordnetDone) return
    const todo = aiPending.filter((r) => !aiTriedRef.current.has(aiSig(r)))
    if (todo.length) void runAi(todo)
  }, [step, apiKey, aiAuto, progress, aiBusy, aiPendingKey, wordnetDone]) // eslint-disable-line react-hooks/exhaustive-deps

  /* --------------------------------- Tra từ --------------------------------- */

  const wantsLookup = (r: ReviewRow, forClassify: boolean): boolean =>
    r.checked &&
    r.status !== 'loading' &&
    (needsLookup(r.data) ||
      (forClassify && r.status === 'idle' && !r.definitions && !r.data.topic && !builtinTopicOf(r.data.word)))

  const openFile = async (): Promise<void> => {
    const t = await readImportFile()
    if (t === null) return
    setTab('list')
    setText(t)
  }

  const fill = async (list: readonly ReviewRow[], forClassify: boolean): Promise<void> => {
    const todo = list.filter((r) => wantsLookup(r, forClassify))
    if (todo.length === 0) return
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const keys = new Set(todo.map((r) => r.key))
    setRows((rs) => rs.map((r) => (keys.has(r.key) ? { ...r, status: 'loading' } : r)))
    setProgress({ done: 0, total: todo.length })
    const summary = await autofillRows(
      todo.map((r) => r.data),
      {
        signal: ctrl.signal,
        onResult: ({ index, status, patch, definitions }) => {
          const { key, data } = todo[index]
          setRows((rs) =>
            rs.map((r) =>
              r.key === key
                ? { ...r, status, data: applyPatch(r.data, patch, data.word), definitions: definitions ?? r.definitions }
                : r
            )
          )
          setProgress((p) => p && { ...p, done: p.done + 1 })
        }
      }
    )
    if (abortRef.current !== ctrl) return // đã có lượt tra mới thay thế
    abortRef.current = null
    setProgress(null)
    if (summary.aborted) {
      setRows((rs) => rs.map((r) => (r.status === 'loading' ? { ...r, status: 'idle' } : r)))
      return
    }
    if (summary.quota) {
      toast.error('Đã hết lượt dịch miễn phí hôm nay (MyMemory) — hãy tự nhập nghĩa cho các từ còn trống.')
    }
    if (summary.networkErrors > 0) {
      toast.error(
        `Không tra được ${summary.networkErrors} từ vì lỗi mạng — kiểm tra kết nối rồi bấm "Tra từ còn thiếu", hoặc tự nhập nghĩa.`
      )
    }
  }

  const goReview = (): void => {
    if (withTopicName && !topicName) return toast.error('Hãy nhập tên chủ đề.')
    const data = tab === 'list' ? parsed.rows : candidates.map((c) => blankWord(c.word, c.sentence))
    if (data.length === 0) {
      return toast.error(
        tab === 'list'
          ? 'Chưa đọc được từ nào. Mỗi dòng một từ, ví dụ "laptop - máy tính" hoặc chỉ "laptop".'
          : 'Không tìm thấy từ nào đáng học trong đoạn văn.'
      )
    }
    const next = data.map((d, key): ReviewRow => ({ key, checked: true, data: d, status: 'idle' }))
    // File CSV có cột chủ đề → bật phân loại
    const on = classify || data.some((d) => d.topic)
    setClassifyOn(on)
    setRows(next)
    setStep('review')
    void fill(next, on)
  }

  const backToInput = (): void => {
    abortRef.current?.abort()
    setStep('input')
  }

  const toggleClassify = (on: boolean): void => {
    setClassifyOn(on)
    if (on && !progress) void fill(rows, true)
  }

  const edit = (key: number, field: 'word' | 'meaningVi', value: string): void =>
    setRows((rs) =>
      rs.map((r) =>
        r.key === key
          ? { ...r, data: { ...r.data, [field]: value }, status: field === 'word' ? 'idle' : r.status, aiTarget: undefined }
          : r
      )
    )

  const setTarget = (key: number, target: string): void =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, manualTarget: target } : r)))

  /* --------------------------------- Lưu --------------------------------- */

  const selected = rows.filter((r) => r.checked)
  const allChecked = rows.length > 0 && selected.length === rows.length
  const missing = selected.filter((r) => !r.data.word.trim() || !r.data.meaningVi.trim()).length
  const lookupCount = selected.filter((r) => needsLookup(r.data)).length

  const isDupe = (r: ReviewRow): boolean => {
    const opt = options.get(targetOf(r))
    const t = opt?.target ?? fallbackResolved
    if (t.kind !== 'topic') return false
    const w = r.data.word.trim().toLowerCase()
    return (wordsByTopic.get(t.topicId) ?? []).some((x) => x.word.toLowerCase() === w)
  }
  const dupes = selected.filter(isDupe).length

  // Gom theo chủ đề đích; chủ đề dự phòng đứng đầu
  const groups = new Map<string, { option: TargetOption; rows: ReviewRow[] }>()
  for (const r of selected) {
    const key = targetOf(r)
    const option = options.get(key) ?? options.get(fallbackKey)!
    const g = groups.get(option.key)
    if (g) g.rows.push(r)
    else groups.set(option.key, { option, rows: [r] })
  }
  const groupList = [...groups.values()].sort((a, b) => Number(b.option.key === fallbackKey) - Number(a.option.key === fallbackKey))

  const submit = async (): Promise<void> => {
    if (withTopicName && !topicName) return toast.error('Hãy nhập tên chủ đề.')
    if (selected.length === 0) return toast.error('Chưa chọn từ nào.')
    if (missing > 0) return toast.error(`Còn ${missing} từ chưa có nghĩa — nhập nghĩa hoặc bỏ chọn.`)
    const out: ImportGroup[] = groupList.map(({ option, rows: rs }) => {
      // Bỏ từ trùng trong cùng một chủ đề (VD: hai dạng cùng về một từ gốc), giữ dòng đầu
      const seen = new Set<string>()
      const list: CsvWord[] = []
      for (const r of rs) {
        const k = r.data.word.trim().toLowerCase()
        if (seen.has(k)) continue
        seen.add(k)
        list.push(r.data)
      }
      return { target: option.target, rows: list }
    })
    setBusy(true)
    try {
      await onSubmit(out, topicName)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  /* ------------------------------- Bước 1 ------------------------------- */

  if (step === 'input') {
    return (
      <div className="space-y-4" data-role="smart-import">
        {withTopicName && (
          <Field label="Tên chủ đề *">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Từ vựng IELTS tuần 1"
              autoFocus
            />
          </Field>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" className="inline-flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {(
              [
                ['list', '📋 Danh sách từ'],
                ['passage', '📰 Trích từ đoạn văn']
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cx(
                  'cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === id
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'list' && (
            <Button size="sm" onClick={() => void openFile()}>
              📂 Mở file (.csv, .tsv, .txt)
            </Button>
          )}
        </div>

        {tab === 'list' ? (
          <Field
            label="Danh sách từ"
            hint='Mỗi dòng một từ. Nhận "từ - nghĩa", ":", "=", "|", cột copy từ Excel (thứ tự cột nào cũng được), phiên âm /…/, loại từ (n), (v)… Chỉ có từ tiếng Anh cũng được. File CSV có thể thêm cột "topic" (chủ đề).'
          >
            <textarea
              className={cx(inputCls, 'h-48 resize-y font-mono')}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={LIST_PLACEHOLDER}
              spellCheck={false}
              autoFocus={!withTopicName}
            />
          </Field>
        ) : (
          <Field label="Đoạn văn tiếng Anh" hint="Câu chứa từ trong đoạn văn sẽ thành câu ví dụ — luyện được ngay chế độ Điền vào câu.">
            <textarea
              className={cx(inputCls, 'h-48 resize-y')}
              value={passage}
              onChange={(e) => setPassage(e.target.value)}
              placeholder={PASSAGE_PLACEHOLDER}
              autoFocus={!withTopicName}
            />
          </Field>
        )}

        {tab === 'list' && text.trim() && (
          <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50" data-role="paste-preview">
            <div className="font-medium">
              Đọc được <b className="text-indigo-600 dark:text-indigo-400">{parsed.rows.length}</b> từ
              {parsed.needsMeaning > 0 && <span className="text-slate-500"> · {parsed.needsMeaning} từ sẽ tự tra nghĩa</span>}
              {parsed.rows.some((r) => r.topic) && <span className="text-slate-500"> · có cột chủ đề</span>}
              {parsed.errors.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400"> · {parsed.errors.length} dòng bị bỏ qua</span>
              )}
            </div>
            {parsed.errors.length > 0 && <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">{parsed.errors[0]}</div>}
            {parsed.rows.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-slate-600 dark:text-slate-300">
                {parsed.rows.slice(0, PREVIEW_ROWS).map((r) => (
                  <li key={r.word} className="truncate">
                    <b>{r.word}</b>
                    {(r.ipa || r.partOfSpeech) && (
                      <span className="text-xs text-slate-500">
                        {' '}
                        {r.ipa} {r.partOfSpeech && <i>· {posLabel(r.partOfSpeech)}</i>}
                      </span>
                    )}{' '}
                    → {r.meaningVi || <i className="text-slate-400">sẽ tự tra</i>}
                    {r.topic && <span className="text-xs text-slate-500"> · 🗂️ {r.topic}</span>}
                  </li>
                ))}
                {parsed.rows.length > PREVIEW_ROWS && <li className="text-slate-400">… và {parsed.rows.length - PREVIEW_ROWS} từ khác</li>}
              </ul>
            )}
          </div>
        )}

        {tab === 'passage' && passage.trim() && (
          <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/50" data-role="passage-preview">
            <div className="font-medium">
              Tìm thấy <b className="text-indigo-600 dark:text-indigo-400">{candidates.length}</b> từ đáng học
              <span className="font-normal text-slate-500"> (đã bỏ từ cơ bản, tên riêng và từ đã có)</span>
            </div>
            {candidates.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {candidates.slice(0, PREVIEW_CHIPS).map((c) => (
                  <span key={c.word} className="rounded-full bg-white px-2 py-0.5 text-xs ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
                    {c.word}
                    {c.count > 1 && <span className="text-slate-400"> ×{c.count}</span>}
                  </span>
                ))}
                {candidates.length > PREVIEW_CHIPS && (
                  <span className="text-xs text-slate-400">… và {candidates.length - PREVIEW_CHIPS} từ khác</span>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onCancel}>Hủy</Button>
          <Button variant="primary" disabled={inputCount === 0} onClick={goReview}>
            Tiếp tục →
          </Button>
        </div>
      </div>
    )
  }

  /* ------------------------------- Bước 2 ------------------------------- */

  const optionList = [...options.values()]
  const mine = optionList.filter((o) => !o.isNew)
  const fresh = optionList.filter((o) => o.isNew)

  return (
    <div className="space-y-3" data-role="smart-import-review">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          Chọn <b>{selected.length}</b>/{rows.length} từ
          {missing > 0 && <span className="text-rose-600 dark:text-rose-400"> · {missing} từ chưa có nghĩa</span>}
          {dupes > 0 && <span className="text-amber-700 dark:text-amber-400"> · {dupes} từ đã có (sẽ cập nhật)</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800">
            <input type="checkbox" checked={classifyOn} onChange={(e) => toggleClassify(e.target.checked)} />
            🗂️ Phân loại vào nhiều chủ đề
          </label>
          {progress ? (
            <>
              <span className="text-sm text-slate-500" aria-live="polite">
                Đang tra {progress.done}/{progress.total}…
              </span>
              <Button size="sm" onClick={() => abortRef.current?.abort()}>
                Dừng
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={lookupCount === 0} onClick={() => void fill(rows, classifyOn)}>
              ✨ Tra từ còn thiếu{lookupCount > 0 && ` (${lookupCount})`}
            </Button>
          )}
          {classifyOn && apiKey && (aiBusy > 0 || aiPending.length > 0) && (
            aiBusy > 0 ? (
              <span className="text-sm text-indigo-600 dark:text-indigo-400" aria-live="polite" data-role="ai-status">
                🤖 AI đang phân loại {aiBusy} từ…
              </span>
            ) : (
              <Button size="sm" disabled={!!progress} onClick={() => void runAi(aiPending)}>
                🤖 Phân loại bằng AI ({aiPending.length})
              </Button>
            )
          )}
          <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, checked: !allChecked })))}>
            {allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </Button>
        </div>
      </div>

      {progress && (
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full bg-indigo-500 transition-all"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
        </div>
      )}

      {classifyOn && !apiKey && aiPending.length > 0 && (
        <div className="text-sm text-slate-500" data-role="ai-hint">
          {aiPending.length} từ chưa đoán được chủ đề (sẽ vào chủ đề dự phòng). Thêm <b>Gemini API key</b> trong{' '}
          <Link to="/settings" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Cài đặt
          </Link>{' '}
          để AI tự phân loại.
        </div>
      )}

      {classifyOn && groupList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm" data-role="topic-summary">
          <span className="text-slate-500">Sẽ lưu vào {groupList.length} chủ đề:</span>
          {groupList.map(({ option, rows: rs }) => (
            <span
              key={option.key}
              className={cx(
                'rounded-full px-2 py-0.5 text-xs ring-1',
                option.isNew
                  ? 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900'
                  : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700'
              )}
            >
              {option.label.replace(/ \(mới\)$/, '')} · {rs.length}
              {option.isNew && ' · mới'}
            </span>
          ))}
        </div>
      )}

      <div className="max-h-[50vh] overflow-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => setRows((rs) => rs.map((r) => ({ ...r, checked: !allChecked })))}
                  aria-label="Chọn tất cả"
                />
              </th>
              <th className="py-2 pr-2">Từ</th>
              <th className="py-2 pr-2">Nghĩa tiếng Việt</th>
              <th className="py-2 pr-2">Phiên âm · loại từ</th>
              <th className="py-2 pr-2">Câu ví dụ</th>
              {classifyOn && <th className="py-2 pr-2">Chủ đề</th>}
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r) => {
              const needMeaning = r.checked && !r.data.meaningVi.trim() && r.status !== 'loading'
              return (
                <tr key={r.key} className={cx(!r.checked && 'opacity-50')}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => setRows((rs) => rs.map((x) => (x.key === r.key ? { ...x, checked: !x.checked } : x)))}
                      aria-label={`Chọn "${r.data.word}"`}
                    />
                  </td>
                  <td className="w-36 py-1.5 pr-2">
                    <input
                      className={cx(inputCls, 'py-1 font-medium')}
                      value={r.data.word}
                      onChange={(e) => edit(r.key, 'word', e.target.value)}
                      aria-label="Từ tiếng Anh"
                    />
                  </td>
                  <td className="min-w-44 py-1.5 pr-2">
                    <input
                      className={cx(inputCls, 'py-1', needMeaning && 'border-rose-400! dark:border-rose-700!')}
                      value={r.data.meaningVi}
                      onChange={(e) => edit(r.key, 'meaningVi', e.target.value)}
                      placeholder={r.status === 'loading' ? 'Đang tra…' : 'Nhập nghĩa'}
                      aria-label={`Nghĩa của "${r.data.word}"`}
                    />
                  </td>
                  <td className="py-1.5 pr-2 text-xs whitespace-nowrap text-slate-500">
                    {r.data.ipa}
                    {r.data.partOfSpeech && <i> · {posLabel(r.data.partOfSpeech)}</i>}
                  </td>
                  <td className="py-1.5 pr-2 text-xs text-slate-500">
                    <div className={cx('truncate', classifyOn ? 'max-w-40' : 'max-w-64')} title={r.data.example}>
                      {r.data.example}
                    </div>
                  </td>
                  {classifyOn && (
                    <td className="w-48 py-1.5 pr-2">
                      <select
                        className={cx(inputCls, 'py-1 text-xs', !r.manualTarget && options.get(targetOf(r))?.isNew && 'text-indigo-700 dark:text-indigo-300')}
                        value={targetOf(r)}
                        onChange={(e) => setTarget(r.key, e.target.value)}
                        aria-label={`Chủ đề của "${r.data.word}"`}
                      >
                        {mine.length > 0 && (
                          <optgroup label="Chủ đề của tôi">
                            {mine.map((o) => (
                              <option key={o.key} value={o.key}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label="Chủ đề mới (tạo khi lưu)">
                          {fresh.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </td>
                  )}
                  <td className="py-1.5 pr-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={r.status} />
                      {classifyOn && !r.manualTarget && r.aiTarget && options.has(r.aiTarget) && (
                        <Badge tone="indigo">🤖 AI</Badge>
                      )}
                      {isDupe(r) && <Badge>Đã có</Badge>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        Tra theo thứ tự: từ có sẵn trong app (không cần mạng) → dictionaryapi.dev (phiên âm, loại từ, ví dụ, định nghĩa để đoán chủ
        đề) → MyMemory (nghĩa tiếng Việt, miễn phí, giới hạn mỗi ngày). Nghĩa dịch máy và chủ đề gợi ý có thể chưa sát — hãy xem lại
        trước khi lưu. Chỉ điền ô còn trống.
      </div>

      <div className="flex flex-wrap justify-between gap-2 pt-2">
        <Button variant="ghost" onClick={backToInput}>
          ← Quay lại
        </Button>
        <div className="flex gap-2">
          <Button onClick={onCancel}>Hủy</Button>
          <Button variant="primary" disabled={busy || !!progress || aiBusy > 0 || selected.length === 0} onClick={() => void submit()}>
            {submitLabel} ({selected.length})
          </Button>
        </div>
      </div>
    </div>
  )
}
