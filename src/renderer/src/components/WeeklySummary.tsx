import type { ReactNode } from 'react'
import { formatDelta, type WeekStats, type WeeklyReport } from '@/core/weekly'
import { cx } from './ui'
import type { Word } from '@/types'

function fmtDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getDate()}/${d.getMonth() + 1}`
}

/** Khoảng ngày của tuần, ví dụ "16/11 – 22/11". */
export function weekRange(w: WeekStats): string {
  return `${fmtDate(w.start)} – ${fmtDate(w.end - 1)}`
}

function Metric({
  label,
  value,
  prev,
  suffix = ''
}: {
  label: string
  value: number | null
  prev: number | null
  suffix?: string
}): ReactNode {
  const delta = formatDelta(value, prev)
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-bold tabular-nums">
        {value === null ? '—' : `${value}${suffix}`}
        {delta && delta !== '0' && (
          <span className={cx('ml-1.5 text-xs font-medium', delta.startsWith('+') ? 'text-emerald-600' : 'text-rose-600')}>
            {delta}
          </span>
        )}
      </div>
    </div>
  )
}

/** Lưới số liệu một tuần, so với tuần trước, kèm từ khó. */
export function WeeklySummary({
  report,
  words
}: {
  report: WeeklyReport
  words: ReadonlyMap<string, Word>
}): ReactNode {
  const { week, previous, hardWords } = report
  return (
    <div>
      <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
        <Metric label="Từ mới" value={week.newWords} prev={previous.newWords} />
        <Metric label="Thuộc thêm" value={week.mastered} prev={previous.mastered} />
        <Metric label="Phút gõ" value={week.minutes} prev={previous.minutes} />
        <Metric label="Ngày học" value={week.activeDays} prev={previous.activeDays} suffix="/7" />
        <Metric label="WPM" value={week.wpm} prev={previous.wpm} />
        <Metric label="Chính xác" value={week.accuracy} prev={previous.accuracy} suffix="%" />
      </div>
      {hardWords.length > 0 && (
        <div className="mt-4 text-sm">
          <span className="text-slate-500">Từ hay sai: </span>
          {hardWords.map((h, i) => (
            <span key={h.wordId}>
              {i > 0 && ', '}
              <span className="font-medium">{words.get(h.wordId)?.word ?? '?'}</span>
              <span className="text-slate-400"> ×{h.wrong}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
