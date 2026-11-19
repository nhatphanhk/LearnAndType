import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { levelTitle, type LevelInfo } from '@/core/xp'
import { Card } from './ui'

/** Thẻ cấp độ + thanh XP. `compact` dùng trên trang Tổng quan (có link sang trang Thành tích). */
export function LevelBar({ xp, level, compact = false }: { xp: number; level: LevelInfo; compact?: boolean }): ReactNode {
  const pct = level.needed > 0 ? Math.min(100, (level.current / level.needed) * 100) : 0
  return (
    <Card className={compact ? 'p-4' : undefined}>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-lg font-bold text-white shadow">
          {level.level}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold">
              Cấp {level.level} · {levelTitle(level.level)}
            </span>
            {compact ? (
              <Link to="/achievements" className="text-xs text-indigo-600 hover:underline">
                Thành tích →
              </Link>
            ) : (
              <span className="text-sm text-slate-500 tabular-nums">{xp.toLocaleString('vi-VN')} XP</span>
            )}
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-500 tabular-nums">
            {level.current}/{level.needed} XP tới cấp {level.level + 1}
          </div>
        </div>
      </div>
    </Card>
  )
}
