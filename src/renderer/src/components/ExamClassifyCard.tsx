import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { moveWords, saveWordLabels, PACKS_META_KEY, type InstalledPack } from '@/db/repo'
import { loadBundledPacks } from '@/data/packs'
import { loadCefrLevels } from '@/data/levels'
import {
  buildExamIndex,
  classifyWords,
  examTopicName,
  examTopics,
  summarizeClassification,
  type ExamTopicRef,
  type WordClassification
} from '@/core/examClassify'
import { CEFR_LEVELS, toCefr, type PackFile } from '@/core/packs'
import { classifyExamWithGemini, geminiErrorMessage } from '@/core/gemini'
import { useMeta } from '@/hooks/useData'
import { useSettings } from '@/store/settingsStore'
import { toast } from './Toast'
import { Badge, Button, Card, cx } from './ui'
import type { Topic, Word } from '@/types'

/** Gói đã cài nhưng không đóng kèm app (nhập từ file) → dựng lại từ DB để dùng khi phân loại. */
function packsFromDb(words: readonly Word[], topics: readonly Topic[], installed: Record<string, InstalledPack>): PackFile[] {
  return Object.entries(installed).map(([id, inst]) => ({
    app: 'LearnAndType-pack',
    id,
    version: inst.version,
    name: inst.name,
    nameEn: inst.name,
    emoji: inst.emoji,
    exam: inst.exam,
    topics: topics
      .filter((t) => t.packId === id)
      .map((t) => ({
        id: t.id.replace(`pack-${id}-`, ''),
        name: t.name,
        nameEn: t.nameEn,
        emoji: t.emoji,
        words: words
          .filter((w) => w.topicId === t.id)
          .map((w) => ({ word: w.word, meaningVi: w.meaningVi, cefr: w.cefr }))
      }))
  }))
}

interface Analysis {
  list: WordClassification[]
  refs: ExamTopicRef[]
}

/** "Phân loại từ đang có": gắn CEFR + nhãn TOEIC/IELTS cho từ có sẵn và từ tự thêm, xếp từ của tôi vào chủ đề thi. */
export function ExamClassifyCard(): ReactNode {
  const words = useLiveQuery(() => db.words.toArray(), [])
  const topics = useLiveQuery(() => db.topics.toArray(), [])
  const installed = useMeta<Record<string, InstalledPack>>(PACKS_META_KEY, {})
  const apiKey = useSettings((s) => s.geminiApiKey)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState<'analyze' | 'ai' | 'save' | 'move' | null>(null)
  const [skip, setSkip] = useState<Set<string>>(new Set())

  const own = useMemo(() => (words ?? []).filter((w) => !w.packId), [words])
  const summary = useMemo(() => (analysis ? summarizeClassification(analysis.list) : null), [analysis])

  if (!words || !topics || !installed) return null

  const analyze = async (): Promise<void> => {
    setBusy('analyze')
    try {
      const [bundled, levels] = await Promise.all([loadBundledPacks(), loadCefrLevels()])
      const ids = new Set(bundled.map((p) => p.id))
      const fromDb = packsFromDb(
        words.filter((w) => w.packId && !ids.has(w.packId)),
        topics,
        Object.fromEntries(Object.entries(installed).filter(([id]) => !ids.has(id)))
      )
      const packs = [...bundled, ...fromDb]
      const index = buildExamIndex(packs, levels)
      setAnalysis({ list: classifyWords(own, index), refs: examTopics(packs) })
      setSkip(new Set())
    } finally {
      setBusy(null)
    }
  }

  const askAi = async (): Promise<void> => {
    if (!analysis) return
    const todo = analysis.list.filter((c) => c.unknown && !c.cefr)
    if (todo.length === 0) return
    setBusy('ai')
    try {
      const opts = analysis.refs.map((r) => ({ key: r.key, label: `${r.exam.toUpperCase()} – ${r.nameEn || r.name}` }))
      const guesses = await classifyExamWithGemini(
        todo.map((c) => ({ word: c.word.word, meaningVi: c.word.meaningVi })),
        opts,
        { apiKey }
      )
      const byKey = new Map(analysis.refs.map((r) => [r.key, r]))
      const result = new Map(todo.map((c, i) => [c.word.id, guesses[i]]))
      setAnalysis({
        ...analysis,
        list: analysis.list.map((c) => {
          const g = result.get(c.word.id)
          if (!g) return c
          const topic = g.topic ? byKey.get(g.topic) : undefined
          const cefr = toCefr(g.cefr) ?? c.cefr
          const tags = topic ? [...new Set([...c.tags, topic.exam])] : c.tags
          return { ...c, cefr, tags, topic: topic ?? c.topic, unknown: false, changed: c.changed || cefr !== c.word.cefr || tags.length !== (c.word.tags?.length ?? 0) }
        })
      })
      toast.success(`AI đã ước lượng cấp độ cho ${guesses.filter((g) => g.cefr).length}/${todo.length} từ.`)
    } catch (e) {
      toast.error(`Không phân loại bằng AI được: ${geminiErrorMessage(e)}`)
    } finally {
      setBusy(null)
    }
  }

  const save = async (): Promise<void> => {
    if (!analysis) return
    setBusy('save')
    try {
      const n = await saveWordLabels(
        analysis.list.filter((c) => c.changed).map((c) => ({ id: c.word.id, cefr: c.cefr, tags: c.tags }))
      )
      toast.success(`Đã gắn nhãn cho ${n.toLocaleString('vi-VN')} từ.`)
      setAnalysis({ ...analysis, list: analysis.list.map((c) => ({ ...c, changed: false })) })
    } finally {
      setBusy(null)
    }
  }

  // Từ của tôi có chủ đề thi gợi ý, nhóm theo chủ đề
  const movable = (analysis?.list ?? []).filter((c) => !c.word.isBuiltIn && c.topic)
  const groups = new Map<string, { ref: ExamTopicRef; items: WordClassification[] }>()
  for (const c of movable) {
    const g = groups.get(c.topic!.key) ?? { ref: c.topic!, items: [] }
    g.items.push(c)
    groups.set(c.topic!.key, g)
  }
  const selected = movable.filter((c) => !skip.has(c.word.id))

  const move = async (): Promise<void> => {
    if (selected.length === 0) return
    setBusy('move')
    try {
      // Lưu nhãn trước (từ giữ id khi chuyển nên nhãn đi theo)
      await saveWordLabels(selected.map((c) => ({ id: c.word.id, cefr: c.cefr, tags: c.tags })))
      const byRef = new Map<string, { ref: ExamTopicRef; ids: string[] }>()
      for (const c of selected) {
        const g = byRef.get(c.topic!.key) ?? { ref: c.topic!, ids: [] }
        g.ids.push(c.word.id)
        byRef.set(c.topic!.key, g)
      }
      const res = await moveWords(
        [...byRef.values()].map(({ ref, ids }) => ({
          target: {
            kind: 'new' as const,
            name: examTopicName(ref),
            nameEn: `${ref.exam.toUpperCase()} · ${ref.nameEn}`,
            emoji: ref.emoji,
            description: `Từ của tôi thuộc chủ đề ${ref.name} (${ref.packName}).`
          },
          wordIds: ids
        }))
      )
      toast.success(
        `Đã xếp ${(res.moved + res.merged).toLocaleString('vi-VN')} từ vào ${res.results.length} chủ đề thi` +
          (res.merged ? ` (${res.merged} từ trùng đã gộp)` : '')
      )
      setAnalysis(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <span className="emoji text-3xl">🏷️</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Phân loại từ vựng đang có</h2>
          <p className="text-sm text-slate-500">
            Gắn cấp độ CEFR và nhãn TOEIC / IELTS cho {own.length.toLocaleString('vi-VN')} từ có sẵn và từ của bạn, rồi xếp từ
            của bạn vào chủ đề thi phù hợp.
          </p>
        </div>
        <Button variant={analysis ? 'ghost' : 'primary'} disabled={!!busy || own.length === 0} onClick={() => void analyze()}>
          {busy === 'analyze' ? 'Đang phân tích…' : analysis ? '🔄 Phân tích lại' : '🔎 Phân tích'}
        </Button>
      </div>

      {analysis && summary && (
        <div className="mt-4" data-role="classify-summary">
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge tone="indigo">{summary.withCefr}/{summary.total} có cấp độ</Badge>
            <Badge tone="emerald">{summary.toeic} từ TOEIC</Badge>
            <Badge tone="emerald">{summary.ielts} từ IELTS</Badge>
            {summary.unknown > 0 && <Badge tone="amber">{summary.unknown} chưa xác định</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {[...CEFR_LEVELS, '?' as const].map((lv) =>
              summary.byCefr[lv] ? (
                <span key={lv} className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                  {lv === '?' ? 'Chưa rõ' : lv}: <b>{summary.byCefr[lv]}</b>
                </span>
              ) : null
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" disabled={!!busy || summary.changed === 0} onClick={() => void save()}>
              {busy === 'save' ? 'Đang lưu…' : summary.changed ? `💾 Lưu nhãn cho ${summary.changed} từ` : '✅ Nhãn đã được lưu'}
            </Button>
            {summary.unknown > 0 &&
              (apiKey ? (
                <Button disabled={!!busy} onClick={() => void askAi()}>
                  {busy === 'ai' ? 'AI đang phân loại…' : `🤖 Nhờ AI cho ${summary.unknown} từ chưa xác định`}
                </Button>
              ) : (
                <span className="self-center text-xs text-slate-500">
                  Nhập Gemini API key ở Cài đặt để AI ước lượng cấp độ các từ chưa xác định.
                </span>
              ))}
          </div>

          {groups.size > 0 && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">Xếp từ của tôi vào chủ đề thi</h3>
                <Button size="sm" disabled={!!busy || selected.length === 0} onClick={() => void move()}>
                  {busy === 'move' ? 'Đang chuyển…' : `📦 Chuyển ${selected.length} từ`}
                </Button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Từ được chuyển sang chủ đề mới (VD "TOEIC · Tài chính & kế toán"), giữ nguyên tiến độ học. Bỏ chọn từ muốn giữ
                nguyên chỗ cũ.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {[...groups.values()].map(({ ref, items }) => (
                  <div key={ref.key} className="rounded-xl p-3 ring-1 ring-slate-200 dark:ring-slate-800">
                    <div className="mb-2 font-medium">
                      <span className="emoji mr-1">{ref.emoji}</span>
                      {examTopicName(ref)} <span className="text-xs text-slate-500">({items.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((c) => {
                        const off = skip.has(c.word.id)
                        return (
                          <button
                            key={c.word.id}
                            type="button"
                            title={c.word.meaningVi}
                            onClick={() =>
                              setSkip((s) => {
                                const n = new Set(s)
                                if (off) n.delete(c.word.id)
                                else n.add(c.word.id)
                                return n
                              })
                            }
                            className={cx(
                              'cursor-pointer rounded-full px-2.5 py-1 text-sm ring-1 transition-colors',
                              off
                                ? 'text-slate-400 line-through ring-slate-200 dark:ring-slate-700'
                                : 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:ring-indigo-800'
                            )}
                          >
                            {c.word.word}
                            {c.cefr && <span className="ml-1 text-xs opacity-70">{c.cefr}</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

