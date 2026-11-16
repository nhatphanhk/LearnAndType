import { useEffect, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { cx } from './ui'
import type { Word } from '@/types'

/** Ảnh minh họa của từ: ảnh tải lên > ảnh từ URL > emoji. */
export function WordImage({
  word,
  size = 'md',
  className
}: {
  word: Pick<Word, 'emoji' | 'imageUrl' | 'imageId' | 'word'>
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

  const src = blobUrl ?? word.imageUrl
  const box = {
    sm: 'h-10 w-10 text-3xl rounded-lg',
    md: 'h-20 w-20 text-6xl rounded-xl',
    lg: 'h-40 w-40 text-[7rem] rounded-2xl',
    xl: 'h-52 w-52 text-[9rem] rounded-3xl'
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
  return (
    <div className={cx(box, 'emoji flex shrink-0 items-center justify-center select-none', className)} aria-hidden>
      {word.emoji || '📘'}
    </div>
  )
}
