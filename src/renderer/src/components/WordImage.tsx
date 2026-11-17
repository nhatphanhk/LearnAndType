import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { cx } from './ui'
import type { Word } from '@/types'

type VisualFields = Pick<Word, 'emoji' | 'imageUrl' | 'imageId' | 'word'>

/** Từ có ảnh hoặc emoji minh họa không. Không có thì chỉ hiển thị dạng chữ. */
export function hasWordVisual(word: Pick<Word, 'emoji' | 'imageUrl' | 'imageId'>): boolean {
  return !!(word.imageId || word.imageUrl?.trim() || word.emoji?.trim())
}

/** Ảnh minh họa của từ: ảnh tải lên > ảnh từ URL > emoji > chữ cái đầu. */
export function WordImage({
  word,
  size = 'md',
  className
}: {
  word: VisualFields
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}): ReactNode {
  const blob = useLiveQuery(
    async () => (word.imageId ? ((await db.images.get(word.imageId))?.blob ?? null) : null),
    [word.imageId]
  )
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!blob) {
      setBlobUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])

  useEffect(() => setFailed(false), [word.imageUrl, word.imageId])

  const src = blobUrl ?? word.imageUrl?.trim()
  const box = {
    sm: 'h-10 w-10 rounded-lg',
    md: 'h-20 w-20 rounded-xl',
    lg: 'h-40 w-40 rounded-2xl',
    xl: 'h-52 w-52 rounded-3xl'
  }[size]

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={word.word}
        onError={() => setFailed(true)}
        className={cx(box, 'object-cover shadow-sm ring-1 ring-slate-200 dark:ring-slate-700', className)}
        draggable={false}
      />
    )
  }

  const emoji = word.emoji?.trim()
  if (emoji) {
    const emojiSize = { sm: 'text-3xl', md: 'text-6xl', lg: 'text-[7rem]', xl: 'text-[9rem]' }[size]
    return (
      <div className={cx(box, emojiSize, 'emoji flex shrink-0 items-center justify-center select-none', className)} aria-hidden>
        {emoji}
      </div>
    )
  }

  // Không có ảnh/emoji: ô chữ cái đầu, không cần tìm icon.
  const letterSize = { sm: 'text-lg', md: 'text-4xl', lg: 'text-7xl', xl: 'text-8xl' }[size]
  return (
    <div
      className={cx(
        box,
        letterSize,
        'flex shrink-0 items-center justify-center bg-indigo-50 font-bold text-indigo-600 select-none dark:bg-indigo-950 dark:text-indigo-300',
        className
      )}
      aria-hidden
    >
      {[...word.word.trim()][0]?.toUpperCase() ?? 'Aa'}
    </div>
  )
}
