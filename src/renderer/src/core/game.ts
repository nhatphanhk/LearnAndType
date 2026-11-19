import { isMatch } from './typing'

export type GameId = 'falling' | 'sprint'

export const GAME_INFO: Record<GameId, { title: string; icon: string; desc: string }> = {
  falling: {
    title: 'Từ rơi',
    icon: '🌧️',
    desc: 'Nghĩa tiếng Việt rơi xuống, gõ đúng từ tiếng Anh để phá trước khi chạm đáy. Có 3 mạng, càng lâu càng nhanh.'
  },
  sprint: {
    title: 'Đua 60 giây',
    icon: '⏱️',
    desc: 'Gõ được càng nhiều từ càng tốt trong 60 giây. Đúng liên tiếp để nhân combo.'
  }
}

export const FALLING_LIVES = 3
export const SPRINT_MS = 60_000

/** Điểm cho một từ đúng: 10 + thưởng combo (tối đa +20), từ dài được thêm điểm. */
export function wordPoints(combo: number, wordLength: number): number {
  return 10 + Math.min(combo, 10) * 2 + Math.max(0, wordLength - 5)
}

/** Từ rơi: tốc độ rơi (phần chiều cao sân mỗi giây) tăng dần theo thời gian chơi. */
export function fallSpeed(elapsedMs: number): number {
  return Math.min(0.2, 0.06 + (elapsedMs / 1000) * 0.0015)
}

/** Từ rơi: khoảng cách giữa 2 lần thả từ mới (ms) giảm dần, tối thiểu 1,1 giây. */
export function spawnInterval(elapsedMs: number): number {
  return Math.max(1100, 3200 - (elapsedMs / 1000) * 25)
}

export interface FallingItem {
  key: number
  wordId: string
  answer: string
  /** 0 = đỉnh sân, 1 = chạm đáy. */
  y: number
  /** Vị trí ngang 0–1. */
  x: number
  spawnedAt: number
}

/** Từ đang rơi khớp với chữ đã gõ (ưu tiên từ thấp nhất). -1 nếu không khớp. */
export function matchFalling(items: readonly FallingItem[], typed: string, caseSensitive = false): number {
  let best = -1
  items.forEach((it, i) => {
    if (isMatch(it.answer, typed, caseSensitive) && (best < 0 || it.y > items[best].y)) best = i
  })
  return best
}

/** Dịch các từ xuống theo thời gian `dtMs`; trả về các từ còn trên sân và các từ đã chạm đáy. */
export function stepFalling(
  items: readonly FallingItem[],
  dtMs: number,
  elapsedMs: number
): { alive: FallingItem[]; missed: FallingItem[] } {
  const dy = (fallSpeed(elapsedMs) * dtMs) / 1000
  const alive: FallingItem[] = []
  const missed: FallingItem[] = []
  for (const it of items) {
    const next = { ...it, y: it.y + dy }
    if (next.y >= 1) missed.push(next)
    else alive.push(next)
  }
  return { alive, missed }
}

/** Chọn vị trí ngang cho từ mới, tránh chồng lên các từ đang ở gần đỉnh. */
export function pickLane(items: readonly FallingItem[], rng: () => number = Math.random): number {
  const lanes = [0.1, 0.3, 0.5, 0.7, 0.9]
  const busy = new Set(items.filter((i) => i.y < 0.3).map((i) => i.x))
  const free = lanes.filter((l) => !busy.has(l))
  const pool = free.length > 0 ? free : lanes
  return pool[Math.floor(rng() * pool.length)]
}

/** Điểm cao: id game → điểm. */
export type Highscores = Partial<Record<GameId, number>>
