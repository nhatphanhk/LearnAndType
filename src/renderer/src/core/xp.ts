import type { Attempt } from '@/types'

/** XP của một lượt gõ: Chép +2, Nhớ/Nghe/Điền +10; dùng gợi ý chỉ được một nửa; sai = 0. */
export function attemptXp(a: Pick<Attempt, 'correct' | 'hinted' | 'mode'>): number {
  if (!a.correct) return 0
  const base = a.mode === 'copy' ? 2 : 10
  return a.hinted ? Math.floor(base / 2) : base
}

export function totalXp(attempts: Iterable<Pick<Attempt, 'correct' | 'hinted' | 'mode'>>): number {
  let xp = 0
  for (const a of attempts) xp += attemptXp(a)
  return xp
}

/** XP cần để đạt cấp `level` (cấp 1 = 0 XP). */
export function xpForLevel(level: number): number {
  return 50 * Math.max(0, level - 1) ** 2
}

export interface LevelInfo {
  level: number
  /** XP đã có trong cấp hiện tại. */
  current: number
  /** XP của cả cấp hiện tại (từ đầu cấp tới cấp sau). */
  needed: number
}

export function levelInfo(xp: number): LevelInfo {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1
  const start = xpForLevel(level)
  return { level, current: xp - start, needed: xpForLevel(level + 1) - start }
}

/** Danh hiệu theo cấp. */
export function levelTitle(level: number): string {
  if (level >= 30) return 'Bậc thầy từ vựng'
  if (level >= 20) return 'Chuyên gia'
  if (level >= 12) return 'Cao thủ'
  if (level >= 7) return 'Thành thạo'
  if (level >= 3) return 'Người học chăm chỉ'
  return 'Người mới'
}

/** Chuỗi dài nhất các lượt kiểm tra (không phải Chép) đúng liên tiếp, không dùng gợi ý. */
export function longestCorrectRun(attempts: readonly Pick<Attempt, 'correct' | 'hinted' | 'mode' | 'at'>[]): number {
  const sorted = attempts.filter((a) => a.mode !== 'copy').sort((x, y) => x.at - y.at)
  let best = 0
  let run = 0
  for (const a of sorted) {
    run = a.correct && !a.hinted ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}
