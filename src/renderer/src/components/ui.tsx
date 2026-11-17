import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm shadow-indigo-600/20 disabled:bg-indigo-400 dark:disabled:bg-indigo-900',
  secondary:
    'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-500'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }): ReactNode {
  return (
    <button
      type="button"
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500',
        size === 'sm' && 'px-2.5 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }): ReactNode {
  return (
    <div
      className={cx(
        'rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800',
        className
      )}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}): ReactNode {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default'
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: string
  tone?: 'default' | 'indigo' | 'emerald' | 'amber' | 'rose'
}): ReactNode {
  const toneCls = {
    default: 'text-slate-900 dark:text-white',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
    rose: 'text-rose-600 dark:text-rose-400'
  }[tone]
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        {icon && <span className="emoji text-lg">{icon}</span>}
      </div>
      <div className={cx('mt-1 text-3xl font-bold tabular-nums', toneCls)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
    </Card>
  )
}

/** Thanh tiến độ 3 đoạn: đã thuộc / đang học / chưa học. */
export function ProgressBar({
  total,
  learned,
  mastered,
  className
}: {
  total: number
  learned: number
  mastered: number
  className?: string
}): ReactNode {
  const pct = (n: number): string => `${total > 0 ? (n / total) * 100 : 0}%`
  return (
    <div
      className={cx('flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={learned}
      title={`Đã thuộc ${mastered} · Đang học ${learned - mastered} · Chưa học ${total - learned}`}
    >
      <div className="bg-emerald-600 transition-all" style={{ width: pct(mastered) }} />
      <div className="bg-indigo-500 transition-all" style={{ width: pct(learned - mastered) }} />
    </div>
  )
}

export function Badge({
  children,
  tone = 'slate'
}: {
  children: ReactNode
  tone?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose'
}): ReactNode {
  const cls = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
  }[tone]
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', cls)}>{children}</span>
}

export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return (
    <kbd className="rounded-md border border-b-2 border-slate-300 bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
      {children}
    </kbd>
  )
}

export function EmptyState({ icon, title, children }: { icon: string; title: string; children?: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="emoji text-6xl">{icon}</div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-md text-slate-500 dark:text-slate-400">{children}</div>}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  description
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
}): ReactNode {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {description && <span className="block text-sm text-slate-500 dark:text-slate-400">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-indigo-600 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500 dark:bg-slate-700" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}

export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }): ReactNode {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** true: rộng vừa (form), "xl": rất rộng (bảng). */
  wide?: boolean | 'xl'
}): ReactNode {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'animate-pop max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900',
          wide === 'xl' ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md'
        )}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
