import type { ReactNode } from 'react'
import type { Topic } from '@/types'

/** Biểu tượng chủ đề: emoji nếu có, không thì chữ cái đầu của tên (không bắt buộc icon). */
export function TopicIcon({ topic }: { topic: Pick<Topic, 'emoji' | 'name'> }): ReactNode {
  const emoji = topic.emoji?.trim()
  if (emoji) return <span className="emoji">{emoji}</span>
  return (
    <span className="text-[0.7em] leading-none font-bold text-indigo-600 select-none dark:text-indigo-300" aria-hidden>
      {[...topic.name.trim()][0]?.toUpperCase() ?? '?'}
    </span>
  )
}
