import { useEffect, useState, type ReactNode } from 'react'
import { HashRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db/schema'
import { ensureSeed } from './db/repo'
import { useSettings } from './store/settingsStore'
import { useNow } from './hooks/useData'
import { Toaster } from './components/Toast'
import { useDesktopBridge, useReminder } from './hooks/useReminder'
import { cx } from './components/ui'
import Dashboard from './pages/Dashboard'
import Topics from './pages/Topics'
import TopicDetail from './pages/TopicDetail'
import TextTyping from './pages/TextTyping'
import Practice from './pages/Practice'
import Review from './pages/Review'
import Stats from './pages/Stats'
import Manage from './pages/Manage'
import SettingsPage from './pages/Settings'
import QuickLookup from './pages/QuickLookup'
import Games from './pages/Games'
import Achievements from './pages/Achievements'
import { useAchievementWatcher } from './hooks/useGamification'

function useThemeClass(): void {
  const theme = useSettings((s) => s.theme)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

const NAV = [
  { to: '/', label: 'Tổng quan', icon: '🏠' },
  { to: '/topics', label: 'Chủ đề', icon: '📚' },
  { to: '/typing', label: 'Gõ chữ', icon: '🔤' },
  { to: '/review', label: 'Ôn tập', icon: '🔁' },
  { to: '/games', label: 'Trò chơi', icon: '🎮' },
  { to: '/stats', label: 'Thống kê', icon: '📈' },
  { to: '/achievements', label: 'Thành tích', icon: '🏆' },
  { to: '/manage', label: 'Từ vựng của tôi', icon: '✍️' },
  { to: '/settings', label: 'Cài đặt', icon: '⚙️' }
]

function Sidebar(): ReactNode {
  const now = useNow()
  const due = useLiveQuery(
    () =>
      db.progress
        .where('nextReviewAt')
        .belowOrEqual(now)
        .filter((p) => p.box > 0)
        .count(),
    [now]
  )
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-8 flex items-center gap-2 px-3">
        <span className="emoji text-2xl">⌨️</span>
        <div>
          <div className="text-lg leading-tight font-bold">LearnAndType</div>
          <div className="text-xs text-slate-500">Gõ để nhớ từ vựng</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === '/'}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              )
            }
          >
            <span className="emoji text-base">{n.icon}</span>
            <span className="flex-1">{n.label}</span>
            {n.to === '/review' && !!due && (
              <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white">{due}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto px-3 text-xs text-slate-400">Gõ đúng · Nhớ lâu</div>
    </aside>
  )
}

const IS_QUICK_WINDOW = window.location.hash.startsWith('#/quick')

/** Nhắc học + cầu nối với main process (cần nằm trong Router để chuyển trang). */
function DesktopBridge(): null {
  useReminder()
  useDesktopBridge()
  useAchievementWatcher()
  return null
}

function Shell(): ReactNode {
  const location = useLocation()
  const fullscreen = location.pathname === '/practice'
  return (
    <div className="flex h-full">
      {!fullscreen && <Sidebar />}
      <main className={cx('min-w-0 flex-1 overflow-y-auto', !fullscreen && 'px-8 py-7')}>
        <div className={cx(!fullscreen && 'mx-auto max-w-6xl', fullscreen && 'h-full')}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/topics" element={<Topics />} />
            <Route path="/topics/:id" element={<TopicDetail />} />
            <Route path="/typing" element={<TextTyping />} />
            <Route path="/practice" element={<Practice />} />
            <Route path="/review" element={<Review />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/games" element={<Games />} />
            <Route path="/achievements" element={<Achievements />} />
            <Route path="/manage" element={<Manage />} />
            <Route path="/manage/:id" element={<Manage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

export default function App(): ReactNode {
  useThemeClass()
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading')

  useEffect(() => {
    ensureSeed()
      .then(() => setState('ready'))
      .catch((e: unknown) => setState({ error: e instanceof Error ? e.message : String(e) }))
  }, [])

  if (state === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <span className="emoji mr-3 text-3xl">⌨️</span> Đang tải dữ liệu…
      </div>
    )
  }
  if (typeof state === 'object') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <div className="emoji text-5xl">⚠️</div>
        <div className="font-semibold">Không mở được cơ sở dữ liệu</div>
        <div className="max-w-lg text-sm text-slate-500">{state.error}</div>
      </div>
    )
  }
  // Popup tra nhanh: cửa sổ riêng, không có thanh bên và không chạy nhắc học / cầu nối
  if (IS_QUICK_WINDOW) return <QuickLookup />
  return (
    <HashRouter>
      <DesktopBridge />
      <Shell />
      <Toaster />
    </HashRouter>
  )
}
