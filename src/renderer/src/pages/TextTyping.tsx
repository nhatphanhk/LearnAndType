import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { canCloze, pickWordsForKind } from '@/core/queue'
import { topicProgress } from '@/core/stats'
import { importIntoTopics } from '@/db/repo'
import { groupByTopic, useNow, useProgressMap, useTopics, useWords } from '@/hooks/useData'
import { useSettings } from '@/store/settingsStore'
import { SmartImport, importMessage } from '@/components/SmartImport'
import { toast } from '@/components/Toast'
import { Badge, Button, Card, EmptyState, Modal, PageHeader, ProgressBar, cx, inputCls } from '@/components/ui'
import { KIND_INFO, posLabel, statusBadge } from '@/labels'
import { launchSession } from '@/launch'
import type { SessionKind } from '@/types'

/** Các chế độ của trang Gõ chữ — mô tả không nhắc tới hình ảnh. */
const MODES: { kind: SessionKind; desc: string }[] = [
  { kind: 'copy', desc: 'Nhìn từ, phiên âm và nghĩa rồi gõ lại.' },
  { kind: 'recall', desc: 'Chỉ thấy nghĩa tiếng Việt, tự gõ ra từ tiếng Anh.' },
  { kind: 'listen', desc: 'Nghe phát âm và gõ lại từ nghe được.' },
  { kind: 'cloze', desc: 'Điền từ còn thiếu vào câu ví dụ.' }
]

/**
 * Trang "Gõ chữ": luyện gõ chỉ với chữ — không hình ảnh, không icon.
 * Phiên được đánh dấu `textOnly` nên màn luyện gõ và màn tổng kết không hiện ảnh/emoji của từ.
 */
export default function TextTyping(): ReactNode {
  const topics = useTopics()
  const allWords = useWords()
  const progress = useProgressMap()
  const lessonSize = useSettings((s) => s.lessonSize)
  const navigate = useNavigate()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [pasting, setPasting] = useState(false)

  const byTopic = useMemo(() => groupByTopic(allWords ?? []), [allWords])

  if (!topics || !allWords || !progress) return null

  const count = (id: string): number => byTopic.get(id)?.length ?? 0
  const withWords = topics.filter((t) => count(t.id) > 0)
  // Ưu tiên: chủ đề trên URL → chủ đề riêng mới nhất có từ → chủ đề đầu tiên có từ
  const topic =
    topics.find((t) => t.id === params.get('topic')) ?? [...withWords].reverse().find((t) => !t.isBuiltIn) ?? withWords[0]
  const words = topic ? [...(byTopic.get(topic.id) ?? [])].sort((a, b) => a.createdAt - b.createdAt) : []
  const tp = topicProgress(
    words.map((w) => w.id),
    progress,
    now
  )
  const clozeCount = words.filter(canCloze).length

  const selectTopic = (id: string): void => setParams({ topic: id }, { replace: true })

  const start = (kind: SessionKind): void => {
    if (!topic) return
    void launchSession(navigate, kind, topic.id, pickWordsForKind(kind, words, progress, lessonSize, now), { textOnly: true })
  }

  const note = (kind: SessionKind): { text: string; disabled: boolean } => {
    if (words.length === 0) return { text: 'Chủ đề chưa có từ', disabled: true }
    if (kind === 'cloze') {
      return clozeCount
        ? { text: `${Math.min(lessonSize, clozeCount)} câu`, disabled: false }
        : { text: 'Cần từ có câu ví dụ', disabled: true }
    }
    return { text: `${Math.min(lessonSize, words.length)} từ`, disabled: false }
  }

  const pasteButton = (
    <Button variant="primary" onClick={() => setPasting(true)}>
      ✨ Nhập thông minh
    </Button>
  )

  return (
    <div>
      <PageHeader
        title="Gõ chữ"
        subtitle="Luyện gõ chỉ với chữ — không cần hình ảnh hay icon. Dán danh sách từ (hoặc chỉ từ tiếng Anh, cả đoạn văn) và bắt đầu gõ ngay."
        actions={pasteButton}
      />

      {withWords.length === 0 || !topic ? (
        <Card>
          <EmptyState icon="🔤" title="Chưa có từ nào để gõ">
            Dán danh sách từ (mỗi dòng "từ - nghĩa", hoặc chỉ từ tiếng Anh — app tự tra nghĩa) hay một đoạn văn để tạo chủ đề và luyện gõ ngay.
            <div className="mt-5 flex justify-center">{pasteButton}</div>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-wrap items-end gap-4">
              <label className="min-w-64 flex-1">
                <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Chủ đề</span>
                <select
                  className={inputCls}
                  value={topic.id}
                  onChange={(e) => selectTopic(e.target.value)}
                  aria-label="Chọn chủ đề"
                >
                  {topics.map((t) => (
                    <option key={t.id} value={t.id} disabled={count(t.id) === 0}>
                      {`${t.name}${t.isBuiltIn ? '' : ' (của tôi)'} — ${count(t.id)} từ`}
                    </option>
                  ))}
                </select>
              </label>
              {!topic.isBuiltIn && (
                <Link to={`/manage/${topic.id}`}>
                  <Button>✏️ Sửa / thêm từ</Button>
                </Link>
              )}
            </div>
            <ProgressBar className="mt-4" total={tp.total} learned={tp.learned} mastered={tp.mastered} />
            <div className="mt-2 text-sm text-slate-500">
              {tp.learned}/{tp.total} từ đã học · {tp.mastered} đã thuộc
              {tp.due > 0 && <> · {tp.due} cần ôn</>}
            </div>
          </Card>

          <h2 className="mt-8 mb-3 text-lg font-semibold">Chọn chế độ gõ</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {MODES.map((m) => {
              const n = note(m.kind)
              return (
                <button
                  key={m.kind}
                  type="button"
                  disabled={n.disabled}
                  onClick={() => start(m.kind)}
                  data-kind={m.kind}
                  className={cx(
                    'flex cursor-pointer flex-col items-start rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none dark:bg-slate-900 dark:ring-slate-800 dark:hover:ring-indigo-700',
                    m.kind === 'copy' && 'ring-2 ring-indigo-400 dark:ring-indigo-600'
                  )}
                >
                  <span className="font-semibold">{KIND_INFO[m.kind].title}</span>
                  <span className="mt-0.5 text-sm text-slate-500">{m.desc}</span>
                  <span className="mt-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">{n.text}</span>
                </button>
              )
            })}
          </div>

          <Card className="mt-8 p-0">
            <div className="border-b border-slate-200 px-5 py-3 font-semibold dark:border-slate-800">
              Danh sách từ <span className="font-normal text-slate-500">({words.length})</span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {words.map((w) => {
                const b = statusBadge(progress.get(w.id))
                return (
                  <li key={w.id} className="flex items-center gap-4 px-5 py-2.5">
                    <div className="w-48 min-w-0">
                      <div className="truncate font-semibold">{w.word}</div>
                      {(w.ipa || w.partOfSpeech) && (
                        <div className="truncate text-xs text-slate-500">
                          {w.ipa} {w.partOfSpeech && <i>· {posLabel(w.partOfSpeech)}</i>}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 truncate">{w.meaningVi}</div>
                    <Badge tone={b.tone}>{b.text}</Badge>
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}

      <Modal open={pasting} title="Nhập thông minh — tạo chủ đề mới" onClose={() => setPasting(false)} wide="xl">
        <SmartImport
          withTopicName
          submitLabel="Tạo chủ đề"
          onCancel={() => setPasting(false)}
          onSubmit={async (groups) => {
            // Nhóm đầu là chủ đề vừa đặt tên (nếu bật phân loại, từ có thể vào thêm chủ đề khác)
            const res = await importIntoTopics(groups)
            toast.success(importMessage(res))
            setPasting(false)
            if (res[0]) selectTopic(res[0].topicId)
          }}
        />
      </Modal>
    </div>
  )
}
