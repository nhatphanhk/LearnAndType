import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { useNow, useTopics } from '@/hooks/useData'
import { Badge, Button, Card, EmptyState, PageHeader } from '@/components/ui'
import { WordImage } from '@/components/WordImage'
import { BOX_INTERVALS_DAYS } from '@/core/srs'
import { formatDue } from '@/labels'
import { launchSession } from '@/launch'
import type { Word } from '@/types'

const MAX_PER_SESSION = 30

export default function Review(): ReactNode {
  const now = useNow()
  const navigate = useNavigate()
  const topics = useTopics()

  const data = useLiveQuery(async () => {
    const learned = await db.progress.where('box').above(0).toArray()
    const due = learned.filter((p) => p.nextReviewAt <= now).sort((a, b) => a.nextReviewAt - b.nextReviewAt || a.box - b.box)
    const upcoming = learned.filter((p) => p.nextReviewAt > now).sort((a, b) => a.nextReviewAt - b.nextReviewAt)
    const words = (await db.words.bulkGet(due.map((p) => p.wordId))).filter((w): w is Word => !!w)
    return { due, words, upcoming, learned: learned.length }
  }, [now])

  const topicName = useMemo(() => new Map((topics ?? []).map((t) => [t.id, t])), [topics])

  if (!data) return null
  const { words, upcoming, learned } = data
  const byTopic = new Map<string, number>()
  for (const w of words) byTopic.set(w.topicId, (byTopic.get(w.topicId) ?? 0) + 1)

  return (
    <div>
      <PageHeader
        title="Ôn tập"
        subtitle="Lặp lại ngắt quãng: từ càng nhớ chắc thì càng lâu mới phải ôn lại."
      />

      {words.length === 0 ? (
        <Card>
          <EmptyState icon={learned ? '🎉' : '🌱'} title={learned ? 'Hôm nay không có từ nào cần ôn!' : 'Bạn chưa học từ nào'}>
            {learned ? (
              upcoming.length > 0 && <>Lượt ôn tiếp theo: {formatDue(upcoming[0].nextReviewAt, now)}.</>
            ) : (
              <Link to="/topics" className="text-indigo-600 hover:underline">
                Bắt đầu một bài học theo chủ đề
              </Link>
            )}
          </EmptyState>
        </Card>
      ) : (
        <Card className="flex flex-wrap items-center gap-6 p-6">
          <div className="emoji text-6xl">🔁</div>
          <div className="min-w-0 flex-1">
            <div className="text-3xl font-bold">{words.length} từ cần ôn</div>
            <div className="mt-1 text-slate-500">
              Trộn ngẫu nhiên các chế độ Nhớ từ, Nghe & gõ và Điền vào câu.
              {words.length > MAX_PER_SESSION && ` Mỗi phiên tối đa ${MAX_PER_SESSION} từ.`}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[...byTopic.entries()].map(([tid, n]) => {
                const t = topicName.get(tid)
                return (
                  <Badge key={tid} tone="amber">
                    {t ? `${t.emoji} ${t.name}` : tid}: {n}
                  </Badge>
                )
              })}
            </div>
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() => void launchSession(navigate, 'review', null, words.slice(0, MAX_PER_SESSION))}
          >
            Bắt đầu ôn tập
          </Button>
        </Card>
      )}

      {words.length > 0 && (
        <Card className="mt-6 p-0">
          <div className="border-b border-slate-200 px-5 py-3 font-semibold dark:border-slate-800">Từ đến hạn</div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-4 dark:bg-slate-800">
            {words.map((w) => (
              <div key={w.id} className="flex items-center gap-3 bg-white px-4 py-3 dark:bg-slate-900">
                <WordImage word={w} size="sm" />
                <div className="min-w-0">
                  <div className="truncate font-medium">{w.word}</div>
                  <div className="truncate text-xs text-slate-500">{w.meaningVi}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="font-semibold">Cách hệ thống ôn tập hoạt động</h2>
        <div className="mt-3 grid grid-cols-5 gap-2 text-center text-sm">
          {BOX_INTERVALS_DAYS.slice(1).map((d, i) => (
            <div
              key={i}
              className={
                i + 1 >= 4
                  ? 'rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950/50'
                  : 'rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/50'
              }
            >
              <div className="font-semibold">Hộp {i + 1}</div>
              <div className="text-slate-500">ôn sau {d} ngày</div>
            </div>
          ))}
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>Học xong một từ (chế độ Chép / Bài học) → từ vào Hộp 1.</li>
          <li>Gõ đúng khi đến hạn, không dùng gợi ý → từ lên hộp tiếp theo, lần ôn sau xa hơn.</li>
          <li>Gõ sai → từ quay về Hộp 1. Từ ở Hộp 4 trở lên được tính là <b>đã thuộc</b>.</li>
        </ul>
      </Card>
    </div>
  )
}
