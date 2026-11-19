import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { pickLessonWords } from '@/core/queue'
import { summarize, topicProgress } from '@/core/stats'
import { groupByTopic, useAttemptsSince, useMeta, useNow, useProgressMap, useSessions, useTopics, useWords } from '@/hooks/useData'
import { startOfWeek, weeklyReport } from '@/core/weekly'
import { addDays, dayKey } from '@/core/stats'
import { setMeta } from '@/db/repo'
import { GoalCard } from '@/components/GoalCard'
import { LevelBar } from '@/components/LevelBar'
import { useGamification } from '@/hooks/useGamification'
import { WeeklySummary, weekRange } from '@/components/WeeklySummary'
import { useSettings } from '@/store/settingsStore'
import { ActivityHeatmap } from '@/components/ActivityHeatmap'
import { TopicIcon } from '@/components/TopicIcon'
import { Button, Card, PageHeader, ProgressBar, StatTile } from '@/components/ui'
import { formatDuration } from '@/labels'
import { launchSession } from '@/launch'

function greeting(now: number): string {
  const h = new Date(now).getHours()
  if (h < 11) return 'Chào buổi sáng'
  if (h < 14) return 'Chào buổi trưa'
  if (h < 18) return 'Chào buổi chiều'
  return 'Chào buổi tối'
}

export default function Dashboard(): ReactNode {
  const topics = useTopics()
  const words = useWords()
  const progress = useProgressMap()
  const sessions = useSessions()
  const lessonSize = useSettings((s) => s.lessonSize)
  const navigate = useNavigate()
  const game = useGamification()
  const now = useNow()

  const byTopic = useMemo(() => groupByTopic(words ?? []), [words])
  const thisWeek = startOfWeek(now)
  const lastWeekAttempts = useAttemptsSince(addDays(thisWeek, -7))
  const weeklySeen = useMeta<string | null>('lastWeeklySeen', null)
  const wordMap = useMemo(() => new Map((words ?? []).map((w) => [w.id, w])), [words])
  const lastWeek = useMemo(
    () =>
      sessions && progress && lastWeekAttempts
        ? weeklyReport(sessions, lastWeekAttempts, [...progress.values()], now, -1)
        : null,
    [sessions, progress, lastWeekAttempts, now]
  )
  const summary = useMemo(
    () => (progress && sessions && words ? summarize([...progress.values()], sessions, words.length, now) : null),
    [progress, sessions, words, now]
  )

  if (!topics || !words || !progress || !sessions || !summary) return null

  const topicRows = topics.map((t) => {
    const ws = byTopic.get(t.id) ?? []
    return {
      topic: t,
      words: ws,
      tp: topicProgress(
        ws.map((w) => w.id),
        progress,
        now
      )
    }
  })
  // Gợi ý: chủ đề đang học dở (có từ đã học nhưng chưa hết), nếu không thì chủ đề đầu tiên còn từ mới
  const suggestion =
    topicRows.find((r) => r.tp.learned > 0 && r.tp.learned < r.tp.total) ?? topicRows.find((r) => r.tp.learned < r.tp.total)
  const activeTopics = topicRows.filter((r) => r.tp.learned > 0).sort((a, b) => b.tp.learned / b.tp.total - a.tp.learned / a.tp.total)
  const myWordCount = words.filter((w) => !w.isBuiltIn).length
  const completedTopics =topicRows.filter((r) => r.tp.total > 0 && r.tp.mastered === r.tp.total).length

  const startSuggestion = (): void => {
    if (!suggestion) return
    void launchSession(navigate, 'lesson', suggestion.topic.id, pickLessonWords(suggestion.words, progress, lessonSize))
  }

  return (
    <div>
      <PageHeader title={`${greeting(now)}! 👋`} subtitle="Mỗi ngày gõ một ít, từ vựng sẽ nhớ lâu hơn." />

      {lastWeek && lastWeek.week.sessions > 0 && weeklySeen !== undefined && weeklySeen !== dayKey(thisWeek) && (
        <Card className="mb-4 border-indigo-200 bg-indigo-50/60 dark:border-indigo-900 dark:bg-indigo-950/40">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="font-semibold">📊 Tổng kết tuần trước ({weekRange(lastWeek.week)})</h2>
            <Button size="sm" variant="ghost" onClick={() => void setMeta('lastWeeklySeen', dayKey(thisWeek))}>
              Đã xem ✕
            </Button>
          </div>
          <WeeklySummary report={lastWeek} words={wordMap} />
        </Card>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GoalCard sessions={sessions} now={now} />
        {game && <LevelBar xp={game.xp} level={game.level} compact />}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Từ đã học"
          value={summary.learned}
          icon="🌱"
          tone="indigo"
          hint={`trên tổng ${summary.totalWords} từ · hôm nay +${summary.todayNew}`}
        />
        <StatTile
          label="Đã thuộc"
          value={summary.mastered}
          icon="🏅"
          tone="emerald"
          hint={`${summary.learning} từ đang học`}
        />
        <StatTile
          label="Cần ôn hôm nay"
          value={summary.dueToday}
          icon="⏰"
          tone="amber"
          hint={summary.dueToday ? <Link to="/review" className="text-amber-600 hover:underline">Ôn ngay →</Link> : 'Không có từ đến hạn'}
        />
        <StatTile
          label="Chuỗi ngày học"
          value={`${summary.streak} 🔥`}
          icon="📅"
          hint={`Kỷ lục: ${summary.bestStreak} ngày`}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1">
          <StatTile
            label="Tổng số từ vựng"
            value={words.length.toLocaleString('vi-VN')}
            icon="📚"
            hint={`${myWordCount.toLocaleString('vi-VN')} của tôi · ${(words.length - myWordCount).toLocaleString('vi-VN')} có sẵn`}
          />
        </div>
        <StatTile label="Thời gian gõ" value={formatDuration(summary.totalMinutes * 60000)} hint={`${summary.totalSessions} phiên học`} />
        <StatTile label="Tốc độ TB" value={summary.avgWpm ?? '—'} hint="từ/phút (WPM)" />
        <StatTile label="Độ chính xác TB" value={summary.avgAccuracy !== null ? `${summary.avgAccuracy}%` : '—'} hint={`${summary.totalKeystrokes.toLocaleString('vi-VN')} phím đã gõ`} />
        <StatTile label="Chủ đề hoàn thành" value={`${completedTopics}/${topics.length}`} hint="thuộc toàn bộ từ" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-4 font-semibold">Hoạt động 16 tuần qua</h2>
          <div className="overflow-x-auto">
            <ActivityHeatmap sessions={sessions} now={now} />
          </div>
          <div className="mt-3 text-sm text-slate-500">Hôm nay: {summary.todayWords} lượt gõ</div>
        </Card>

        <Card className="flex flex-col lg:col-span-2">
          <h2 className="font-semibold">Học tiếp</h2>
          {suggestion ? (
            <>
              <div className="mt-4 flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-4xl dark:bg-indigo-950">
                  <TopicIcon topic={suggestion.topic} />
                </div>
                <div>
                  <div className="text-lg font-semibold">{suggestion.topic.name}</div>
                  <div className="text-sm text-slate-500">
                    {suggestion.tp.learned}/{suggestion.tp.total} từ đã học
                  </div>
                </div>
              </div>
              <ProgressBar className="mt-4" total={suggestion.tp.total} learned={suggestion.tp.learned} mastered={suggestion.tp.mastered} />
              <div className="mt-auto flex gap-2 pt-5">
                <Button variant="primary" onClick={startSuggestion}>
                  🎓 Học {Math.min(lessonSize, suggestion.tp.total - suggestion.tp.learned)} từ mới
                </Button>
                <Link to={`/topics/${suggestion.topic.id}`}>
                  <Button>Xem chủ đề</Button>
                </Link>
              </div>
            </>
          ) : (
            <div className="mt-4 text-slate-500">Bạn đã học hết tất cả các chủ đề. Hãy tạo chủ đề riêng hoặc ôn tập nhé!</div>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Tiến độ theo chủ đề</h2>
          <Link to="/topics" className="text-sm text-indigo-600 hover:underline">
            Tất cả chủ đề →
          </Link>
        </div>
        {activeTopics.length === 0 ? (
          <div className="py-6 text-center text-slate-500">Chưa có chủ đề nào được học. Bắt đầu với một bài học ở trên nhé!</div>
        ) : (
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {activeTopics.map(({ topic, tp }) => (
              <Link key={topic.id} to={`/topics/${topic.id}`} className="group block">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium group-hover:text-indigo-600">
                    {topic.emoji.trim() && <span className="emoji mr-2">{topic.emoji}</span>}
                    {topic.name}
                  </span>
                  <span className="text-slate-500 tabular-nums">
                    {tp.mastered} thuộc · {tp.learned}/{tp.total}
                  </span>
                </div>
                <ProgressBar className="mt-1.5" total={tp.total} learned={tp.learned} mastered={tp.mastered} />
              </Link>
            ))}
          </div>
        )}
        <div className="mt-4 flex gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> Đã thuộc
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Đang học
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200 dark:bg-slate-800" /> Chưa học
          </span>
        </div>
      </Card>
    </div>
  )
}
