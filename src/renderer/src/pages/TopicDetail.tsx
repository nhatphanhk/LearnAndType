import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { canCloze, pickWordsForKind } from '@/core/queue'
import { canDrill } from '@/core/drill'
import { isDue } from '@/core/srs'
import { topicProgress } from '@/core/stats'
import { useNow, useProgressMap, useTopic, useWords } from '@/hooks/useData'
import { speak } from '@/hooks/useSpeech'
import { useSettings } from '@/store/settingsStore'
import { WordImage } from '@/components/WordImage'
import { TopicIcon } from '@/components/TopicIcon'
import { Badge, Button, Card, EmptyState, ProgressBar, StatTile, cx } from '@/components/ui'
import { KIND_INFO, formatDue, posLabel, statusBadge } from '@/labels'
import { launchSession } from '@/launch'
import { db } from '@/db/schema'
import type { SessionKind } from '@/types'

type Filter = 'all' | 'new' | 'learning' | 'mastered' | 'due'

export default function TopicDetail(): ReactNode {
  const { id } = useParams()
  const topic = useTopic(id)
  const words = useWords(id)
  const progress = useProgressMap()
  const lessonSize = useSettings((s) => s.lessonSize)
  const navigate = useNavigate()
  const now = useNow()
  const [filter, setFilter] = useState<Filter>('all')

  const tp = useMemo(
    () =>
      topicProgress(
        (words ?? []).map((w) => w.id),
        progress ?? new Map(),
        now
      ),
    [words, progress, now]
  )

  if (topic === null) {
    return (
      <EmptyState icon="🔍" title="Không tìm thấy chủ đề">
        <Link to="/topics" className="text-indigo-600 hover:underline">
          Quay lại danh sách chủ đề
        </Link>
      </EmptyState>
    )
  }
  if (!topic || !words || !progress) return null

  const newCount = tp.total - tp.learned
  const learnedWords = words.filter((w) => (progress.get(w.id)?.box ?? 0) > 0)
  const dueWords = words.filter((w) => isDue(progress.get(w.id), now))
  const clozeCount = words.filter(canCloze).length
  const drillCount = words.filter(canDrill).length

  const start = async (kind: SessionKind): Promise<void> => {
    const picked = pickWordsForKind(kind, words, progress, lessonSize, now)
    // Trắc nghiệm cần đủ phương án nhiễu: chủ đề ít từ thì lấy thêm từ cả gói / cả kho
    const pool =
      (kind === 'choice' || kind === 'drill') && words.length < 12
        ? topic.packId
          ? await db.words.where('packId').equals(topic.packId).toArray()
          : await db.words.toArray()
        : words
    void launchSession(navigate, kind, topic.id, picked, { pool })
  }

  const modes: { kind: SessionKind; note: string; disabled?: boolean }[] = [
    {
      kind: 'lesson',
      note: newCount > 0 ? `${Math.min(lessonSize, newCount)} từ mới` : 'Đã học hết · ôn lại từ yếu',
      disabled: words.length === 0
    },
    { kind: 'copy', note: `${Math.min(lessonSize, words.length)} từ`, disabled: words.length === 0 },
    {
      kind: 'recall',
      note: learnedWords.length ? `${Math.min(lessonSize, words.length)} từ, ưu tiên từ đã học` : 'Chưa học từ nào — thử sức!',
      disabled: words.length === 0
    },
    { kind: 'listen', note: `${Math.min(lessonSize, words.length)} từ`, disabled: words.length === 0 },
    {
      kind: 'cloze',
      note: clozeCount ? `${Math.min(lessonSize, clozeCount)} câu` : 'Cần từ có câu ví dụ',
      disabled: clozeCount === 0
    },
    {
      kind: 'choice',
      note: clozeCount ? `${Math.min(lessonSize, words.length)} câu, 4 đáp án` : `${Math.min(lessonSize, words.length)} từ, chọn theo nghĩa`,
      disabled: words.length < 2
    },
    ...(drillCount > 0
      ? [{ kind: 'drill' as const, note: `${Math.min(lessonSize, drillCount)} từ · họ từ, đồng nghĩa, collocation` }]
      : []),
    { kind: 'review', note: dueWords.length ? `${dueWords.length} từ đến hạn` : 'Chưa có từ đến hạn', disabled: dueWords.length === 0 }
  ]

  const filtered = words.filter((w) => {
    const p = progress.get(w.id)
    switch (filter) {
      case 'new':
        return !p || p.box === 0
      case 'learning':
        return !!p && p.box > 0 && p.status !== 'mastered'
      case 'mastered':
        return p?.status === 'mastered'
      case 'due':
        return isDue(p, now)
      default:
        return true
    }
  })

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'Tất cả', count: tp.total },
    { key: 'new', label: 'Chưa học', count: newCount },
    { key: 'learning', label: 'Đang học', count: tp.learned - tp.mastered },
    { key: 'mastered', label: 'Đã thuộc', count: tp.mastered },
    { key: 'due', label: 'Cần ôn', count: dueWords.length }
  ]

  return (
    <div>
      <Link to={topic.packId ? '/packs' : '/topics'} className="text-sm text-slate-500 hover:text-indigo-600">
        {topic.packId ? '← Luyện thi' : '← Tất cả chủ đề'}
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 text-5xl dark:bg-indigo-950">
          <TopicIcon topic={topic} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{topic.name}</h1>
          <div className="text-slate-500">
            {topic.nameEn}
            {topic.description && <> · {topic.description}</>}
          </div>
          <ProgressBar className="mt-3 max-w-md" total={tp.total} learned={tp.learned} mastered={tp.mastered} />
        </div>
        {!topic.isBuiltIn && (
          <Link to={`/manage/${topic.id}`}>
            <Button>✏️ Sửa / thêm từ</Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Tổng số từ" value={tp.total} icon="📘" />
        <StatTile label="Đã học" value={tp.learned} icon="🌱" tone="indigo" />
        <StatTile label="Đã thuộc" value={tp.mastered} icon="🏅" tone="emerald" />
        <StatTile label="Cần ôn" value={dueWords.length} icon="⏰" tone="amber" />
      </div>

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-x-6">
        <h2 className="text-lg font-semibold">Chọn chế độ luyện gõ</h2>
        {words.length > 0 && (
          <Link
            to={`/typing?topic=${encodeURIComponent(topic.id)}`}
            className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            🔤 Gõ chỉ chữ (không hình ảnh) →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modes.map((m) => {
          const info = KIND_INFO[m.kind]
          return (
            <button
              key={m.kind}
              type="button"
              disabled={m.disabled}
              onClick={() => start(m.kind)}
              className={cx(
                'flex cursor-pointer items-start gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-indigo-700',
                m.kind === 'lesson' && 'ring-2 ring-indigo-400 dark:ring-indigo-600'
              )}
            >
              <span className="emoji text-3xl">{info.icon}</span>
              <span>
                <span className="block font-semibold">{info.title}</span>
                <span className="block text-sm text-slate-500">{info.desc}</span>
                <span className="mt-1 block text-xs font-medium text-indigo-600 dark:text-indigo-400">{m.note}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Danh sách từ</h2>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cx(
                'cursor-pointer rounded-full px-3 py-1 text-sm transition-colors',
                filter === f.key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
              )}
            >
              {f.label} <span className="opacity-70">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {words.length === 0 ? (
        <Card>
          <EmptyState icon="📝" title="Chủ đề chưa có từ nào">
            <Link to={`/manage/${topic.id}`} className="text-indigo-600 hover:underline">
              Thêm từ hoặc nhập từ file CSV
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.map((w) => {
              const p = progress.get(w.id)
              const b = statusBadge(p)
              return (
                <li key={w.id} className="flex items-center gap-4 px-5 py-3">
                  <WordImage word={w} size="sm" />
                  <div className="w-48 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{w.word}</span>
                      {w.cefr && <Badge tone="indigo">{w.cefr}</Badge>}
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {w.ipa} {w.partOfSpeech && <i>· {posLabel(w.partOfSpeech)}</i>}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{w.meaningVi}</div>
                    {w.example && <div className="truncate text-sm text-slate-500">{w.example}</div>}
                    {!!(w.synonyms?.length || w.collocations?.length || w.family?.length) && (
                      <div className="truncate text-xs text-slate-500">
                        {[
                          w.synonyms?.length && `≈ ${w.synonyms.join(', ')}`,
                          w.collocations?.length && `🔗 ${w.collocations.join(' · ')}`,
                          w.family?.length && `👪 ${w.family.join(', ')}`
                        ]
                          .filter(Boolean)
                          .join('   ')}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={b.tone}>{b.text}</Badge>
                    {p && p.box > 0 && (
                      <span className="text-xs text-slate-500">Ôn {formatDue(p.nextReviewAt, now)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => speak(w.word)}
                    className="emoji cursor-pointer rounded-full p-1.5 text-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                    title="Nghe phát âm"
                  >
                    🔊
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && <li className="px-5 py-8 text-center text-slate-500">Không có từ nào.</li>}
          </ul>
        </Card>
      )}
    </div>
  )
}
