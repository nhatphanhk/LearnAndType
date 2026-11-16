import type { ReactNode } from 'react'
import { charsEqual } from '@/core/typing'
import { cx } from './ui'

/**
 * Hiển thị ô chữ khi gõ.
 * - `live`: hiện sẵn đáp án mờ, ký tự gõ đúng xanh / sai đỏ (chế độ Chép, gõ lại đáp án).
 * - `blind`: không lộ đáp án, chỉ hiện chữ đã gõ trong các ô (Nhớ / Nghe / Điền câu).
 * `result` tô màu toàn bộ sau khi nộp.
 */
export function TypingSlots({
  target,
  typed,
  variant,
  hideLength = false,
  result,
  caseSensitive = false
}: {
  target: string
  typed: string
  variant: 'live' | 'blind'
  hideLength?: boolean
  result?: 'correct' | 'wrong'
  caseSensitive?: boolean
}): ReactNode {
  const showCaret = !result

  if (variant === 'blind' && hideLength) {
    return (
      <div
        className={cx(
          'flex min-h-16 min-w-64 items-center justify-center border-b-4 px-4 pb-1 font-mono text-4xl font-semibold tracking-wide',
          result === 'correct' && 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
          result === 'wrong' && 'border-rose-500 text-rose-600 dark:text-rose-400',
          !result && 'border-indigo-400 dark:border-indigo-500'
        )}
      >
        <span className="whitespace-pre">{typed}</span>
        {showCaret && <span className="caret ml-0.5 inline-block h-10 w-0.5 bg-indigo-500" />}
      </div>
    )
  }

  const length = Math.max(target.length, typed.length)
  const cells: ReactNode[] = []
  for (let i = 0; i < length; i++) {
    const t = target[i]
    const c = typed[i]
    const isSpace = t === ' '
    const isCurrent = showCaret && i === typed.length
    let text = ''
    let tone = 'pending'
    if (c !== undefined) {
      text = c === ' ' ? '' : c
      if (result) tone = result
      else if (variant === 'live') tone = t !== undefined && charsEqual(t, c, caseSensitive) ? 'correct' : 'wrong'
      else tone = 'typed'
      if (t === undefined) tone = result === 'correct' ? 'correct' : 'extra'
    } else if (variant === 'live') {
      text = t
      tone = 'ghost'
    }

    if (isSpace && (c === undefined || c === ' ')) {
      cells.push(
        <span key={i} className={cx('relative w-5', isCurrent && 'caret-slot')}>
          {isCurrent && <span className="caret absolute bottom-1 left-1/2 h-1 w-4 -translate-x-1/2 rounded bg-indigo-500" />}
        </span>
      )
      continue
    }

    cells.push(
      <span
        key={i}
        className={cx(
          'relative flex h-16 w-11 items-center justify-center rounded-lg border-b-4 font-mono text-4xl font-semibold transition-colors',
          tone === 'ghost' && 'border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600',
          tone === 'pending' && 'border-slate-300 dark:border-slate-600',
          tone === 'typed' && 'border-indigo-400 text-slate-800 dark:text-slate-100',
          tone === 'correct' &&
            'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
          tone === 'wrong' && 'border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300',
          tone === 'extra' && 'border-rose-300 text-rose-400 line-through',
          isCurrent && 'border-indigo-500 dark:border-indigo-400'
        )}
      >
        {text}
        {isCurrent && <span className="caret absolute -bottom-1 left-1/2 h-1 w-6 -translate-x-1/2 rounded bg-indigo-500" />}
      </span>
    )
  }
  // Con trỏ khi đã gõ hết số ô
  if (showCaret && typed.length >= length) {
    cells.push(
      <span key="caret" className="flex h-16 items-center">
        <span className="caret h-10 w-0.5 bg-indigo-500" />
      </span>
    )
  }
  return <div className="flex flex-wrap items-end justify-center gap-1.5">{cells}</div>
}
