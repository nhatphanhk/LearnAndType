import { useMemo, type ReactNode } from 'react'
import { heatmap } from '@/core/stats'
import { cx } from './ui'
import type { Session } from '@/types'

const LEVEL_CLS = [
  'bg-slate-100 dark:bg-slate-800',
  'bg-indigo-200 dark:bg-indigo-900',
  'bg-indigo-300 dark:bg-indigo-700',
  'bg-indigo-500 dark:bg-indigo-500',
  'bg-indigo-700 dark:bg-indigo-300'
]

const DAY_LABELS = ['T2', '', 'T4', '', 'T6', '', 'CN']

function formatDate(key: string): string {
  const [y, m, d] = key.split('-')
  return `${d}/${m}/${y}`
}

export function ActivityHeatmap({ sessions, weeks = 16, now }: { sessions: Session[]; weeks?: number; now: number }): ReactNode {
  const grid = useMemo(() => heatmap(sessions, weeks, now), [sessions, weeks, now])
  return (
    <div>
      <div className="flex gap-1">
        <div className="mr-1 flex flex-col gap-1 text-[10px] text-slate-400">
          {DAY_LABELS.map((l, i) => (
            <div key={i} className="flex h-3.5 items-center">
              {l}
            </div>
          ))}
        </div>
        {grid.map((col, i) => (
          <div key={i} className="flex flex-col gap-1">
            {col.map((cell) => (
              <div
                key={cell.date}
                title={cell.future ? '' : `${formatDate(cell.date)}: ${cell.count} lượt gõ`}
                className={cx('h-3.5 w-3.5 rounded-[3px]', cell.future ? 'opacity-0' : LEVEL_CLS[cell.level])}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-slate-500">
        <span className="mr-1">Ít</span>
        {LEVEL_CLS.map((c, i) => (
          <span key={i} className={cx('h-3 w-3 rounded-[3px]', c)} />
        ))}
        <span className="ml-1">Nhiều</span>
      </div>
    </div>
  )
}
