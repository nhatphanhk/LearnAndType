import type { Attempt } from '@/types'
import { normalize } from './typing'

export type MistakeKind =
  | 'forgot'
  | 'suffix'
  | 'ie-ei'
  | 'double-letter'
  | 'silent-letter'
  | 'transposition'
  | 'vowel'
  | 'missing'
  | 'extra'
  | 'other'

export const MISTAKE_INFO: Record<MistakeKind, { label: string; hint: string }> = {
  forgot: { label: 'Quên từ', hint: 'Bỏ trống hoặc gõ khác hẳn đáp án.' },
  suffix: { label: 'Sai đuôi từ', hint: 'Nhầm -tion/-sion, -ance/-ence, -able/-ible, -er/-or…' },
  'ie-ei': { label: 'Nhầm ie / ei', hint: 'Ví dụ: recieve → receive.' },
  'double-letter': { label: 'Chữ đôi', hint: 'Thiếu hoặc thừa chữ cái đôi, ví dụ: adress → address.' },
  'silent-letter': { label: 'Chữ câm', hint: 'Bỏ sót chữ không đọc, ví dụ: nife → knife, lisen → listen.' },
  transposition: { label: 'Đảo chữ', hint: 'Hai chữ cạnh nhau bị đảo chỗ, ví dụ: freind → friend.' },
  vowel: { label: 'Nhầm nguyên âm', hint: 'Gõ sai a/e/i/o/u, ví dụ: seperate → separate.' },
  missing: { label: 'Thiếu chữ', hint: 'Thiếu một chữ cái.' },
  extra: { label: 'Thừa chữ', hint: 'Thừa một chữ cái.' },
  other: { label: 'Lỗi khác', hint: 'Sai nhiều chữ cái.' }
}

/** Thứ tự hiển thị. */
export const MISTAKE_ORDER: MistakeKind[] = [
  'forgot',
  'suffix',
  'ie-ei',
  'double-letter',
  'silent-letter',
  'transposition',
  'vowel',
  'missing',
  'extra',
  'other'
]

const VOWELS = new Set('aeiouy')

const SUFFIX_PAIRS: [string, string][] = [
  ['tion', 'sion'],
  ['ance', 'ence'],
  ['ant', 'ent'],
  ['able', 'ible'],
  ['ary', 'ery'],
  ['er', 'or'],
  ['ise', 'ize'],
  ['ful', 'full'],
  ['ly', 'lly'],
  ['cy', 'sy']
]

/** Chữ ở vị trí `i` của `w` có phải chữ câm thường gặp không. */
function isSilentAt(w: string, i: number): boolean {
  const c = w[i]
  const prev = w[i - 1] ?? ''
  const next = w[i + 1] ?? ''
  switch (c) {
    case 'k':
      return next === 'n' && i === 0 // knife, know
    case 'w':
      return next === 'r' || (next === 'h' && w[i + 2] === 'o') // write, who
    case 'b':
      return prev === 'm' || next === 't' // climb, doubt
    case 'h':
      return prev === 'g' || prev === 'r' || prev === 'w' || (i === 0 && 'oe'.includes(next)) // ghost, rhyme, what, hour
    case 'e':
      return i === w.length - 1 && w.length > 2 // make
    case 't':
      return (prev === 's' && (next === 'l' || next === 'e' || next === 'n')) || next === 'c' // listen, castle, watch
    case 'n':
      return prev === 'm' && i === w.length - 1 // autumn
    case 'p':
      return i === 0 && 'snt'.includes(next) // psychology, pneumonia
    case 'l':
      return 'aou'.includes(prev) && 'kmdf'.includes(next) // walk, calm, could, half
    case 'g':
      return next === 'n' || next === 'h' // sign, night
    case 'u':
      return prev === 'g' && 'eiy'.includes(next) // guess, guitar
    case 'c':
      return prev === 's' && 'eiy'.includes(next) // science
    case 'd':
      return next === 'g' // bridge
    default:
      return false
  }
}

/** Vị trí `i` sao cho bỏ `long[i]` thì được `short`; -1 nếu không có. Trả về mọi vị trí hợp lệ. */
function deletionPositions(long: string, short: string): number[] {
  if (long.length !== short.length + 1) return []
  const out: number[] = []
  for (let i = 0; i < long.length; i++) {
    if (long.slice(0, i) + long.slice(i + 1) === short) out.push(i)
  }
  return out
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

/** Phân loại câu trả lời sai `typed` so với đáp án `target` thành một kiểu lỗi chính. */
export function classifyMistake(target: string, typed: string): MistakeKind {
  const t = normalize(target)
  const u = normalize(typed)
  if (u === t) return 'other'
  if (u.length === 0) return 'forgot'
  const dist = editDistance(t, u)
  if (dist > Math.max(2, Math.ceil(t.length / 2))) return 'forgot'

  for (const [a, b] of SUFFIX_PAIRS) {
    for (const [x, y] of [
      [a, b],
      [b, a]
    ]) {
      if (t.endsWith(x) && u === t.slice(0, t.length - x.length) + y) return 'suffix'
    }
  }

  if (t.length === u.length) {
    for (let i = 0; i < t.length - 1; i++) {
      const pair = t.slice(i, i + 2)
      if ((pair === 'ie' || pair === 'ei') && u === t.slice(0, i) + pair[1] + pair[0] + t.slice(i + 2)) return 'ie-ei'
    }
  }

  // Thiếu chữ đôi (address → adress) hoặc thừa chữ đôi (until → untill)
  const missing = deletionPositions(t, u)
  if (missing.some((i) => t[i] === t[i - 1] || t[i] === t[i + 1])) return 'double-letter'
  const extra = deletionPositions(u, t)
  if (extra.some((i) => u[i] === u[i - 1] || u[i] === u[i + 1])) return 'double-letter'

  if (missing.some((i) => isSilentAt(t, i))) return 'silent-letter'

  if (t.length === u.length) {
    const diff: number[] = []
    for (let i = 0; i < t.length; i++) if (t[i] !== u[i]) diff.push(i)
    if (diff.length === 2 && diff[1] === diff[0] + 1 && t[diff[0]] === u[diff[1]] && t[diff[1]] === u[diff[0]]) {
      return 'transposition'
    }
    if (diff.length > 0 && diff.every((i) => VOWELS.has(t[i]) && VOWELS.has(u[i]))) return 'vowel'
  }

  if (missing.length > 0) return 'missing'
  if (extra.length > 0) return 'extra'
  return 'other'
}

export interface MistakeGroup {
  kind: MistakeKind
  count: number
  /** Các từ mắc lỗi này, sắp theo số lần sai giảm dần. */
  wordIds: string[]
  /** Một ví dụ gần nhất: đáp án và câu đã gõ. */
  example?: { wordId: string; typed: string }
}

export interface KeyMistake {
  /** Chữ đúng ('' nếu gõ thừa sau cuối từ). */
  expected: string
  typed: string
  count: number
}

export interface MistakeReport {
  /** Số lượt sai có ghi lại câu trả lời. */
  total: number
  groups: MistakeGroup[]
  /** Các cặp phím hay gõ nhầm nhất (tối đa 10). */
  keys: KeyMistake[]
}

/** Tổng hợp lỗi từ các lượt gõ. `targetOf` trả về đáp án của từ (undefined nếu từ đã bị xóa). */
export function mistakeReport(
  attempts: readonly Attempt[],
  targetOf: (wordId: string) => string | undefined
): MistakeReport {
  interface Acc {
    count: number
    perWord: Map<string, number>
    example?: MistakeGroup['example']
    at: number
  }
  const groups = new Map<MistakeKind, Acc>()
  const keys = new Map<string, number>()
  let total = 0
  for (const a of attempts) {
    for (const k of a.wrongKeys ?? []) keys.set(k, (keys.get(k) ?? 0) + 1)
    if (a.correct || a.answer === undefined) continue
    const target = targetOf(a.wordId)
    if (target === undefined) continue
    total++
    const kind = classifyMistake(target, a.answer)
    const g: Acc = groups.get(kind) ?? { count: 0, perWord: new Map<string, number>(), at: -1 }
    g.count++
    g.perWord.set(a.wordId, (g.perWord.get(a.wordId) ?? 0) + 1)
    if (a.at >= g.at) {
      g.at = a.at
      g.example = { wordId: a.wordId, typed: a.answer }
    }
    groups.set(kind, g)
  }
  return {
    total,
    groups: MISTAKE_ORDER.flatMap((kind) => {
      const g = groups.get(kind)
      if (!g) return []
      const wordIds = [...g.perWord.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).map(([id]) => id)
      return [{ kind, count: g.count, wordIds, example: g.example }]
    }).sort((x, y) => y.count - x.count),
    keys: [...keys.entries()]
      .map(([pair, count]) => {
        const [expected, typed] = pair.split('>')
        return { expected, typed: typed ?? '', count }
      })
      .filter((k) => k.typed !== '')
      .sort((x, y) => y.count - x.count || (x.expected + x.typed).localeCompare(y.expected + y.typed))
      .slice(0, 10)
  }
}
