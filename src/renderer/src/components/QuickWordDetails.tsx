import { useState, type ReactNode } from 'react'
import type { DictEntry } from '@/core/lookup'
import type { AiExplanation } from '@/core/gemini'
import type { WordInfo } from '@/core/quick'
import { Button, cx } from '@/components/ui'

type Tab = 'overview' | 'senses' | 'related' | 'ai'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Tổng quan' },
  { id: 'senses', label: 'Nghĩa & ví dụ' },
  { id: 'related', label: 'Từ liên quan' },
  { id: 'ai', label: '🤖 AI' }
]

const TAB_KEY = 'quickLookup.tab'

function readTab(): Tab {
  try {
    const v = localStorage.getItem(TAB_KEY)
    return TABS.some((t) => t.id === v) ? (v as Tab) : 'overview'
  } catch {
    return 'overview'
  }
}

function saveTab(t: Tab): void {
  try {
    localStorage.setItem(TAB_KEY, t)
  } catch {
    /* bỏ qua */
  }
}

function Section({ title, children }: { title: string; children: ReactNode }): ReactNode {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Example({ en, vi }: { en: string; vi?: string }): ReactNode {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
      <div className="italic">{en}</div>
      {vi && <div className="mt-0.5 text-slate-500">{vi}</div>}
    </div>
  )
}

/** Từ bấm được để tra tiếp. */
function Chips({ words, onLookup }: { words: readonly string[]; onLookup: (w: string) => void }): ReactNode {
  return (
    <div className="flex flex-wrap gap-1.5">
      {words.map((w) => (
        <button
          key={w}
          type="button"
          onClick={() => onLookup(w)}
          className="cursor-pointer rounded-full border border-slate-200 px-2.5 py-0.5 text-sm hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/40"
          title={`Tra “${w}”`}
        >
          {w}
        </button>
      ))}
    </div>
  )
}

const Empty = ({ children }: { children: ReactNode }): ReactNode => <p className="text-sm text-slate-500">{children}</p>

export interface QuickWordDetailsProps {
  word: string
  info: WordInfo
  dict: DictEntry | null
  ai: AiExplanation | null
  aiLoading: boolean
  aiError: string
  hasKey: boolean
  onExplain: () => void
  onLookup: (word: string) => void
  onOpenSettings: () => void
}

/** Các tab nội dung của popup tra nhanh: tổng quan, các nghĩa, từ liên quan, giải thích AI. */
export default function QuickWordDetails(props: QuickWordDetailsProps): ReactNode {
  const { info, dict, ai, onLookup } = props
  const [tab, setTab] = useState<Tab>(readTab)
  const pick = (t: Tab): void => {
    setTab(t)
    saveTab(t)
  }

  return (
    <div className="mt-4">
      <div role="tablist" className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => pick(t.id)}
            className={cx(
              '-mb-px cursor-pointer border-b-2 px-2.5 py-1.5 text-sm whitespace-nowrap',
              tab === t.id
                ? 'border-indigo-500 font-medium text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="pt-3" role="tabpanel">
        {tab === 'overview' && <Overview {...props} />}

        {tab === 'senses' && (
          <>
            {ai && ai.senses.length > 0 && (
              <Section title="Các nghĩa (AI giải thích)">
                <ol className="list-decimal space-y-2 pl-5 text-sm">
                  {ai.senses.map((s, i) => (
                    <li key={i}>
                      <b>{s.meaningVi}</b> {s.pos && <span className="text-xs text-slate-500">({s.pos})</span>}
                      {s.explanationVi && <div className="text-slate-600 dark:text-slate-400">{s.explanationVi}</div>}
                    </li>
                  ))}
                </ol>
              </Section>
            )}
            {dict?.senses.length ? (
              dict.senses.map((s) => (
                <Section key={s.pos} title={s.pos || 'Nghĩa'}>
                  <ol className="list-decimal space-y-2 pl-5 text-sm">
                    {s.definitions.map((d) => (
                      <li key={d.definition}>
                        {d.definition}
                        {d.example && <div className="mt-0.5 text-slate-500 italic">“{d.example}”</div>}
                      </li>
                    ))}
                  </ol>
                </Section>
              ))
            ) : (
              !ai && <Empty>Chưa có định nghĩa từ từ điển (có thể do mất mạng). Thử tab 🤖 AI để có giải thích tiếng Việt.</Empty>
            )}
            {info.examples.length > 0 && (
              <Section title="Ví dụ">
                <div className="space-y-1.5">
                  {info.examples.map((e) => (
                    <Example key={e.en} {...e} />
                  ))}
                </div>
              </Section>
            )}
          </>
        )}

        {tab === 'related' && (
          <>
            {info.synonyms.length > 0 && (
              <Section title="≈ Đồng nghĩa">
                <Chips words={info.synonyms} onLookup={onLookup} />
              </Section>
            )}
            {info.antonyms.length > 0 && (
              <Section title="≠ Trái nghĩa">
                <Chips words={info.antonyms} onLookup={onLookup} />
              </Section>
            )}
            {(ai?.collocations.length ?? 0) > 0 ? (
              <Section title="🔗 Cụm từ hay đi kèm">
                <ul className="space-y-1 text-sm">
                  {ai!.collocations.map((c) => (
                    <li key={c.en}>
                      <b>{c.en}</b>
                      {c.vi && <span className="text-slate-500"> — {c.vi}</span>}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : (
              info.collocations.length > 0 && (
                <Section title="🔗 Cụm từ hay đi kèm">
                  <ul className="list-disc space-y-0.5 pl-5 text-sm">
                    {info.collocations.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Section>
              )
            )}
            {(ai?.family.length ?? 0) > 0 ? (
              <Section title="👪 Họ từ">
                <ul className="space-y-1 text-sm">
                  {ai!.family.map((f) => (
                    <li key={f.word}>
                      <button type="button" className="cursor-pointer font-semibold hover:underline" onClick={() => onLookup(f.word)}>
                        {f.word}
                      </button>
                      {f.pos && <span className="text-xs text-slate-500"> ({f.pos})</span>}
                      {f.meaningVi && <span className="text-slate-500"> — {f.meaningVi}</span>}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : (
              info.family.length > 0 && (
                <Section title="👪 Họ từ">
                  <Chips words={info.family} onLookup={onLookup} />
                </Section>
              )
            )}
            {!info.synonyms.length && !info.antonyms.length && !info.collocations.length && !info.family.length && (
              <Empty>Chưa có từ liên quan. Bấm “Giải thích sâu” ở tab 🤖 AI để có cụm từ và họ từ.</Empty>
            )}
          </>
        )}

        {tab === 'ai' && <AiPanel {...props} />}
      </div>
    </div>
  )
}

function Overview({ info, dict, ai, onLookup }: QuickWordDetailsProps): ReactNode {
  const firstDefs = dict?.senses.flatMap((s) => s.definitions.slice(0, 1).map((d) => ({ pos: s.pos, ...d }))).slice(0, 3) ?? []
  const hasAny = info.examples.length || firstDefs.length || info.synonyms.length || info.collocations.length || ai
  if (!hasAny) return <Empty>Chưa có thêm thông tin. Bạn có thể nhờ 🤖 AI giải thích.</Empty>
  return (
    <>
      {ai && ai.senses.length > 1 && (
        <Section title="Các nghĩa chính">
          <p className="text-sm">{ai.senses.map((s) => s.meaningVi).join(' · ')}</p>
        </Section>
      )}
      {firstDefs.length > 0 && (
        <Section title="Định nghĩa (tiếng Anh)">
          <ul className="space-y-1 text-sm">
            {firstDefs.map((d) => (
              <li key={d.definition}>
                {d.pos && <span className="mr-1 text-xs text-slate-500">({d.pos})</span>}
                {d.definition}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {info.examples.length > 0 && (
        <Section title="Ví dụ">
          <div className="space-y-1.5">
            {info.examples.slice(0, 2).map((e) => (
              <Example key={e.en} {...e} />
            ))}
          </div>
        </Section>
      )}
      {info.synonyms.length > 0 && (
        <Section title="≈ Đồng nghĩa">
          <Chips words={info.synonyms.slice(0, 4)} onLookup={onLookup} />
        </Section>
      )}
      {info.collocations.length > 0 && (
        <Section title="🔗 Cụm từ">
          <p className="text-sm">{info.collocations.slice(0, 3).join(' · ')}</p>
        </Section>
      )}
      {ai?.mnemonic && (
        <Section title="💡 Mẹo nhớ">
          <p className="text-sm">{ai.mnemonic}</p>
        </Section>
      )}
    </>
  )
}

function AiPanel({ ai, aiLoading, aiError, hasKey, onExplain, onOpenSettings, word }: QuickWordDetailsProps): ReactNode {
  if (!hasKey) {
    return (
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        <p>
          AI có thể giải thích “{word}” bằng tiếng Việt: các nghĩa, cách dùng, cụm từ, họ từ, phân biệt từ dễ nhầm, lỗi hay gặp và mẹo nhớ.
        </p>
        <p>Cần nhập Gemini API key (miễn phí) trong Cài đặt.</p>
        <Button size="sm" onClick={onOpenSettings}>
          ⚙️ Mở Cài đặt
        </Button>
      </div>
    )
  }
  if (!ai) {
    return (
      <div className="space-y-2 text-sm">
        <p className="text-slate-600 dark:text-slate-400">
          Nhờ AI giải thích sâu “{word}” bằng tiếng Việt. Chỉ gửi từ, loại từ và nghĩa lên Google Gemini.
        </p>
        <Button variant="primary" size="sm" disabled={aiLoading} onClick={onExplain}>
          {aiLoading ? 'Đang giải thích…' : '🤖 Giải thích sâu'}
        </Button>
        {aiError && <p className="text-xs text-rose-600">{aiError}</p>}
      </div>
    )
  }
  return (
    <>
      <Section title="Các nghĩa">
        <ol className="list-decimal space-y-2.5 pl-5 text-sm">
          {ai.senses.map((s, i) => (
            <li key={i}>
              <b>{s.meaningVi}</b> {s.pos && <span className="text-xs text-slate-500">({s.pos})</span>}
              {s.explanationVi && <div className="text-slate-600 dark:text-slate-400">{s.explanationVi}</div>}
              {s.example && (
                <div className="mt-1">
                  <Example en={s.example} vi={s.exampleVi} />
                </div>
              )}
            </li>
          ))}
        </ol>
      </Section>
      {ai.usage && (
        <Section title="Cách dùng">
          <p className="text-sm whitespace-pre-line">{ai.usage}</p>
        </Section>
      )}
      {ai.collocations.length > 0 && (
        <Section title="🔗 Cụm từ">
          <ul className="space-y-1 text-sm">
            {ai.collocations.map((c) => (
              <li key={c.en}>
                <b>{c.en}</b>
                {c.vi && <span className="text-slate-500"> — {c.vi}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {ai.family.length > 0 && (
        <Section title="👪 Họ từ">
          <ul className="space-y-1 text-sm">
            {ai.family.map((f) => (
              <li key={f.word}>
                <b>{f.word}</b>
                {f.pos && <span className="text-xs text-slate-500"> ({f.pos})</span>}
                {f.meaningVi && <span className="text-slate-500"> — {f.meaningVi}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {ai.confusables.length > 0 && (
        <Section title="⚖️ Phân biệt">
          <ul className="space-y-1 text-sm">
            {ai.confusables.map((c) => (
              <li key={c.word}>
                <b>{c.word}</b>: {c.differenceVi}
              </li>
            ))}
          </ul>
        </Section>
      )}
      {ai.mistakes.length > 0 && (
        <Section title="⚠️ Lỗi hay gặp">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {ai.mistakes.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Section>
      )}
      {ai.mnemonic && (
        <Section title="💡 Mẹo nhớ">
          <p className="text-sm">{ai.mnemonic}</p>
        </Section>
      )}
    </>
  )
}
