import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { topicProgress } from '@/core/stats'
import { groupByTopic, useNow, useProgressMap, useTopics, useWords } from '@/hooks/useData'
import { Badge, Button, Card, PageHeader, ProgressBar } from '@/components/ui'
import { TopicIcon } from '@/components/TopicIcon'

export default function Topics(): ReactNode {
  const topics = useTopics()
  const words = useWords()
  const progress = useProgressMap()
  const now = useNow()

  const byTopic = useMemo(() => groupByTopic(words ?? []), [words])
  // Chủ đề của tôi lên đầu — chủ đề tạo khi nhập & phân loại có thể trùng tên chủ đề có sẵn (VD "Động vật").
  // Chủ đề của gói luyện thi (rất nhiều) nằm ở trang "Luyện thi".
  const ordered = useMemo(
    () =>
      topics
        ? [...topics.filter((t) => !t.isBuiltIn), ...topics.filter((t) => t.isBuiltIn && !t.packId)]
        : [],
    [topics]
  )
  const packTopicCount = topics?.filter((t) => t.packId).length ?? 0

  if (!topics || !words || !progress) return null
  const myWords = words.filter((w) => !w.isBuiltIn).length

  return (
    <div>
      <PageHeader
        title="Chủ đề"
        subtitle={
          <>
            Chọn một chủ đề để học từ mới hoặc luyện tập theo nhiều chế độ.{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300" data-role="word-total">
              📚 Tổng {words.length.toLocaleString('vi-VN')} từ vựng trong {topics.length} chủ đề
              {myWords > 0 && ` · ${myWords.toLocaleString('vi-VN')} từ của tôi`}
            </span>
          </>
        }
        actions={
          <>
            <Link to="/packs">
              <Button>🎯 Luyện thi TOEIC / IELTS{packTopicCount > 0 && ` (${packTopicCount} chủ đề)`}</Button>
            </Link>
            <Link to="/manage">
              <Button>✍️ Tạo chủ đề riêng</Button>
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((t) => {
          const ws = byTopic.get(t.id) ?? []
          const tp = topicProgress(
            ws.map((w) => w.id),
            progress,
            now
          )
          const done = tp.total > 0 && tp.mastered === tp.total
          return (
            <Link key={t.id} to={`/topics/${t.id}`} className="group">
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-indigo-300 dark:group-hover:ring-indigo-700">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-3xl dark:bg-indigo-950">
                    <TopicIcon topic={t} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{t.name}</h3>
                      {!t.isBuiltIn && <Badge tone="indigo">Của tôi</Badge>}
                    </div>
                    <div className="text-sm text-slate-500">{t.nameEn}</div>
                  </div>
                  {done && <span className="emoji text-xl" title="Đã thuộc hết">🏅</span>}
                </div>
                <ProgressBar className="mt-4" total={tp.total} learned={tp.learned} mastered={tp.mastered} />
                <div className="mt-2 flex items-center justify-between text-sm text-slate-500">
                  <span>
                    {tp.learned}/{tp.total} từ đã học · {tp.mastered} đã thuộc
                  </span>
                  {tp.due > 0 && <Badge tone="amber">{tp.due} cần ôn</Badge>}
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
