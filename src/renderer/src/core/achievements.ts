export interface AchievementContext {
  learned: number
  mastered: number
  streak: number
  bestStreak: number
  totalMinutes: number
  totalSessions: number
  /** WPM cao nhất trong một phiên (phiên có ít nhất 5 từ). */
  bestWpm: number
  /** Số lượt kiểm tra đúng liên tiếp dài nhất. */
  bestCorrectRun: number
  /** Số ngày liên tiếp đạt mục tiêu. */
  goalStreak: number
  /** Số chủ đề đã thuộc hết. */
  completedTopics: number
  /** Số từ tự thêm. */
  myWords: number
  level: number
  /** Điểm cao nhất các mini-game. */
  bestGameScore: number
}

export interface Achievement {
  id: string
  name: string
  emoji: string
  desc: string
  check: (c: AchievementContext) => boolean
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-session', name: 'Khởi đầu', emoji: '🌱', desc: 'Hoàn thành phiên học đầu tiên.', check: (c) => c.totalSessions >= 1 },
  { id: 'learned-50', name: '50 từ đầu tiên', emoji: '📗', desc: 'Học 50 từ.', check: (c) => c.learned >= 50 },
  { id: 'learned-200', name: 'Kho từ vựng', emoji: '📚', desc: 'Học 200 từ.', check: (c) => c.learned >= 200 },
  { id: 'mastered-100', name: 'Trăm từ thuộc lòng', emoji: '🏅', desc: 'Thuộc 100 từ.', check: (c) => c.mastered >= 100 },
  { id: 'mastered-500', name: 'Từ điển sống', emoji: '🏆', desc: 'Thuộc 500 từ.', check: (c) => c.mastered >= 500 },
  { id: 'streak-7', name: 'Một tuần bền bỉ', emoji: '🔥', desc: 'Học 7 ngày liên tiếp.', check: (c) => c.bestStreak >= 7 },
  { id: 'streak-30', name: 'Thói quen vàng', emoji: '🌟', desc: 'Học 30 ngày liên tiếp.', check: (c) => c.bestStreak >= 30 },
  { id: 'goal-7', name: 'Giữ lời hứa', emoji: '🎯', desc: 'Đạt mục tiêu ngày 7 ngày liên tiếp.', check: (c) => c.goalStreak >= 7 },
  { id: 'wpm-40', name: 'Ngón tay nhanh', emoji: '⚡', desc: 'Đạt 40 WPM trong một phiên.', check: (c) => c.bestWpm >= 40 },
  { id: 'run-50', name: 'Không tì vết', emoji: '💎', desc: '50 lượt đúng liên tiếp, không gợi ý.', check: (c) => c.bestCorrectRun >= 50 },
  { id: 'topic-done', name: 'Trọn vẹn', emoji: '✅', desc: 'Thuộc hết một chủ đề.', check: (c) => c.completedTopics >= 1 },
  { id: 'hours-10', name: '10 giờ gõ phím', emoji: '⏱️', desc: 'Tổng thời gian gõ đạt 10 giờ.', check: (c) => c.totalMinutes >= 600 },
  { id: 'my-words-50', name: 'Nhà sưu tầm', emoji: '✍️', desc: 'Tự thêm 50 từ.', check: (c) => c.myWords >= 50 },
  { id: 'level-10', name: 'Cấp 10', emoji: '🚀', desc: 'Đạt cấp độ 10.', check: (c) => c.level >= 10 },
  { id: 'game-300', name: 'Game thủ', emoji: '🎮', desc: 'Đạt 300 điểm trong một mini-game.', check: (c) => c.bestGameScore >= 300 }
]

/** Huy hiệu đã mở: id → thời điểm mở. */
export type UnlockedMap = Record<string, number>

/** Các huy hiệu vừa đạt (chưa có trong `unlocked`). */
export function newlyUnlocked(ctx: AchievementContext, unlocked: UnlockedMap): Achievement[] {
  return ACHIEVEMENTS.filter((a) => unlocked[a.id] === undefined && a.check(ctx))
}
