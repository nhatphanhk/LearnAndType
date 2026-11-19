import { useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { MISTAKE_INFO, mistakeReport } from '@/core/mistakes'
import { launchSession } from '@/launch'
import { Button, Card } from './ui'
import type { Attempt, Word } from '@/types'

const PRACTICE_LIMIT = 15

/** Mục "Lỗi hay gặp" ở trang Thống kê. */
export function MistakeAnalysis({
  attempts,
  words
}: {
  attempts: readonly Attempt[]
  words: ReadonlyMap<string, Word>
}): ReactNode {
  const navigate = useNavigate()
  const report = useMemo(() => mistakeReport(attempts, (id) => words.get(id)?.word), [attempts, words])
  const max = Math.max(1, ...report.groups.map((g) => g.count))

  const practice = (wordIds: string[]): void => {
    const list = wordIds.flatMap((id) => {
      const w = words.get(id)
      return w ? [w] : []
    })
    void launchSession(navigate, 'retry', null, list.slice(0, PRACTICE_LIMIT))
  }

  return (
    <Card className="mt-6">
      <div className="mb-1 flex items-center justify-between gap-4">
        <h2 className="font-semibold">🔍 Lỗi hay gặp</h2>
        {report.total > 0 && <span className="text-xs text-slate-500">{report.total} lượt sai được phân tích</span>}
      </div>
      {report.total === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          Chưa có dữ liệu. Các lần trả lời sai ở chế độ Nhớ từ / Nghe & gõ / Điền câu (từ bây giờ) sẽ được phân loại tại đây.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            {report.groups.map((g) => {
              const info = MISTAKE_INFO[g.kind]
              const ex = g.example && words.get(g.example.wordId)
              return (
                <div key={g.kind} className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <div className="text-sm font-medium">{info.label}</div>
                    <div className="truncate text-xs text-slate-500" title={info.hint}>
                      {ex && g.example ? (
                        <>
                          <span className="line-through">{g.example.typed || '∅'}</span> → {ex.word}
                        </>
                      ) : (
                        info.hint
                      )}
                    </div>
                  </div>
                  <div className="h-2.5 min-w-0 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${(g.count / max) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right text-sm tabular-nums">{g.count}</span>
                  <Button size="sm" onClick={() => practice(g.wordIds)} title={`${g.wordIds.length} từ`}>
                    Luyện {Math.min(g.wordIds.length, PRACTICE_LIMIT)} từ
                  </Button>
                </div>
              )
            })}
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">Phím hay gõ nhầm</div>
            {report.keys.length === 0 ? (
              <div className="text-sm text-slate-500">Chưa có dữ liệu.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {report.keys.map((k) => (
                  <span
                    key={k.expected + k.typed}
                    className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm dark:bg-slate-800"
                    title={k.expected ? `Cần gõ "${k.expected}" nhưng gõ "${k.typed}"` : `Gõ thừa "${k.typed}"`}
                  >
                    {k.expected || '·'}→{k.typed} <span className="text-xs text-slate-500">×{k.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
