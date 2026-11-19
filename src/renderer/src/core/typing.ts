export type CharState = 'correct' | 'wrong' | 'pending' | 'extra'

export interface CharCell {
  char: string
  state: CharState
}

const APOSTROPHES = /[‘’ʼ`´]/g
const DASHES = /[‐-―]/g

/** Chuẩn hóa chuỗi để so sánh: bỏ khoảng trắng thừa, thống nhất dấu nháy/gạch ngang, không phân biệt hoa thường. */
export function normalize(input: string, caseSensitive = false): string {
  const s = input
    .normalize('NFC')
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return caseSensitive ? s : s.toLowerCase()
}

/** Chuẩn hóa một ký tự đơn (dùng khi so sánh từng phím gõ). */
function normChar(c: string, caseSensitive: boolean): string {
  const n = c.replace(APOSTROPHES, "'").replace(DASHES, '-')
  return caseSensitive ? n : n.toLowerCase()
}

export function charsEqual(a: string, b: string, caseSensitive = false): boolean {
  return normChar(a, caseSensitive) === normChar(b, caseSensitive)
}

export function isMatch(target: string, typed: string, caseSensitive = false): boolean {
  return normalize(target, caseSensitive) === normalize(typed, caseSensitive)
}

/** So sánh từng ký tự giữa đáp án và chuỗi đang gõ để tô màu. */
export function compareChars(target: string, typed: string, caseSensitive = false): CharCell[] {
  const cells: CharCell[] = []
  for (let i = 0; i < target.length; i++) {
    if (i >= typed.length) {
      cells.push({ char: target[i], state: 'pending' })
    } else {
      cells.push({
        char: target[i],
        state: charsEqual(target[i], typed[i], caseSensitive) ? 'correct' : 'wrong'
      })
    }
  }
  for (let i = target.length; i < typed.length; i++) {
    cells.push({ char: typed[i], state: 'extra' })
  }
  return cells
}

/** Số ký tự sai (kể cả thiếu/thừa) giữa đáp án và câu trả lời cuối cùng. */
export function countMistakes(target: string, typed: string, caseSensitive = false): number {
  const t = normalize(target, caseSensitive)
  const u = normalize(typed, caseSensitive)
  let mistakes = Math.abs(t.length - u.length)
  const n = Math.min(t.length, u.length)
  for (let i = 0; i < n; i++) if (t[i] !== u[i]) mistakes++
  return mistakes
}

/**
 * Phân loại phím vừa gõ: ký tự mới thêm vào ở vị trí `index` có khớp với đáp án không.
 * Trả về null nếu không phải thao tác thêm ký tự (xóa, dán nhiều ký tự...).
 */
export function classifyKeystroke(
  target: string,
  prev: string,
  next: string,
  caseSensitive = false
): { correct: number; wrong: number } | null {
  if (next.length <= prev.length || !next.startsWith(prev)) return null
  let correct = 0
  let wrong = 0
  for (let i = prev.length; i < next.length; i++) {
    if (i < target.length && charsEqual(target[i], next[i], caseSensitive)) correct++
    else wrong++
  }
  return { correct, wrong }
}

/**
 * Các phím gõ sai trong lần thêm ký tự này, dạng "chữ đúng>chữ đã gõ" (ví dụ "e>i").
 * Ký tự gõ thừa sau cuối đáp án được ghi là ">x".
 */
export function wrongKeyPairs(target: string, prev: string, next: string, caseSensitive = false): string[] {
  if (next.length <= prev.length || !next.startsWith(prev)) return []
  const out: string[] = []
  for (let i = prev.length; i < next.length; i++) {
    if (i < target.length && charsEqual(target[i], next[i], caseSensitive)) continue
    out.push(`${i < target.length ? target[i].toLowerCase() : ''}>${next[i].toLowerCase()}`)
  }
  return out
}

/** Gợi ý: giữ phần đầu đã gõ đúng rồi thêm 1 ký tự tiếp theo của đáp án. */
export function nextHint(target: string, typed: string, caseSensitive = false): string {
  let i = 0
  while (i < typed.length && i < target.length && charsEqual(target[i], typed[i], caseSensitive)) i++
  return target.slice(0, Math.min(i + 1, target.length))
}

/** WPM chuẩn: 5 ký tự = 1 từ. */
export function calcWpm(chars: number, ms: number): number {
  if (ms < 1000 || chars <= 0) return 0
  return Math.round(chars / 5 / (ms / 60000))
}

export function calcAccuracy(correctKeys: number, totalKeys: number): number {
  if (totalKeys <= 0) return 100
  return Math.round((correctKeys / totalKeys) * 100)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export interface Cloze {
  before: string
  after: string
  /** Hậu tố biến đổi được giữ lại sau chỗ trống, vd "cat" trong "cats" → "s". */
  suffix: string
}

/**
 * Tạo câu điền từ: tìm từ (hoặc dạng có hậu tố s/es/ed/d/ing) trong câu ví dụ và thay bằng chỗ trống.
 * Trả về null nếu câu không chứa từ.
 */
export function makeCloze(sentence: string, word: string): Cloze | null {
  const w = word.trim()
  if (!sentence || !w) return null
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escapeRegExp(w)})(s|es|ed|d|ing)?(?![\\p{L}\\p{N}])`, 'iu')
  const m = re.exec(sentence)
  if (!m) return null
  const start = m.index + m[1].length
  const end = start + m[2].length
  const suffix = m[3] ?? ''
  return {
    before: sentence.slice(0, start),
    after: sentence.slice(end + suffix.length),
    suffix
  }
}
