import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/db/schema'
import { getMeta, setMeta } from '@/db/repo'
import { goalProgress, shouldRemind } from '@/core/goals'
import { dayKey } from '@/core/stats'
import { useSettings } from '@/store/settingsStore'

const CHECK_MS = 60_000

/** Kiểm tra mỗi phút; tới giờ nhắc mà chưa đạt mục tiêu thì gửi thông báo Windows (mỗi ngày một lần). */
export function useReminder(): void {
  const enabled = useSettings((s) => s.reminderEnabled)
  const time = useSettings((s) => s.reminderTime)
  const dailyGoalWords = useSettings((s) => s.dailyGoalWords)
  const dailyGoalMinutes = useSettings((s) => s.dailyGoalMinutes)

  useEffect(() => {
    if (!enabled || typeof Notification === 'undefined') return
    let cancelled = false
    const check = async (): Promise<void> => {
      const now = Date.now()
      const sessions = await db.sessions.where('startedAt').aboveOrEqual(now - 2 * 86_400_000).toArray()
      const goal = goalProgress(sessions, now, { dailyGoalWords, dailyGoalMinutes })
      const last = await getMeta<string | null>('lastRemindedDay', null)
      if (cancelled || !shouldRemind(now, time, last, goal.met)) return
      await setMeta('lastRemindedDay', dayKey(now))
      const due = await db.progress
        .where('nextReviewAt')
        .belowOrEqual(now)
        .filter((p) => p.box > 0)
        .count()
      const left = goal.enabled && dailyGoalWords > 0 ? Math.max(0, dailyGoalWords - goal.words) : 0
      const parts = [
        left > 0 ? `Còn ${left} lượt gõ để đạt mục tiêu hôm nay.` : 'Hôm nay bạn chưa đạt mục tiêu.',
        due > 0 ? `${due} từ đang chờ ôn.` : ''
      ]
      const n = new Notification('LearnAndType: tới giờ học rồi! ⌨️', { body: parts.filter(Boolean).join(' ') })
      n.onclick = () => void window.api?.focus(due > 0 ? '/review' : '/')
    }
    void check()
    const t = setInterval(() => void check(), CHECK_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [enabled, time, dailyGoalWords, dailyGoalMinutes])
}

/** Đồng bộ cài đặt khay / khởi động cùng Windows sang main process và nhận lệnh chuyển trang. */
export function useDesktopBridge(): void {
  const navigate = useNavigate()
  const closeToTray = useSettings((s) => s.closeToTray)
  const launchAtLogin = useSettings((s) => s.launchAtLogin)

  useEffect(() => {
    void window.api?.setCloseToTray(closeToTray)
  }, [closeToTray])

  useEffect(() => {
    void window.api?.setLaunchAtLogin(launchAtLogin)
  }, [launchAtLogin])

  useEffect(() => window.api?.onNavigate((route) => navigate(route)), [navigate])

  const quickEnabled = useSettings((s) => s.quickLookupEnabled)
  const quickShortcut = useSettings((s) => s.quickLookupShortcut)
  useEffect(() => {
    void window.api?.setQuickShortcut(quickEnabled ? quickShortcut : '')
  }, [quickEnabled, quickShortcut])
}
