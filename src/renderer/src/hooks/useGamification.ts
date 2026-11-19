import { useEffect, useMemo, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { getMeta, setMeta } from '@/db/repo'
import { newlyUnlocked, type AchievementContext, type UnlockedMap } from '@/core/achievements'
import { goalStreak } from '@/core/goals'
import { summarize, topicProgress } from '@/core/stats'
import { levelInfo, longestCorrectRun, totalXp, type LevelInfo } from '@/core/xp'
import type { Highscores } from '@/core/game'
import { useSettings } from '@/store/settingsStore'
import { toast } from '@/components/Toast'
import { groupByTopic, useMeta, useNow } from './useData'

export interface Gamification {
  xp: number
  level: LevelInfo
  ctx: AchievementContext
  unlocked: UnlockedMap
  highscores: Highscores
}

/** XP, cấp độ và số liệu để xét huy hiệu — tính lại từ dữ liệu học. */
export function useGamification(): Gamification | undefined {
  const now = useNow()
  const dailyGoalWords = useSettings((s) => s.dailyGoalWords)
  const dailyGoalMinutes = useSettings((s) => s.dailyGoalMinutes)
  const unlocked = useMeta<UnlockedMap>('achievements', {})
  const highscores = useMeta<Highscores>('highscores', {})

  const data = useLiveQuery(async () => {
    const [attempts, sessions, progress, words] = await Promise.all([
      db.attempts.toArray(),
      db.sessions.toArray(),
      db.progress.toArray(),
      db.words.toArray()
    ])
    return { attempts, sessions, progress, words }
  }, [])

  return useMemo(() => {
    if (!data || !unlocked || !highscores) return undefined
    const { attempts, sessions, progress, words } = data
    const xp = totalXp(attempts)
    const level = levelInfo(xp)
    const summary = summarize(progress, sessions, words.length, now)
    const progressMap = new Map(progress.map((p) => [p.wordId, p]))
    let completedTopics = 0
    let completedExamTopics = 0
    for (const ws of groupByTopic(words).values()) {
      const tp = topicProgress(
        ws.map((w) => w.id),
        progressMap,
        now
      )
      if (tp.total > 0 && tp.mastered === tp.total) {
        completedTopics++
        if (ws[0].packId) completedExamTopics++
      }
    }
    const examLearned = words.filter((w) => w.packId && (progressMap.get(w.id)?.box ?? 0) > 0).length
    let choiceCorrect = 0
    let drillCorrect = 0
    for (const a of attempts) {
      if (!a.correct) continue
      if (a.mode === 'choice') choiceCorrect++
      else if (a.mode === 'family' || a.mode === 'synonym' || a.mode === 'collocation') drillCorrect++
    }
    const ctx: AchievementContext = {
      learned: summary.learned,
      mastered: summary.mastered,
      streak: summary.streak,
      bestStreak: summary.bestStreak,
      totalMinutes: summary.totalMinutes,
      totalSessions: summary.totalSessions,
      bestWpm: Math.max(0, ...sessions.filter((s) => s.wordsTotal >= 5).map((s) => s.wpm)),
      bestCorrectRun: longestCorrectRun(attempts),
      goalStreak: goalStreak(sessions, now, { dailyGoalWords, dailyGoalMinutes }),
      completedTopics,
      myWords: words.filter((w) => !w.isBuiltIn).length,
      level: level.level,
      bestGameScore: Math.max(0, ...Object.values(highscores).map((v) => v ?? 0)),
      examLearned,
      completedExamTopics,
      choiceCorrect,
      drillCorrect
    }
    return { xp, level, ctx, unlocked, highscores }
  }, [data, unlocked, highscores, now, dailyGoalWords, dailyGoalMinutes])
}

/**
 * Mở huy hiệu mới đạt và báo bằng toast. Lần chạy đầu (chưa có dữ liệu huy hiệu) chỉ ghi nhận
 * các huy hiệu đã đạt sẵn, không báo, để người dùng cũ không bị dồn hàng loạt thông báo.
 */
export function useAchievementWatcher(): void {
  const g = useGamification()
  const busy = useRef(false)
  useEffect(() => {
    if (!g || busy.current) return
    const fresh = newlyUnlocked(g.ctx, g.unlocked)
    if (fresh.length === 0) return
    busy.current = true
    void (async () => {
      try {
        const stored = await getMeta<UnlockedMap | null>('achievements', null)
        const now = Date.now()
        const next: UnlockedMap = { ...(stored ?? {}) }
        for (const a of fresh) next[a.id] = now
        await setMeta('achievements', next)
        if (stored !== null) for (const a of fresh) toast.success(`🏆 Huy hiệu mới: ${a.emoji} ${a.name}`)
      } finally {
        busy.current = false
      }
    })()
  }, [g])
}
