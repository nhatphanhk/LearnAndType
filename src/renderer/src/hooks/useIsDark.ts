import { useEffect, useState } from 'react'

/** Theo dõi class `dark` trên <html> (do App gắn theo cài đặt giao diện). */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

/** Màu biểu đồ đã kiểm tra (độ tương phản, mù màu) cho cả nền sáng và tối. */
export function useChartColors() {
  const dark = useIsDark()
  return {
    series: '#6366f1',
    learning: '#6366f1',
    mastered: '#059669',
    grid: dark ? '#1e293b' : '#e2e8f0',
    axis: dark ? '#94a3b8' : '#64748b',
    cursor: dark ? 'rgba(148,163,184,0.12)' : 'rgba(100,116,139,0.08)'
  }
}
