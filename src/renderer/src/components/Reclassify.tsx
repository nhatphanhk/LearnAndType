import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  FALLBACK_TOPIC_NAME,
  buildClassifier,
  buildTargetOptions,
  normalizeName,
  targetForTopicName,
  targetKey,
  type Classifier,
  type Target,
  type TargetOption
} from '@/core/classify'
import { parseClassificationCsv } from '@/core/csv'
import { examTopics } from '@/core/examClassify'
import { toCefr } from '@/core/packs'
import { loadBundledPacks } from '@/data/packs'
import { pickFile } from '@/download'
import { GeminiError, classifyWithGemini, geminiErrorMessage } from '@/core/gemini'
import { loadWordnetTopics, type WordnetTopics } from '@/core/wordnet'
import { loadExamIndex } from '@/data/examIndex'
import type { ExamIndex } from '@/core/examClassify'
import { moveWords, saveWordLabels, type MoveWordsResult } from '@/db/repo'
import { groupByTopic, useTopics, useWords } from '@/hooks/useData'
import { useSettings } from '@/store/settingsStore'
import type { Cefr, Topic, Word } from '@/types'
import { toast } from './Toast'
import { Badge, Button, cx, inputCls } from './ui'

/** Giá trị ô chọn "giữ ở chủ đề hiện tại". */
export const KEEP = '__keep__'

const NO_TOPICS: readonly Topic[] = []
const NO_WORDS: readonly Word[] = []

/** Chủ đề dự phòng (nơi gom từ không đoán được chủ đề) — được gợi ý phân loại lại nổi bật hơn. */
export function isFallbackTopic(topic: Pick<Topic, 'name'>): boolean {
  return normalizeName(topic.name) === normalizeName(FALLBACK_TOPIC_NAME)
}

export interface Reclassifier {
  /** WordNet đã tải xong (hoặc tải lỗi) — gợi ý đã ổn định. */
  ready: boolean
  options: Map<string, TargetOption>
  classifier: Classifier
  /** Khóa chủ đề gợi ý cho từ (KEEP nếu không đoán được hoặc trùng chủ đề hiện tại). */
  suggest: (w: Word) => string
}

const NO_TARGETS: readonly Target[] = []

/**
 * Bộ phân loại cho các từ đã lưu trong `topic` (không gợi ý lại chính chủ đề đó).
 * `extraTargets`: chủ đề đích bổ sung (VD đọc từ file phân loại) để có trong danh sách chọn.
 */
export function useReclassifier(topic: Topic, words: readonly Word[], extraTargets: readonly Target[] = NO_TARGETS): Reclassifier {
  const topics = useTopics() ?? NO_TOPICS
  const allWords = useWords() ?? NO_WORDS
  const [wordnet, setWordnet] = useState<WordnetTopics | undefined>()
  const [ready, setReady] = useState(false)
  const [exam, setExam] = useState<ExamIndex | undefined>()
  useEffect(() => {
    let alive = true
    void Promise.allSettled([
      loadWordnetTopics().then((m) => alive && setWordnet(m)),
      loadExamIndex().then((m) => alive && setExam(m))
    ]).finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  const others = useMemo(() => topics.filter((t) => !t.isBuiltIn && t.id !== topic.id), [topics, topic.id])
  const wordsByTopic = useMemo(() => groupByTopic(allWords), [allWords])
  const classifier = useMemo(
    () => buildClassifier({ topics: others, wordsByTopic, fallback: { kind: 'topic', topicId: topic.id }, wordnet, exam }),
    [others, wordsByTopic, topic.id, wordnet, exam]
  )
  const sourceName = normalizeName(topic.name)

  return useMemo(() => {
    const raw = new Map<string, string>()
    const extra = words.map((w) => {
      const s = classifier.suggest({ word: w.word, meaningVi: w.meaningVi, example: w.example })
      raw.set(w.id, s.reason === 'fallback' ? KEEP : targetKey(s.target))
      return s.target
    })
    const options = buildTargetOptions({ classifier, topics: others, extra: [...extra, ...extraTargets], withCategories: true })
    // Chủ đề "mới" trùng tên chủ đề hiện tại = chính nó → bỏ (VD chủ đề "Động vật" của tôi ↔ chủ đề mẫu "Động vật")
    for (const [k, o] of options) if (o.target.kind === 'new' && normalizeName(o.target.name) === sourceName) options.delete(k)
    const suggest = (w: Word): string => {
      const k = raw.get(w.id) ?? KEEP
      return options.has(k) ? k : KEEP
    }
    return { ready, options, classifier, suggest }
  }, [words, classifier, others, sourceName, ready, extraTargets])
}

interface Row {
  checked: boolean
  manual?: string
  ai?: string
}

/** Phân loại lại các từ đã lưu trong một chủ đề: gợi ý chủ đề (WordNet + Gemini) → chuyển. */
export function Reclassify({
  topic,
  words,
  onDone,
  onCancel
}: {
  topic: Topic
  words: readonly Word[]
  onDone: (res: MoveWordsResult, emptied: boolean) => void
  onCancel: () => void
}): ReactNode {
  const [fileTargets, setFileTargets] = useState<readonly Target[]>(NO_TARGETS)
  /** Cấp độ CEFR đọc từ file phân loại, lưu kèm khi chuyển. */
  const [fileCefr, setFileCefr] = useState<ReadonlyMap<string, Cefr>>(new Map())
  const { ready, options, suggest, classifier } = useReclassifier(topic, words, fileTargets)
  const allWords = useWords() ?? NO_WORDS
  const wordsByTopic = useMemo(() => groupByTopic(allWords), [allWords])
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(words.map((w) => [w.id, { checked: true }])))
  const [busy, setBusy] = useState(false)
  const apiKey = useSettings((s) => s.geminiApiKey)
  const aiAuto = useSettings((s) => s.aiClassify)
  const [aiBusy, setAiBusy] = useState(0)
  const aiAbortRef = useRef<AbortController | null>(null)
  const aiTriedRef = useRef(new Set<string>())
  useEffect(() => () => aiAbortRef.current?.abort(), [])

  const row = (w: Word): Row => rows[w.id] ?? { checked: true }
  const patch = (id: string, p: Partial<Row>): void => setRows((rs) => ({ ...rs, [id]: { ...(rs[id] ?? { checked: true }), ...p } }))

  const targetOf = (w: Word): string => {
    const r = row(w)
    if (r.manual && (r.manual === KEEP || options.has(r.manual))) return r.manual
    if (r.ai && options.has(r.ai)) return r.ai
    return suggest(w)
  }
  const isDupe = (w: Word, key: string): boolean => {
    const o = options.get(key)
    if (!o || o.target.kind !== 'topic') return false
    const lw = w.word.toLowerCase()
    return (wordsByTopic.get(o.target.topicId) ?? []).some((x) => x.word.toLowerCase() === lw)
  }

  const moving = words.filter((w) => row(w).checked && targetOf(w) !== KEEP)
  const groups = new Map<string, { option: TargetOption; ids: string[] }>()
  for (const w of moving) {
    const k = targetOf(w)
    const g = groups.get(k)
    if (g) g.ids.push(w.id)
    else groups.set(k, { option: options.get(k)!, ids: [w.id] })
  }
  const groupList = [...groups.values()].sort((a, b) => b.ids.length - a.ids.length)

  /* ------------------------------ AI (Gemini) ------------------------------ */

  const aiPending = ready ? words.filter((w) => !row(w).manual && !(row(w).ai && options.has(row(w).ai!)) && suggest(w) === KEEP) : []
  const aiPendingKey = aiPending.map((w) => w.id).join(',')

  const runAi = async (list: readonly Word[]): Promise<void> => {
    if (!list.length || !apiKey) return
    list.forEach((w) => aiTriedRef.current.add(w.id))
    aiAbortRef.current?.abort()
    const ctrl = new AbortController()
    aiAbortRef.current = ctrl
    setAiBusy(list.length)
    try {
      const picks = await classifyWithGemini(
        list.map((w) => ({ word: w.word, meaningVi: w.meaningVi })),
        [...options.values()].map((o) => ({ key: o.key, label: o.label.replace(/ \(mới\)$/, '') })),
        { apiKey, signal: ctrl.signal }
      )
      setRows((rs) => {
        const next = { ...rs }
        list.forEach((w, i) => {
          if (picks[i]) next[w.id] = { ...(next[w.id] ?? { checked: true }), ai: picks[i]! }
        })
        return next
      })
      const n = picks.filter(Boolean).length
      if (n < list.length) toast.info(`AI đã xếp ${n}/${list.length} từ; số còn lại giữ ở "${topic.name}".`)
    } catch (e) {
      if (!ctrl.signal.aborted) {
        const overloaded = e instanceof GeminiError && (e.kind === 'unavailable' || e.kind === 'quota')
        toast.error(overloaded ? `${geminiErrorMessage(e)} Bấm "🤖 Phân loại bằng AI" để thử lại.` : `Không phân loại bằng AI được: ${geminiErrorMessage(e)}`)
      }
    } finally {
      if (aiAbortRef.current === ctrl) {
        aiAbortRef.current = null
        setAiBusy(0)
      }
    }
  }

  useEffect(() => {
    if (!ready || !apiKey || !aiAuto || aiBusy) return
    const todo = aiPending.filter((w) => !aiTriedRef.current.has(w.id))
    if (todo.length) void runAi(todo)
  }, [ready, apiKey, aiAuto, aiBusy, aiPendingKey]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------- Áp dụng phân loại từ file ------------------------- */

  const applyFile = async (): Promise<void> => {
    const file = await pickFile('.csv,text/csv')
    if (!file) return
    const map = parseClassificationCsv(await file.text())
    if (map.size === 0) {
      toast.error('File không có cột "word" và "topic" (hoặc "từ" và "chủ đề").')
      return
    }
    const refs = examTopics(await loadBundledPacks().catch(() => []))
    const targets: Target[] = []
    const manual = new Map<string, string>()
    const cefr = new Map<string, Cefr>()
    for (const w of words) {
      const e = map.get(w.word.trim().replace(/\s+/g, ' ').toLowerCase())
      if (!e) continue
      const t = classifier.resolve(targetForTopicName(e.topic, refs))
      targets.push(t)
      manual.set(w.id, targetKey(t))
      const c = toCefr(e.cefr)
      if (c && !w.cefr) cefr.set(w.id, c)
    }
    setFileTargets(targets)
    setFileCefr(cefr)
    setRows((rs) => {
      const next = { ...rs }
      for (const [id, key] of manual) next[id] = { ...(next[id] ?? { checked: true }), manual: key, checked: true }
      return next
    })
    const missing = words.length - manual.size
    toast.success(
      `Áp dụng phân loại cho ${manual.size}/${words.length} từ` +
        (missing ? ` · ${missing} từ không có trong file (giữ gợi ý cũ)` : '') +
        (cefr.size ? ` · sẽ lưu cấp độ cho ${cefr.size} từ` : '')
    )
  }

  /* --------------------------------- Chuyển --------------------------------- */

  const submit = async (): Promise<void> => {
    if (!moving.length) return toast.error('Chưa có từ nào cần chuyển.')
    setBusy(true)
    try {
      // Lưu cấp độ CEFR từ file trước khi chuyển (từ giữ id nên nhãn đi theo)
      if (fileCefr.size) {
        await saveWordLabels(moving.flatMap((w) => (fileCefr.has(w.id) ? [{ id: w.id, cefr: fileCefr.get(w.id) }] : [])))
      }
      const res = await moveWords(groupList.map((g) => ({ target: g.option.target, wordIds: g.ids })))
      const names = res.results.map((r) => `"${r.name}"${r.created ? ' (mới)' : ''}`).join(', ')
      toast.success(
        `Đã chuyển ${res.moved + res.merged} từ vào ${res.results.length} chủ đề: ${names}.${res.merged ? ` ${res.merged} từ trùng đã được gộp.` : ''}`
      )
      onDone(res, moving.length === words.length)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const optionList = [...options.values()]
  const mine = optionList.filter((o) => !o.isNew)
  const fresh = optionList.filter((o) => o.isNew)
  const allChecked = words.every((w) => row(w).checked)

  return (
    <div className="space-y-3" data-role="reclassify">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          {ready ? (
            <>
              Sẽ chuyển <b>{moving.length}</b>/{words.length} từ
              {aiPending.length > 0 && <span className="text-slate-500"> · {aiPending.length} từ chưa đoán được (giữ nguyên)</span>}
            </>
          ) : (
            <span className="text-slate-500">Đang nạp dữ liệu phân loại…</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {apiKey &&
            (aiBusy > 0 ? (
              <span className="text-sm text-indigo-600 dark:text-indigo-400" aria-live="polite" data-role="ai-status">
                🤖 AI đang phân loại {aiBusy} từ…
              </span>
            ) : (
              aiPending.length > 0 && (
                <Button size="sm" onClick={() => void runAi(aiPending)}>
                  🤖 Phân loại bằng AI ({aiPending.length})
                </Button>
              )
            ))}
          <Button size="sm" disabled={!ready || aiBusy > 0} onClick={() => void applyFile()} title="File CSV có cột word, topic (và cefr)">
            📄 Áp dụng từ file CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRows(Object.fromEntries(words.map((w) => [w.id, { ...row(w), checked: !allChecked }])))}
          >
            {allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
          </Button>
        </div>
      </div>

      {!apiKey && ready && aiPending.length > 0 && (
        <div className="text-sm text-slate-500" data-role="ai-hint">
          Thêm <b>Gemini API key</b> trong{' '}
          <Link to="/settings" className="text-indigo-600 hover:underline dark:text-indigo-400">
            Cài đặt
          </Link>{' '}
          để AI xếp nốt {aiPending.length} từ chưa đoán được.
        </div>
      )}

      {groupList.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm" data-role="topic-summary">
          <span className="text-slate-500">Sẽ chuyển vào {groupList.length} chủ đề:</span>
          {groupList.map(({ option, ids }) => (
            <span
              key={option.key}
              className={cx(
                'rounded-full px-2 py-0.5 text-xs ring-1',
                option.isNew
                  ? 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-900'
                  : 'bg-white ring-slate-200 dark:bg-slate-900 dark:ring-slate-700'
              )}
            >
              {option.label.replace(/ \(mới\)$/, '')} · {ids.length}
              {option.isNew && ' · mới'}
            </span>
          ))}
        </div>
      )}

      <div className="max-h-[55vh] overflow-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="py-2 pr-2">Từ</th>
              <th className="py-2 pr-2">Nghĩa</th>
              <th className="py-2 pr-2">Chuyển sang</th>
              <th className="py-2 pr-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {words.map((w) => {
              const r = row(w)
              const key = targetOf(w)
              const keep = key === KEEP
              return (
                <tr key={w.id} className={cx((!r.checked || keep) && 'opacity-60')}>
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={r.checked}
                      onChange={() => patch(w.id, { checked: !r.checked })}
                      aria-label={`Chọn "${w.word}"`}
                    />
                  </td>
                  <td className="py-1.5 pr-2 font-medium">{w.word}</td>
                  <td className="max-w-56 truncate py-1.5 pr-2 text-slate-600 dark:text-slate-300" title={w.meaningVi}>
                    {w.meaningVi}
                  </td>
                  <td className="w-56 py-1.5 pr-2">
                    <select
                      className={cx(inputCls, 'py-1 text-xs', !keep && options.get(key)?.isNew && 'text-indigo-700 dark:text-indigo-300')}
                      value={key}
                      onChange={(e) => patch(w.id, { manual: e.target.value, checked: true })}
                      aria-label={`Chủ đề mới của "${w.word}"`}
                    >
                      <option value={KEEP}>— Giữ ở "{topic.name}"</option>
                      {mine.length > 0 && (
                        <optgroup label="Chủ đề của tôi">
                          {mine.map((o) => (
                            <option key={o.key} value={o.key}>
                              {o.label}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      <optgroup label="Chủ đề mới (tạo khi chuyển)">
                        {fresh.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      {!r.manual && r.ai && options.has(r.ai) && <Badge tone="indigo">🤖 AI</Badge>}
                      {fileCefr.has(w.id) && <Badge tone="slate">{fileCefr.get(w.id)}</Badge>}
                      {!keep && isDupe(w, key) && <Badge tone="amber">Đã có ở đích · gộp</Badge>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">
        Từ được chuyển giữ nguyên tiến độ học và ảnh. Gợi ý dựa trên từ điển WordNet (offline) và Gemini (nếu có key) — hãy xem lại
        trước khi chuyển.
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel}>Hủy</Button>
        <Button variant="primary" disabled={busy || aiBusy > 0 || !ready || moving.length === 0} onClick={() => void submit()}>
          Chuyển {moving.length} từ
        </Button>
      </div>
    </div>
  )
}

/** Khung gợi ý trong chủ đề dự phòng: "N từ có thể xếp vào chủ đề cụ thể". */
export function ReclassifyHint({ topic, words, onOpen }: { topic: Topic; words: readonly Word[]; onOpen: () => void }): ReactNode {
  const { ready, suggest } = useReclassifier(topic, words)
  if (!ready) return null
  const n = words.filter((w) => suggest(w) !== KEEP).length
  if (n === 0) return null
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-900 ring-1 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:ring-indigo-900"
      data-role="reclassify-hint"
    >
      <span>
        💡 <b>{n}</b> từ trong chủ đề này có thể xếp vào chủ đề cụ thể.
      </span>
      <Button size="sm" variant="primary" onClick={onOpen}>
        🗂️ Phân loại lại
      </Button>
    </div>
  )
}
