import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ACHIEVEMENTS } from '@/core/achievements'
import { GAME_INFO, type GameId } from '@/core/game'
import { useGamification } from '@/hooks/useGamification'
import { LevelBar } from '@/components/LevelBar'
import { Card, PageHeader, cx } from '@/components/ui'
import { formatDateTime } from '@/labels'

export default function Achievements(): ReactNode {
  const g = useGamification()
  if (!g) return null
  const unlockedCount = ACHIEVEMENTS.filter((a) => g.unlocked[a.id] !== undefined).length

  return (
    <div>
      <PageHeader title="🏆 Thành tích" subtitle="Cấp độ, huy hiệu và kỷ lục của bạn." />

      <LevelBar xp={g.xp} level={g.level} />

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Huy hiệu</h2>
          <span className="text-sm text-slate-500">
            {unlockedCount}/{ACHIEVEMENTS.length} đã mở
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {ACHIEVEMENTS.map((a) => {
            const at = g.unlocked[a.id]
            const done = at !== undefined
            return (
              <div
                key={a.id}
                title={done ? `Mở lúc ${formatDateTime(at)}` : 'Chưa mở'}
                className={cx(
                  'rounded-xl p-3 text-center ring-1',
                  done
                    ? 'bg-amber-50 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-900'
                    : 'opacity-50 ring-slate-200 grayscale dark:ring-slate-800'
                )}
              >
                <div className="emoji text-3xl">{a.emoji}</div>
                <div className="mt-1 text-sm font-semibold">{a.name}</div>
                <div className="mt-0.5 text-xs text-slate-500">{a.desc}</div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Kỷ lục mini-game</h2>
          <Link to="/games" className="text-sm text-indigo-600 hover:underline">
            Chơi ngay →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {(Object.keys(GAME_INFO) as GameId[]).map((id) => (
            <div key={id} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
              <div className="text-sm text-slate-500">
                {GAME_INFO[id].icon} {GAME_INFO[id].title}
              </div>
              <div className="text-2xl font-bold tabular-nums">{g.highscores[id] ?? 0}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
