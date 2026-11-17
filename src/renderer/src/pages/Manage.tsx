import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CSV_COLUMNS, wordsToCsv } from '@/core/csv'
import {
  addWord,
  createTopic,
  deleteTopic,
  deleteWord,
  importIntoTopics,
  updateTopic,
  updateWord,
  type TopicInput,
  type WordInput
} from '@/db/repo'
import { useTopic, useTopics, useWords } from '@/hooks/useData'
import { WordImage } from '@/components/WordImage'
import { TopicIcon } from '@/components/TopicIcon'
import { SmartImport, importMessage } from '@/components/SmartImport'
import { toast } from '@/components/Toast'
import { Badge, Button, Card, EmptyState, Field, Modal, PageHeader, cx, inputCls } from '@/components/ui'
import { POS_LABEL, posLabel } from '@/labels'
import { dateStamp, downloadText, pickFile } from '@/download'
import { slugify } from '@/data/builtin'
import type { Topic, Word } from '@/types'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** File mẫu chỉ cần 2 cột: từ và nghĩa (không ảnh, không icon). */
const SAMPLE_CSV =
  '﻿' +
  'word,meaning\n' +
  'laptop,máy tính xách tay\n' +
  'meeting,cuộc họp\n' +
  'deadline,hạn chót\n'

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/* ----------------------------- Form chủ đề ----------------------------- */

function TopicForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel
}: {
  initial?: Topic
  onSubmit: (v: TopicInput) => Promise<void>
  onCancel: () => void
  submitLabel: string
}): ReactNode {
  const [v, setV] = useState<TopicInput>({
    name: initial?.name ?? '',
    nameEn: initial?.nameEn ?? '',
    emoji: initial?.emoji ?? '',
    description: initial?.description ?? ''
  })
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.name.trim()) return toast.error('Hãy nhập tên chủ đề.')
        setBusy(true)
        try {
          await onSubmit(v)
        } catch (err) {
          toast.error(errMsg(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Icon (tùy chọn)">
          <input
            className={cx(inputCls, 'emoji text-center text-2xl')}
            value={v.emoji}
            onChange={(e) => setV({ ...v, emoji: e.target.value })}
            maxLength={8}
            placeholder="Aa"
            title="Để trống thì hiện chữ cái đầu của tên chủ đề"
          />
        </Field>
        <Field label="Tên chủ đề *">
          <input className={inputCls} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="VD: Văn phòng" autoFocus />
        </Field>
      </div>
      <Field label="Tên tiếng Anh">
        <input className={inputCls} value={v.nameEn} onChange={(e) => setV({ ...v, nameEn: e.target.value })} placeholder="VD: Office" />
      </Field>
      <Field label="Mô tả">
        <input className={inputCls} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="Từ vựng dùng ở công sở" />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel}>Hủy</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------- Form từ ------------------------------- */

const EMPTY_WORD: WordInput = {
  word: '',
  meaningVi: '',
  ipa: '',
  partOfSpeech: 'n',
  emoji: '',
  example: '',
  exampleVi: '',
  imageUrl: ''
}

function WordForm({
  initial,
  onSubmit,
  onCancel
}: {
  initial?: Word
  onSubmit: (v: WordInput, image: Blob | null | undefined) => Promise<void>
  onCancel: () => void
}): ReactNode {
  const [v, setV] = useState<WordInput>(initial ? { ...EMPTY_WORD, ...initial, imageUrl: initial.imageUrl ?? '' } : EMPTY_WORD)
  // undefined = giữ nguyên, null = xóa, Blob = ảnh mới
  const [image, setImage] = useState<Blob | null | undefined>(undefined)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!image) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(image)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  const hasStoredImage = !!initial?.imageId && image === undefined
  const set = (k: keyof WordInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setV({ ...v, [k]: e.target.value })

  const chooseImage = async (): Promise<void> => {
    const f = await pickFile('image/*')
    if (!f) return
    if (f.size > MAX_IMAGE_BYTES) return toast.error('Ảnh quá lớn (tối đa 5 MB).')
    setImage(f)
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!v.word.trim() || !v.meaningVi.trim()) return toast.error('Cần nhập từ tiếng Anh và nghĩa.')
        setBusy(true)
        try {
          await onSubmit(v, image)
        } catch (err) {
          toast.error(errMsg(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Từ tiếng Anh *">
          <input className={inputCls} value={v.word} onChange={set('word')} placeholder="laptop" autoFocus />
        </Field>
        <Field label="Nghĩa tiếng Việt *">
          <input className={inputCls} value={v.meaningVi} onChange={set('meaningVi')} placeholder="máy tính xách tay" />
        </Field>
        <Field label="Phiên âm (IPA)">
          <input className={inputCls} value={v.ipa} onChange={set('ipa')} placeholder="/ˈlæp.tɑːp/" />
        </Field>
        <Field label="Loại từ">
          <select className={inputCls} value={v.partOfSpeech} onChange={set('partOfSpeech')}>
            {Object.entries(POS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
            <option value="">(không rõ)</option>
          </select>
        </Field>
      </div>
      <Field label="Câu ví dụ" hint="Nên chứa từ đang học để dùng được chế độ Điền vào câu.">
        <input className={inputCls} value={v.example} onChange={set('example')} placeholder="I bring my laptop to work." />
      </Field>
      <Field label="Dịch câu ví dụ">
        <input className={inputCls} value={v.exampleVi} onChange={set('exampleVi')} placeholder="Tôi mang máy tính đi làm." />
      </Field>

      <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50">
        <div className="mb-3 text-sm font-medium">
          Hình ảnh minh họa <span className="font-normal text-slate-500">(không bắt buộc)</span>
        </div>
        <div className="flex gap-4">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
            {preview ? (
              <img src={preview} alt="" className="h-24 w-24 rounded-xl object-cover" />
            ) : hasStoredImage && initial ? (
              <WordImage word={initial} size="md" />
            ) : (
              <WordImage word={{ word: v.word, emoji: v.emoji, imageUrl: v.imageUrl || undefined }} size="md" />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <div className="grid grid-cols-[5rem_1fr] gap-2">
              <input className={cx(inputCls, 'emoji text-center text-xl')} value={v.emoji} onChange={set('emoji')} placeholder="💻" maxLength={8} title="Emoji" />
              <input className={inputCls} value={v.imageUrl} onChange={set('imageUrl')} placeholder="hoặc dán URL ảnh https://…" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void chooseImage()}>
                🖼️ Chọn ảnh từ máy
              </Button>
              {(image || hasStoredImage) && (
                <Button size="sm" variant="ghost" onClick={() => setImage(initial?.imageId ? null : undefined)}>
                  Bỏ ảnh đã chọn
                </Button>
              )}
            </div>
            <div className="text-xs text-slate-500">
              Thứ tự ưu tiên: ảnh từ máy → URL ảnh → emoji. Để trống cũng được — từ sẽ chỉ hiện dạng chữ. Trang "Gõ chữ" luôn
              luyện không hình ảnh.
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button onClick={onCancel}>Hủy</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {initial ? 'Lưu thay đổi' : 'Thêm từ'}
        </Button>
      </div>
    </form>
  )
}

/* ------------------------------ Trang chính ------------------------------ */

export default function Manage(): ReactNode {
  const { id } = useParams()
  const navigate = useNavigate()
  const topics = useTopics()
  const custom = (topics ?? []).filter((t) => !t.isBuiltIn)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)

  return (
    <div>
      <PageHeader
        title="Từ vựng của tôi"
        subtitle="Tạo chủ đề riêng, thêm từng từ hoặc nhập thông minh (dán danh sách, đoạn văn, file CSV) — ảnh và icon đều không bắt buộc."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setImporting(true)}>🗂️ Nhập & phân loại</Button>
            <Button variant="primary" onClick={() => setCreating(true)}>
              ＋ Tạo chủ đề
            </Button>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_1fr]">
        <Card className="h-fit p-2">
          <div className="px-3 pt-2 pb-1 text-xs font-semibold text-slate-500 uppercase">Chủ đề của tôi</div>
          {custom.length === 0 && <div className="px-3 py-4 text-sm text-slate-500">Chưa có chủ đề nào.</div>}
          {custom.map((t) => (
            <Link
              key={t.id}
              to={`/manage/${t.id}`}
              className={cx(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm',
                id === t.id ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              <span className="flex w-5 justify-center">
                <TopicIcon topic={t} />
              </span>
              <span className="truncate">{t.name}</span>
            </Link>
          ))}
        </Card>

        {/* min-w-0: câu ví dụ dài (lấy từ đoạn văn) không được kéo rộng cột lưới */}
        <div className="min-w-0">
          {id ? <TopicEditor id={id} /> : <Intro onCreate={() => setCreating(true)} onImport={() => setImporting(true)} />}
        </div>
      </div>

      <Modal open={importing} title="Nhập & phân loại vào chủ đề" onClose={() => setImporting(false)} wide="xl">
        <SmartImport
          classify
          submitLabel="Lưu vào chủ đề"
          onCancel={() => setImporting(false)}
          onSubmit={async (groups) => {
            const res = await importIntoTopics(groups)
            toast.success(importMessage(res))
            setImporting(false)
            if (res[0]) navigate(`/manage/${res[0].topicId}`)
          }}
        />
      </Modal>

      <Modal open={creating} title="Tạo chủ đề mới" onClose={() => setCreating(false)}>
        <TopicForm
          submitLabel="Tạo chủ đề"
          onCancel={() => setCreating(false)}
          onSubmit={async (v) => {
            const newId = await createTopic(v)
            setCreating(false)
            toast.success('Đã tạo chủ đề.')
            navigate(`/manage/${newId}`)
          }}
        />
      </Modal>
    </div>
  )
}

function Intro({ onCreate, onImport }: { onCreate: () => void; onImport: () => void }): ReactNode {
  return (
    <Card>
      <EmptyState icon="✍️" title="Tự xây bộ từ vựng của bạn">
        Tạo một chủ đề, sau đó thêm từng từ hoặc bấm <b>✨ Nhập thông minh</b>: dán danh sách (chỉ có từ tiếng Anh cũng
        được — app tự tra nghĩa), trích từ một đoạn văn, hoặc mở file CSV. Có sẵn một file nhiều mảng từ vựng? Bấm{' '}
        <b>🗂️ Nhập & phân loại</b> — app tự chia từ vào các chủ đề phù hợp. Không cần ảnh hay icon.
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="primary" onClick={onCreate}>
            ＋ Tạo chủ đề
          </Button>
          <Button onClick={onImport}>🗂️ Nhập & phân loại</Button>
          <Button onClick={() => downloadText('mau-tu-vung.csv', SAMPLE_CSV, 'text/csv')}>⬇️ Tải file CSV mẫu</Button>
        </div>
      </EmptyState>
      <CsvHelp />
    </Card>
  )
}

function CsvHelp(): ReactNode {
  return (
    <div className="mt-2 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
      <div className="font-medium text-slate-800 dark:text-slate-200">Định dạng CSV</div>
      <div className="mt-1">
        Dòng đầu là tên cột, mã hóa UTF-8. Chỉ cần 2 cột <code>word</code>, <code>meaning</code>. Có thể thêm (tùy chọn):{' '}
        {CSV_COLUMNS.slice(2).map((c, i) => (
          <span key={c}>
            {i > 0 && ', '}
            <code>{c}</code>
          </span>
        ))}
        . Từ đã có trong chủ đề sẽ được cập nhật thay vì thêm trùng.
      </div>
      <div className="mt-1">
        Thêm cột <code>topic</code> (hoặc <code>chủ đề</code>) để chia từ vào nhiều chủ đề trong một lần nhập — chủ đề chưa có sẽ
        được tạo. Không có cột này thì bật <b>🗂️ Phân loại vào nhiều chủ đề</b> ở bước Xem lại, app tự đoán chủ đề cho từng từ.
      </div>
      <div className="mt-1">
        Không có file? Bấm <b>✨ Nhập thông minh</b> và dán danh sách theo bất kỳ dạng nào: <code>laptop - máy tính xách tay</code>,
        cột copy từ Excel (cột Anh/Việt đảo cũng được), <code>meeting (n) /ˈmiː.t̬ɪŋ/: cuộc họp</code>, hoặc chỉ từ tiếng Anh —
        app tự tra nghĩa, phiên âm, ví dụ (cần mạng). Có thể dán cả một đoạn văn để app gợi ý từ đáng học.
      </div>
    </div>
  )
}

function TopicEditor({ id }: { id: string }): ReactNode {
  const topic = useTopic(id)
  const words = useWords(id)
  const navigate = useNavigate()
  const [editingTopic, setEditingTopic] = useState(false)
  const [wordModal, setWordModal] = useState<{ word?: Word } | null>(null)
  const [pasting, setPasting] = useState(false)
  const [formKey, setFormKey] = useState(0)

  if (topic === null) {
    return (
      <Card>
        <EmptyState icon="🔍" title="Không tìm thấy chủ đề" />
      </Card>
    )
  }
  if (!topic || !words) return null
  if (topic.isBuiltIn) {
    return (
      <Card>
        <EmptyState icon="🔒" title="Đây là chủ đề có sẵn">
          Chủ đề có sẵn không chỉnh sửa được. Hãy tạo chủ đề riêng để thêm từ của bạn.
        </EmptyState>
      </Card>
    )
  }

  const onDeleteTopic = async (): Promise<void> => {
    if (!window.confirm(`Xóa chủ đề "${topic.name}" cùng ${words.length} từ và tiến độ học của chúng?`)) return
    await deleteTopic(topic.id)
    toast.success('Đã xóa chủ đề.')
    navigate('/manage')
  }

  return (
    <div className="space-y-6">
      <Card className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-4xl dark:bg-indigo-950">
          <TopicIcon topic={topic} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold">{topic.name}</h2>
          <div className="text-sm text-slate-500">
            {[topic.nameEn, topic.description, `${words.length} từ`].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to={`/topics/${topic.id}`}>
            <Button variant="primary">▶ Luyện gõ</Button>
          </Link>
          <Button onClick={() => setEditingTopic(true)}>✏️ Sửa</Button>
          <Button variant="ghost" onClick={() => void onDeleteTopic()}>
            🗑️ Xóa
          </Button>
        </div>
      </Card>

      <Card className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3 dark:border-slate-800">
          <h3 className="font-semibold">Danh sách từ</h3>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => setWordModal({})}>
              ＋ Thêm từ
            </Button>
            <Button size="sm" onClick={() => setPasting(true)}>
              ✨ Nhập thông minh
            </Button>
            <Button
              size="sm"
              disabled={words.length === 0}
              onClick={() => downloadText(`${slugify(topic.nameEn || topic.name) || 'topic'}-${dateStamp()}.csv`, wordsToCsv(words), 'text/csv')}
            >
              ⬇️ Xuất CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => downloadText('mau-tu-vung.csv', SAMPLE_CSV, 'text/csv')}>
              File mẫu
            </Button>
          </div>
        </div>
        {words.length === 0 ? (
          <div className="p-5">
            <EmptyState icon="📝" title="Chưa có từ nào">
              Thêm từng từ, hoặc bấm ✨ Nhập thông minh để dán danh sách, trích từ đoạn văn hay mở file CSV.
            </EmptyState>
            <CsvHelp />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {words.map((w) => (
              <li key={w.id} className="flex items-center gap-4 px-5 py-3">
                <WordImage word={w} size="sm" />
                <div className="w-44 min-w-0">
                  <div className="truncate font-semibold">{w.word}</div>
                  <div className="truncate text-xs text-slate-500">
                    {w.ipa} {w.partOfSpeech && `· ${posLabel(w.partOfSpeech)}`}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate">{w.meaningVi}</div>
                  {w.example ? (
                    <div className="truncate text-xs text-slate-500">{w.example}</div>
                  ) : (
                    <Badge tone="amber">Chưa có câu ví dụ</Badge>
                  )}
                </div>
                <Button size="sm" variant="ghost" onClick={() => setWordModal({ word: w })}>
                  Sửa
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!window.confirm(`Xóa từ "${w.word}"?`)) return
                    await deleteWord(w.id)
                  }}
                >
                  Xóa
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={pasting} title={`Nhập thông minh vào "${topic.name}"`} onClose={() => setPasting(false)} wide="xl">
        <SmartImport
          fallback={{ kind: 'topic', topicId: topic.id }}
          submitLabel="Lưu"
          onCancel={() => setPasting(false)}
          onSubmit={async (groups) => {
            toast.success(importMessage(await importIntoTopics(groups)))
            setPasting(false)
          }}
        />
      </Modal>

      <Modal open={editingTopic} title="Sửa chủ đề" onClose={() => setEditingTopic(false)}>
        <TopicForm
          initial={topic}
          submitLabel="Lưu"
          onCancel={() => setEditingTopic(false)}
          onSubmit={async (v) => {
            await updateTopic(topic.id, v)
            setEditingTopic(false)
            toast.success('Đã lưu chủ đề.')
          }}
        />
      </Modal>

      <Modal open={!!wordModal} title={wordModal?.word ? 'Sửa từ' : 'Thêm từ mới'} onClose={() => setWordModal(null)} wide>
        {wordModal && (
          <WordForm
            key={wordModal.word?.id ?? `new-${formKey}`}
            initial={wordModal.word}
            onCancel={() => setWordModal(null)}
            onSubmit={async (v, image) => {
              if (wordModal.word) {
                await updateWord(wordModal.word.id, v, image)
                toast.success('Đã lưu từ.')
                setWordModal(null)
              } else {
                await addWord(topic.id, v, image ?? undefined)
                toast.success(`Đã thêm "${v.word.trim()}".`)
                setFormKey((k) => k + 1) // mở form trống để thêm tiếp
              }
            }}
          />
        )}
      </Modal>
    </div>
  )
}
