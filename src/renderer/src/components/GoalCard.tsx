import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { goalProgress, goalStreak } from '@/core/goals'
import { useSettings } from '@/store/settingsStore'
import { Card } from './ui'
import type { Session } from '@/types'

function Ring({ percent }: { percent: number }): ReactNode {
  const r = 34
  const c = 2 * Math.PI * r
  const done = percent >= 100
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90" aria-hidden>
      <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-slate-200 dark:stroke-slate-800" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        className={done ? 'stroke-emerald-500' : 'stroke-indigo-500'}
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
    </svg>
  )
}

/** Thẻ "Mục tiêu hôm nay" trên trang Tổng quan. */
export function GoalCard({ sessions, now }: { sessions: readonly Session[]; now: number }): ReactNode {
  const dailyGoalWords = useSettings((s) => s.dailyGoalWords)
  const dailyGoalMinutes = useSettings((s) => s.dailyGoalMinutes)
  const goal = { dailyGoalWords, dailyGoalMinutes }
  const g = goalProgress(sessions, now, goal)
  const streak = goalStreak(sessions, now, goal)

  if (!g.enabled) {
    return (
      <Card className="flex items-center justify-between gap-4 p-4">
        <div className="text-sm text-slate-500">
          <span className="emoji mr-2">🎯</span>Chưa đặt mục tiêu hằng ngày.
        </div>
        <Link to="/settings" className="text-sm text-indigo-600 hover:underline">
          Đặt mục tiêu →
        </Link>
      </Card>
    )
  }

  const parts: string[] = []
  if (dailyGoalWords > 0) parts.push(`${g.words}/${dailyGoalWords} lượt gõ`)
  if (dailyGoalMinutes > 0) parts.push(`${g.minutes}/${dailyGoalMinutes} phút`)

  return (
    <Card className="flex items-center gap-5 p-4">
      <div className="relative">
        <Ring percent={g.percent} />
        <div className="absolute inset-0 flex items-center justify-center text-lg font-bold tabular-nums">{g.percent}%</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">🎯 Mục tiêu hôm nay</h2>
          <Link to="/settings" className="text-xs text-slate-500 hover:text-indigo-600">
            Sửa
          </Link>
        </div>
        <div className="mt-1 text-sm text-slate-600 tabular-nums dark:text-slate-300">{parts.join(' · ')}</div>
        <div className="mt-1 text-xs text-slate-500">
          {g.met
            ? '✅ Đã hoàn thành, tuyệt vời!'
            : g.percent === 0
              ? 'Hôm nay chưa gõ từ nào.'
              : g.percent >= 70
                ? 'Sắp xong rồi, cố lên!'
                : 'Khởi đầu tốt, tiếp tục nhé!'}
          {streak > 0 && ` · Đạt mục tiêu ${streak} ngày liên tiếp`}
        </div>
      </div>
    </Card>
  )
}
