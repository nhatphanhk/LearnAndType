import { useMemo, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/db/schema'
import { dailySeries } from '@/core/stats'
import { MASTERED_BOX } from '@/core/srs'
import { useAttemptsSince, useNow, useProgressMap, useSessions, useTopics } from '@/hooks/useData'
import { addDays } from '@/core/stats'
import { startOfWeek, weeklyReport } from '@/core/weekly'
import { WeeklySummary, weekRange } from '@/components/WeeklySummary'
import { useChartColors } from '@/hooks/useIsDark'
import { Badge, Card, EmptyState, PageHeader, cx } from '@/components/ui'
import { WordImage } from '@/components/WordImage'
import { KIND_INFO, formatDateTime, formatDuration, topicLabel } from '@/labels'
import type { Word } from '@/types'

const RANGES = [14, 30, 90] as const

interface TipProps {
  active?: boolean
  payload?: ReadonlyArray<{ value?: unknown; payload?: Record<string, unknown> }>
  label?: unknown
}

function ChartTooltip({ active, payload, label, format }: TipProps & { format: (v: number) => string }): ReactNode {
  if (!active || !payload?.length) return null
  const v = payload[0].value
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
      <div className="text-xs text-slate-500 dark:text-slate-400">{String(label ?? payload[0].payload?.label ?? '')}</div>
      <div className="font-semibold text-slate-900 dark:text-white">{typeof v === 'number' ? format(v) : 'Chưa có dữ liệu'}</div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }): ReactNode {
  return (
    <Card>
      <div className="mb-3">
        <h2 className="font-semibold">{title}</h2>
        {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
      </div>
      <div className="h-56">{children}</div>
    </Card>
  )
}

export default function Stats(): ReactNode {
  const sessions = useSessions()
  const progress = useProgressMap()
  const topics = useTopics()
  const now = useNow()
  const c = useChartColors()
  const [range, setRange] = useState<(typeof RANGES)[number]>(30)

  const weekAttempts = useAttemptsSince(addDays(startOfWeek(now), -7))
  const week = useMemo(
    () => (sessions && progress && weekAttempts ? weeklyReport(sessions, weekAttempts, [...progress.values()], now) : null),
    [sessions, progress, weekAttempts, now]
  )

  const words = useLiveQuery(async () => new Map((await db.words.toArray()).map((w) => [w.id, w])), [])

  const series = useMemo(
    () => (sessions && progress ? dailySeries(sessions, [...progress.values()], range, now) : []),
    [sessions, progress, range, now]
  )

  const boxes = useMemo(() => {
    const counts = [1, 2, 3, 4, 5].map((box) => ({ box, label: `Hộp ${box}`, count: 0 }))
    for (const p of progress?.values() ?? []) if (p.box > 0) counts[p.box - 1].count++
    return counts
  }, [progress])

  const hardWords = useMemo(() => {
    if (!progress || !words) return []
    return [...progress.values()]
      .filter((p) => p.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || b.wrong / (b.correct + b.wrong) - a.wrong / (a.correct + a.wrong))
      .slice(0, 12)
      .flatMap((p) => {
        const w = words.get(p.wordId)
        return w ? [{ word: w as Word, p }] : []
      })
  }, [progress, words])

  const topicName = useMemo(() => new Map((topics ?? []).map((t) => [t.id, topicLabel(t)])), [topics])

  if (!sessions || !progress || !words) return null

  const recent = [...sessions].reverse().slice(0, 30)
  const axisProps = {
    tick: { fill: c.axis, fontSize: 11 },
    tickLine: false,
    axisLine: false
  } as const
  const xInterval = range <= 14 ? 0 : range <= 30 ? 2 : 9

  return (
    <div>
      <PageHeader
        title="Thống kê"
        subtitle="Theo dõi bạn đã học được bao nhiêu và tiến bộ thế nào."
        actions={
          <div className="flex rounded-lg bg-white p-1 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={cx(
                  'cursor-pointer rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  range === r ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                )}
              >
                {r} ngày
              </button>
            ))}
          </div>
        }
      />

      {sessions.length === 0 ? (
        <Card>
          <EmptyState icon="📈" title="Chưa có dữ liệu">
            Hoàn thành phiên học đầu tiên để xem biểu đồ tiến độ.
          </EmptyState>
        </Card>
      ) : (
        <>
          {week && (
            <Card className="mb-6">
              <h2 className="mb-3 font-semibold">
                Tuần này <span className="text-sm font-normal text-slate-500">({weekRange(week.week)} · so với tuần trước)</span>
              </h2>
              <WeeklySummary report={week} words={words} />
            </Card>
          )}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Từ mới đã học mỗi ngày" subtitle={`${series.reduce((a, d) => a + d.newWords, 0)} từ trong ${range} ngày`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axisProps} interval={xInterval} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip cursor={{ fill: c.cursor }} content={(p: TipProps) => <ChartTooltip {...p} format={(v) => `${v} từ mới`} />} />
                  <Bar dataKey="newWords" fill={c.series} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Lượt gõ mỗi ngày" subtitle="Số từ đã gõ trong tất cả các phiên">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axisProps} interval={xInterval} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip cursor={{ fill: c.cursor }} content={(p: TipProps) => <ChartTooltip {...p} format={(v) => `${v} lượt gõ`} />} />
                  <Bar dataKey="wordsPracticed" fill={c.series} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Độ chính xác (%)" subtitle="Tỉ lệ phím gõ đúng theo ngày">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axisProps} interval={xInterval} />
                  <YAxis domain={[0, 100]} {...axisProps} />
                  <Tooltip cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} content={(p: TipProps) => <ChartTooltip {...p} format={(v) => `${v}% chính xác`} />} />
                  <Line type="monotone" dataKey="accuracy" stroke={c.series} strokeWidth={2} dot={{ r: 3, fill: c.series, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tốc độ gõ (WPM)" subtitle="Số từ (5 ký tự) mỗi phút">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -20 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} />
                  <XAxis dataKey="label" {...axisProps} interval={xInterval} />
                  <YAxis allowDecimals={false} {...axisProps} />
                  <Tooltip cursor={{ stroke: c.axis, strokeDasharray: '3 3' }} content={(p: TipProps) => <ChartTooltip {...p} format={(v) => `${v} WPM`} />} />
                  <Line type="monotone" dataKey="wpm" stroke={c.series} strokeWidth={2} dot={{ r: 3, fill: c.series, strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">Phân bố từ theo hộp ôn tập</h2>
                  <div className="text-xs text-slate-500">Hộp càng cao, từ càng nhớ chắc</div>
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.learning }} /> Đang học
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.mastered }} /> Đã thuộc
                  </span>
                </div>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={boxes} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid vertical={false} stroke={c.grid} />
                    <XAxis dataKey="label" {...axisProps} />
                    <YAxis allowDecimals={false} {...axisProps} />
                    <Tooltip cursor={{ fill: c.cursor }} content={(p: TipProps) => <ChartTooltip {...p} format={(v) => `${v} từ`} />} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                      {boxes.map((b) => (
                        <Cell key={b.box} fill={b.box >= MASTERED_BOX ? c.mastered : c.learning} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-0">
              <div className="border-b border-slate-200 px-5 py-3 dark:border-slate-800">
                <h2 className="font-semibold">Từ khó nhất</h2>
                <div className="text-xs text-slate-500">Những từ bạn gõ sai nhiều nhất</div>
              </div>
              {hardWords.length === 0 ? (
                <div className="px-5 py-10 text-center text-slate-500">Chưa có từ nào bị gõ sai 👏</div>
              ) : (
                <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                  {hardWords.map(({ word, p }) => (
                    <li key={word.id} className="flex items-center gap-3 px-5 py-2">
                      <WordImage word={word} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{word.word}</div>
                        <div className="truncate text-xs text-slate-500">{word.meaningVi}</div>
                      </div>
                      <Badge tone="rose">sai {p.wrong}</Badge>
                      <Badge tone="emerald">đúng {p.correct}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card className="mt-6 p-0">
            <div className="border-b border-slate-200 px-5 py-3 font-semibold dark:border-slate-800">Lịch sử phiên học</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="px-5 py-2 font-medium">Thời gian</th>
                    <th className="px-3 py-2 font-medium">Chế độ</th>
                    <th className="px-3 py-2 font-medium">Chủ đề</th>
                    <th className="px-3 py-2 text-right font-medium">Đúng</th>
                    <th className="px-3 py-2 text-right font-medium">Từ mới</th>
                    <th className="px-3 py-2 text-right font-medium">WPM</th>
                    <th className="px-3 py-2 text-right font-medium">Chính xác</th>
                    <th className="px-5 py-2 text-right font-medium">Thời lượng</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recent.map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-2 whitespace-nowrap text-slate-500">{formatDateTime(s.startedAt)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="emoji mr-1">{KIND_INFO[s.kind].icon}</span>
                        {KIND_INFO[s.kind].title}
                        {s.textOnly && (
                          <span className="ml-1.5">
                            <Badge>Chỉ chữ</Badge>
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{s.topicId ? (topicName.get(s.topicId) ?? '—') : 'Nhiều chủ đề'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.wordsCorrect}/{s.wordsTotal}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.newWordsLearned}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.wpm}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.accuracy}%</td>
                      <td className="px-5 py-2 text-right whitespace-nowrap tabular-nums">{formatDuration(s.activeMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
