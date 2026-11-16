import type { ReactNode } from 'react'
import { create } from 'zustand'
import { cx } from './ui'

interface ToastItem {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

interface ToastStore {
  items: ToastItem[]
  push: (text: string, tone?: ToastItem['tone']) => void
  dismiss: (id: number) => void
}

let seq = 0

export const useToast = create<ToastStore>()((set, get) => ({
  items: [],
  push(text, tone = 'info') {
    const id = ++seq
    set({ items: [...get().items, { id, text, tone }] })
    setTimeout(() => get().dismiss(id), 4000)
  },
  dismiss(id) {
    set({ items: get().items.filter((t) => t.id !== id) })
  }
}))

export const toast = {
  info: (t: string): void => useToast.getState().push(t, 'info'),
  success: (t: string): void => useToast.getState().push(t, 'success'),
  error: (t: string): void => useToast.getState().push(t, 'error')
}

export function Toaster(): ReactNode {
  const items = useToast((s) => s.items)
  const dismiss = useToast((s) => s.dismiss)
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2" aria-live="polite">
      {items.map((t) => (
        <button
          type="button"
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cx(
            'animate-pop pointer-events-auto max-w-sm cursor-pointer rounded-xl px-4 py-3 text-left text-sm font-medium text-white shadow-lg',
            t.tone === 'success' && 'bg-emerald-600',
            t.tone === 'error' && 'bg-rose-600',
            t.tone === 'info' && 'bg-slate-800 dark:bg-slate-700'
          )}
        >
          {t.text}
        </button>
      ))}
    </div>
  )
}
