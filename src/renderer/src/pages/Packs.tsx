import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { installPack, uninstallPack, PACKS_META_KEY, type InstalledPack } from '@/db/repo'
import { loadBundledPacks } from '@/data/packs'
import { CEFR_LEVELS, isPackFile, summarizePack, type PackFile, type PackSummary } from '@/core/packs'
import { topicProgress } from '@/core/stats'
import { groupByTopic, useMeta, useNow, useProgressMap } from '@/hooks/useData'
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, cx } from '@/components/ui'
import { TopicIcon } from '@/components/TopicIcon'
import { ExamPlanCard } from '@/components/ExamPlanCard'
import { ExamClassifyCard } from '@/components/ExamClassifyCard'
import { toast } from '@/components/Toast'
import { pickFile } from '@/download'
import type { Cefr, Topic, Word, WordProgress } from '@/types'

const EXAM_LABEL = { toeic: 'TOEIC', ielts: 'IELTS', general: 'Nền tảng' } as const

export default function Packs(): ReactNode {
  const [bundled, setBundled] = useState<PackFile[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const installed = useMeta<Record<string, InstalledPack>>(PACKS_META_KEY, {})
  const packWords = useLiveQuery(() => db.words.where('packId').above('').toArray(), [])
  const packTopics = useLiveQuery(() => db.topics.where('packId').above('').sortBy('order'), [])
  const progress = useProgressMap()
  const now = useNow()

  useEffect(() => {
    loadBundledPacks()
      .then(setBundled)
      .catch(() => setBundled([]))
  }, [])

  const summaries = useMemo(() => new Map((bundled ?? []).map((p) => [p.id, summarizePack(p)])), [bundled])

  async function install(pack: PackFile): Promise<void> {
    setBusy(pack.id)
    try {
      const r = await installPack(pack)
      toast.success(
        `Đã cài "${pack.name}": ${r.words.toLocaleString('vi-VN')} từ trong ${r.topics} chủ đề` +
          (r.removed ? ` · bỏ ${r.removed} từ cũ` : '') +
          (r.skipped ? ` · ${r.skipped} dòng thiếu nghĩa bị bỏ qua` : '')
      )
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string, name: string): Promise<void> {
    if (!confirm(`Gỡ gói "${name}"? Tiến độ học các từ trong gói sẽ bị xóa.`)) return
    setBusy(id)
    try {
      await uninstallPack(id)
      toast.success(`Đã gỡ gói "${name}".`)
    } finally {
      setBusy(null)
    }
  }

  async function importFile(): Promise<void> {
    const file = await pickFile('.json,application/json')
    if (!file) return
    try {
      const data: unknown = JSON.parse(await file.text())
      if (!isPackFile(data)) throw new Error('File không phải gói luyện thi của LearnAndType.')
      await install(data)
    } catch (e) {
      toast.error(e instanceof SyntaxError ? 'File JSON bị lỗi.' : (e as Error).message)
    }
  }

  if (!bundled || !installed || !packWords || !packTopics || !progress) return null

  const ids = [...new Set([...summaries.keys(), ...Object.keys(installed)])]
  const wordsByPack = groupBy(packWords, (w) => w.packId!)
  const topicsByPack = groupBy(packTopics, (t) => t.packId!)

  return (
    <div>
      <PageHeader
        title="Luyện thi TOEIC & IELTS"
        subtitle="Cài các gói từ vựng luyện thi, học theo chủ đề và theo cấp độ CEFR."
        actions={<Button onClick={importFile}>📂 Nhập gói từ file</Button>}
      />

      {Object.keys(installed).length > 0 && (
        <div className="mb-6">
          <ExamPlanCard />
        </div>
      )}

      {ids.length === 0 ? (
        <Card>
          <EmptyState icon="🎯" title="Chưa có gói luyện thi nào">
            Đặt dữ liệu nguồn vào thư mục <code>data-sources/</code> rồi chạy <code>npm run build:packs</code> để đóng
            gói kèm app, hoặc bấm <b>Nhập gói từ file</b> để chọn một file gói (.json).
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          {ids.map((id) => {
            const info = summaries.get(id)
            const inst = installed[id]
            const pack = bundled.find((p) => p.id === id)
            return (
              <PackCard
                key={id}
                id={id}
                info={info}
                inst={inst}
                busy={busy === id}
                words={wordsByPack.get(id) ?? []}
                topics={topicsByPack.get(id) ?? []}
                progress={progress}
                now={now}
                onInstall={pack ? () => install(pack) : undefined}
                onRemove={() => remove(id, inst?.name ?? info?.name ?? id)}
              />
            )
          })}
        </div>
      )}

      <div className="mt-6">
        <ExamClassifyCard />
      </div>
    </div>
  )
}

function PackCard({
  id,
  info,
  inst,
  busy,
  words,
  topics,
  progress,
  now,
  onInstall,
  onRemove
}: {
  id: string
  info?: PackSummary
  inst?: InstalledPack
  busy: boolean
  words: Word[]
  topics: Topic[]
  progress: Map<string, WordProgress>
  now: number
  onInstall?: () => void
  onRemove: () => void
}): ReactNode {
  const [cefr, setCefr] = useState<Cefr | null>(null)
  const name = info?.name ?? inst?.name ?? id
  const emoji = info?.emoji ?? inst?.emoji ?? '📘'
  const hasUpdate = !!inst && !!info && (info.version !== inst.version || (info.build ?? 0) !== (inst.build ?? 0))
  const tp = topicProgress(
    words.map((w) => w.id),
    progress,
    now
  )
  const byTopic = groupByTopic(cefr ? words.filter((w) => w.cefr === cefr) : words)

  const levels = CEFR_LEVELS.map((lv) => {
    const ws = words.filter((w) => w.cefr === lv)
    const learned = ws.filter((w) => (progress.get(w.id)?.box ?? 0) > 0).length
    return { lv, total: ws.length, learned }
  }).filter((x) => x.total > 0)

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <div className="emoji flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-3xl dark:bg-indigo-950">
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{name}</h2>
            {info?.exam && <Badge tone="indigo">{EXAM_LABEL[info.exam]}</Badge>}
            {inst ? <Badge tone="emerald">Đã cài · v{inst.version}</Badge> : <Badge>Chưa cài</Badge>}
            {hasUpdate && <Badge tone="amber">Có bản mới</Badge>}
          </div>
          {info?.description && <p className="mt-1 text-sm text-slate-500">{info.description}</p>}
          <div className="mt-1 text-xs text-slate-500">
            {info && `${info.wordCount.toLocaleString('vi-VN')} từ · ${info.topicCount} chủ đề`}
            {info?.sources?.length ? ` · Nguồn: ${info.sources.join(', ')}` : ''}
          </div>
        </div>
        <div className="flex gap-2">
          {onInstall && (!inst || hasUpdate) && (
            <Button variant="primary" disabled={busy} onClick={onInstall}>
              {busy ? 'Đang cài…' : inst ? '⬆️ Cập nhật' : '⬇️ Cài gói'}
            </Button>
          )}
          {inst && (
            <Button variant="ghost" disabled={busy} onClick={onRemove}>
              Gỡ
            </Button>
          )}
        </div>
      </div>

      {inst && words.length > 0 && (
        <>
          <ProgressBar className="mt-4" total={tp.total} learned={tp.learned} mastered={tp.mastered} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
            <span data-role="pack-coverage">
              Độ phủ: {tp.learned.toLocaleString('vi-VN')}/{tp.total.toLocaleString('vi-VN')} từ đã học ·{' '}
              {tp.mastered.toLocaleString('vi-VN')} đã thuộc ({pct(tp.mastered, tp.total)}%)
            </span>
            {tp.due > 0 && <Badge tone="amber">{tp.due} cần ôn</Badge>}
          </div>

          {levels.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <CefrChip active={cefr === null} onClick={() => setCefr(null)}>
                Tất cả
              </CefrChip>
              {levels.map((l) => (
                <CefrChip key={l.lv} active={cefr === l.lv} onClick={() => setCefr(cefr === l.lv ? null : l.lv)}>
                  {l.lv}{' '}
                  <span className="opacity-70">
                    {l.learned}/{l.total}
                  </span>
                </CefrChip>
              ))}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {topics.map((t) => {
              const ws = byTopic.get(t.id) ?? []
              if (ws.length === 0) return null
              const p = topicProgress(
                ws.map((w) => w.id),
                progress,
                now
              )
              return (
                <Link
                  key={t.id}
                  to={`/topics/${t.id}`}
                  className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-slate-200 transition-colors hover:bg-slate-50 hover:ring-indigo-300 dark:ring-slate-800 dark:hover:bg-slate-800"
                >
                  <span className="text-2xl">
                    <TopicIcon topic={t} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="block text-xs text-slate-500">
                      {p.learned}/{p.total} đã học · {p.mastered} đã thuộc
                    </span>
                  </span>
                  {p.due > 0 && <Badge tone="amber">{p.due}</Badge>}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

function CefrChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'cursor-pointer rounded-full px-3 py-1 text-sm transition-colors',
        active
          ? 'bg-indigo-600 text-white'
          : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
      )}
    >
      {children}
    </button>
  )
}

const pct = (a: number, b: number): number => (b ? Math.round((a / b) * 100) : 0)

function groupBy<T>(list: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const x of list) {
    const k = key(x)
    const l = m.get(k)
    if (l) l.push(x)
    else m.set(k, [x])
  }
  return m
}
