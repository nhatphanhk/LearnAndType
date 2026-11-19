import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/schema'
import { PACKS_META_KEY, setMeta, type InstalledPack } from '@/db/repo'
import {
  EXAM_PLAN_META_KEY,
  TARGET_OPTIONS,
  parseDate,
  planStatus,
  suggestedDailyAttempts,
  type ExamPlan
} from '@/core/examPlan'
import type { PackExam } from '@/core/packs'
import { useMeta, useNow, useProgressMap } from '@/hooks/useData'
import { useSettings } from '@/store/settingsStore'
import { launchSession } from '@/launch'
import { toast } from './Toast'
import { Badge, Button, Card, Field, ProgressBar, inputCls } from './ui'

const EXAM_NAME: Record<PackExam, string> = { toeic: 'TOEIC', ielts: 'IELTS', general: 'Cấp độ' }

/** Thẻ "Lộ trình luyện thi": đặt ngày thi + điểm mục tiêu, xem chỉ tiêu từ mới mỗi ngày và học ngay. */
export function ExamPlanCard({ compact = false }: { compact?: boolean }): ReactNode {
  const plan = useMeta<ExamPlan | null>(EXAM_PLAN_META_KEY, null)
  const installed = useMeta<Record<string, InstalledPack>>(PACKS_META_KEY, {})
  const [editing, setEditing] = useState(false)

  if (plan === undefined || installed === undefined) return null
  const packIds = Object.keys(installed)
  if (packIds.length === 0) return null
  const active = plan && installed[plan.packId] ? plan : null

  if (!active || editing) {
    if (compact) {
      return (
        <Card className="flex flex-wrap items-center gap-4">
          <span className="emoji text-3xl">🎯</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Đặt lộ trình luyện thi</div>
            <div className="text-sm text-slate-500">Nhập ngày thi và điểm mục tiêu để biết mỗi ngày cần học bao nhiêu từ.</div>
          </div>
          <Link to="/packs">
            <Button variant="primary">Đặt lộ trình</Button>
          </Link>
        </Card>
      )
    }
    return <PlanForm installed={installed} initial={active} onDone={() => setEditing(false)} canCancel={!!active} />
  }
  return <PlanView plan={active} packName={installed[active.packId].name} compact={compact} onEdit={() => setEditing(true)} />
}

function PlanForm({
  installed,
  initial,
  onDone,
  canCancel
}: {
  installed: Record<string, InstalledPack>
  initial: ExamPlan | null
  onDone: () => void
  canCancel: boolean
}): ReactNode {
  const ids = Object.keys(installed)
  const [packId, setPackId] = useState(initial?.packId ?? ids[0])
  const exam: PackExam = installed[packId]?.exam ?? 'general'
  const options = TARGET_OPTIONS[exam]
  const [target, setTarget] = useState(initial?.exam === exam ? initial.target : options[Math.floor(options.length / 2)].value)
  const [examDate, setExamDate] = useState(initial?.examDate ?? defaultDate())

  const changePack = (id: string): void => {
    setPackId(id)
    const opts = TARGET_OPTIONS[installed[id]?.exam ?? 'general']
    setTarget(opts[Math.floor(opts.length / 2)].value)
  }

  const save = async (): Promise<void> => {
    if (!examDate || examDate < defaultDate(0)) {
      toast.error('Ngày thi phải từ hôm nay trở đi.')
      return
    }
    const p: ExamPlan = { packId, exam, target, examDate, createdAt: Date.now() }
    await setMeta(EXAM_PLAN_META_KEY, p)
    toast.success('Đã lưu lộ trình luyện thi.')
    onDone()
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">🎯 Lộ trình luyện thi</h2>
      <p className="mt-1 text-sm text-slate-500">
        Chọn gói, điểm mục tiêu và ngày thi — app tính số từ mới cần học mỗi ngày (chừa vài ngày cuối để ôn).
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Gói từ vựng">
          <select className={inputCls} value={packId} onChange={(e) => changePack(e.target.value)}>
            {ids.map((id) => (
              <option key={id} value={id}>
                {installed[id].emoji} {installed[id].name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Mục tiêu ${EXAM_NAME[exam]}`}>
          <select className={inputCls} value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ngày thi">
          <input type="date" className={inputCls} value={examDate} min={defaultDate(0)} onChange={(e) => setExamDate(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={() => void save()}>
          Lưu lộ trình
        </Button>
        {canCancel && (
          <Button variant="ghost" onClick={onDone}>
            Hủy
          </Button>
        )}
      </div>
    </Card>
  )
}

function PlanView({
  plan,
  packName,
  compact,
  onEdit
}: {
  plan: ExamPlan
  packName: string
  compact: boolean
  onEdit: () => void
}): ReactNode {
  const navigate = useNavigate()
  const now = useNow()
  const progress = useProgressMap()
  const words = useLiveQuery(() => db.words.where('packId').equals(plan.packId).toArray(), [plan.packId])
  const lessonSize = useSettings((s) => s.lessonSize)
  const dailyGoalWords = useSettings((s) => s.dailyGoalWords)
  const setSettings = useSettings((s) => s.set)
  if (!words || !progress) return null

  const st = planStatus(plan, words, progress, now)
  const label = TARGET_OPTIONS[plan.exam].find((o) => o.value === plan.target)?.label ?? String(plan.target)
  const suggested = suggestedDailyAttempts(st.newPerDay)
  const finished = st.remaining === 0
  const lessonWords = st.next.slice(0, Math.max(1, Math.min(lessonSize, st.todayLeft || lessonSize)))

  const learn = (): void => {
    void launchSession(navigate, 'lesson', null, lessonWords)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4">
        <span className="emoji text-3xl">🎯</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              {EXAM_NAME[plan.exam]} {label}
            </h2>
            <Badge tone="indigo">cần đến {st.ceiling}</Badge>
            <Badge tone={st.daysLeft <= 7 ? 'amber' : 'slate'}>
              {st.daysLeft > 0 ? `còn ${st.daysLeft} ngày` : 'đã tới ngày thi'}
            </Badge>
          </div>
          <div className="text-sm text-slate-500">
            {packName} · thi ngày {new Date(parseDate(plan.examDate) ?? now).toLocaleDateString('vi-VN')}
          </div>
        </div>
        {!compact && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            ✏️ Sửa
          </Button>
        )}
      </div>

      <ProgressBar className="mt-4" total={st.required} learned={st.learned} mastered={st.mastered} />
      <div className="mt-2 text-sm text-slate-500" data-role="plan-progress">
        {st.learned.toLocaleString('vi-VN')}/{st.required.toLocaleString('vi-VN')} từ cần nắm đã học ·{' '}
        {st.mastered.toLocaleString('vi-VN')} đã thuộc ({st.required ? Math.round((st.mastered / st.required) * 100) : 0}%)
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-indigo-50 px-4 py-3 dark:bg-indigo-950/50">
        <div className="min-w-0 flex-1" data-role="plan-today">
          {finished ? (
            <span className="font-medium">🎉 Đã học hết từ cần nắm — tập trung ôn tập để thuộc chắc.</span>
          ) : (
            <>
              <div className="font-medium">
                Hôm nay: {st.learnedToday}/{st.newPerDay} từ mới
                {st.todayLeft === 0 && ' ✅'}
              </div>
              <div className="text-xs text-slate-500">
                Mỗi ngày ~{st.newPerDay} từ mới trong {st.learnDays} ngày
                {st.daysLeft > st.learnDays && `, ${st.daysLeft - st.learnDays} ngày cuối chỉ ôn`}
              </div>
            </>
          )}
        </div>
        {!finished && (
          <Button variant="primary" onClick={learn}>
            🎓 Học {lessonWords.length} từ {st.todayLeft === 0 ? 'thêm' : 'mới'}
          </Button>
        )}
        <Link to="/review">
          <Button>🔁 Ôn tập</Button>
        </Link>
      </div>

      {!compact && !finished && dailyGoalWords !== suggested && (
        <div className="mt-3 text-xs text-slate-500">
          Mục tiêu ngày hiện tại: {dailyGoalWords} lượt gõ. Theo lộ trình nên đặt ~{suggested} lượt (học mới + ôn).{' '}
          <button
            type="button"
            className="cursor-pointer text-indigo-600 hover:underline dark:text-indigo-400"
            onClick={() => {
              setSettings({ dailyGoalWords: suggested })
              toast.success(`Đã đặt mục tiêu ${suggested} lượt gõ mỗi ngày.`)
            }}
          >
            Áp dụng
          </button>
        </div>
      )}
    </Card>
  )
}

/** YYYY-MM-DD sau `days` ngày (mặc định 60). */
function defaultDate(days = 60): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
