import Papa from 'papaparse'
import {
  BULLET,
  STRONG_SEPARATORS,
  looksLikeHeader,
  parseWordsCsv,
  rowCollector,
  splitLine,
  type CsvWord
} from './csv'

/**
 * Nhập thông minh (offline): đọc danh sách từ "lộn xộn" — cột bị đảo, phiên âm, loại từ,
 * câu ví dụ, dòng chỉ có từ tiếng Anh, dòng Anh/Việt xen kẽ, bảng copy từ Excel không có tên cột.
 * Từ chưa có nghĩa vẫn được giữ lại (nghĩa rỗng) để tra sau.
 */
export interface SmartParseResult {
  rows: CsvWord[]
  errors: string[]
  /** Số từ chưa có nghĩa tiếng Việt (cần tra hoặc tự nhập). */
  needsMeaning: number
}

/* ------------------------------ Nhận dạng ô ------------------------------ */

const VI_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i
const IPA_CHARS = /[əɪʊʃʒθðŋæɑɔɜʌɒˈˌːɚɝɐɛɡʔɹɾʧʤ]/
const LATIN_RE = /[A-Za-z]/

export function hasVietnamese(s: string): boolean {
  return VI_RE.test(s)
}

const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length

/** Ô chỉ chứa phiên âm: /…/ hoặc […] (ngoặc vuông phải có ký tự IPA). */
function isIpaCell(s: string): boolean {
  const t = s.trim()
  if (/^\/[^/]+\/$/.test(t)) return IPA_CHARS.test(t) || !/\s/.test(t)
  if (/^\[[^\]]+\]$/.test(t)) return IPA_CHARS.test(t)
  return false
}

const POS_ALIASES: Record<string, string> = {
  n: 'n',
  noun: 'n',
  'danh từ': 'n',
  v: 'v',
  vt: 'v',
  verb: 'v',
  'động từ': 'v',
  adj: 'adj',
  a: 'adj',
  adjective: 'adj',
  'tính từ': 'adj',
  adv: 'adv',
  adverb: 'adv',
  'trạng từ': 'adv',
  'phó từ': 'adv',
  prep: 'prep',
  preposition: 'prep',
  'giới từ': 'prep',
  pron: 'pron',
  pronoun: 'pron',
  'đại từ': 'pron',
  conj: 'conj',
  conjunction: 'conj',
  'liên từ': 'conj',
  phr: 'phr',
  phrase: 'phr',
  'phr v': 'phr',
  phrv: 'phr',
  'phrasal verb': 'phr',
  idiom: 'phr',
  'cụm từ': 'phr',
  'cụm động từ': 'phr',
  'thành ngữ': 'phr'
}

/** "(n)", "v.", "noun", "danh từ", "n/v" → khóa của POS_LABEL; không nhận ra thì undefined. */
export function normalizePos(token: string): string | undefined {
  const parts = token
    .toLowerCase()
    .replace(/^\(|\)$/g, '')
    .split(/[/,;&]/)
    .map((p) => p.replace(/\./g, ' ').trim().replace(/\s+/g, ' '))
    .filter(Boolean)
  if (parts.length === 0) return undefined
  const mapped = parts.map((p) => POS_ALIASES[p])
  return mapped.every(Boolean) ? mapped[0] : undefined
}

function isEnglishSentence(s: string): boolean {
  const t = s.trim()
  if (!t || hasVietnamese(t) || !LATIN_RE.test(t)) return false
  const n = wordCount(t)
  return n >= 6 || (n >= 3 && /[.!?]["')\]]?$/.test(t))
}

type CellKind = 'empty' | 'ipa' | 'pos' | 'en' | 'enSentence' | 'vi' | 'viSentence' | 'other'

function cellKind(c: string): CellKind {
  const t = c.trim()
  if (!t) return 'empty'
  if (isIpaCell(t)) return 'ipa'
  if (normalizePos(t)) return 'pos'
  const n = wordCount(t)
  const ends = /[.!?]["')\]]?$/.test(t)
  if (hasVietnamese(t)) return (ends && n >= 3) || n >= 8 ? 'viSentence' : 'vi'
  if (!LATIN_RE.test(t)) return 'other'
  return (ends && n >= 3) || n >= 6 ? 'enSentence' : 'en'
}

/* --------------------------- Phiên âm & loại từ trong dòng --------------------------- */

/** Ký tự đánh dấu chỗ đã lấy ra phiên âm / loại từ (dùng như một dấu ngăn cách). */
const MARK = '\u0001'
const stripQuotes = (s: string): string => s.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()

function noSeparator(s: string): boolean {
  return !s.includes('\t') && !STRONG_SEPARATORS.some((sep) => s.includes(sep))
}

/** Phần đứng trước là "từ tiếng Anh" (chưa sang phần nghĩa). */
function isEnglishHead(s: string): boolean {
  const t = s.split(MARK).join(' ').trim()
  return t !== '' && LATIN_RE.test(t) && !hasVietnamese(t) && noSeparator(s) && !t.includes(',')
}

interface Inline {
  text: string
  ipa: string
  pos: string
}

function takeIpa(text: string): { start: number; end: number; value: string } | null {
  const re = /(^|[\s(])(\/[^/\n]{1,60}\/|\[[^\]\n]{1,60}\])(?=$|[\s),.:;=|–—-])/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const token = m[2]
    const ok = token.startsWith('[') ? IPA_CHARS.test(token) : IPA_CHARS.test(token) || !/\s/.test(token)
    if (ok) {
      const start = m.index + m[1].length
      return { start, end: start + token.length, value: token }
    }
  }
  return null
}

const POS_ABBR = /^([^\u0001]*?[A-Za-z][^\u0001]*?)\s+(n|v|adj|adv|prep|pron|conj|phr)\.(?=\s|$)/i

function takePos(text: string): { start: number; end: number; value: string } | null {
  const re = /\(([^()\n]{1,24})\)/g
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const value = normalizePos(m[1])
    if (!value) continue
    const before = text.slice(0, m.index)
    const after = text.slice(m.index + m[0].length)
    // Chỉ lấy loại từ đứng ngay sau từ tiếng Anh hoặc ở cuối dòng — tránh cắt nhầm nghĩa.
    if (isEnglishHead(before) || after.split(MARK).join('').trim() === '') {
      return { start: m.index, end: m.index + m[0].length, value }
    }
  }
  const a = POS_ABBR.exec(text)
  if (a && isEnglishHead(a[1])) {
    const start = a[0].length - a[2].length - 1
    return { start, end: a[0].length, value: normalizePos(a[2])! }
  }
  return null
}

function extractInline(line: string): Inline {
  let text = line
  let ipa = ''
  let pos = ''
  const i = takeIpa(text)
  if (i) {
    ipa = i.value
    text = text.slice(0, i.start) + MARK + text.slice(i.end)
  }
  const p = takePos(text)
  if (p) {
    pos = p.value
    text = text.slice(0, p.start) + MARK + text.slice(p.end)
  }
  return { text, ipa, pos }
}

/** Tách dòng đã đánh dấu: phiên âm / loại từ ngay sau từ tiếng Anh cũng đóng vai dấu ngăn cách. */
function splitMarked(text: string): string[] {
  const at = text.indexOf(MARK)
  if (at >= 0) {
    const head = text.slice(0, at)
    const tail = text.slice(at).split(MARK).join(' ')
    if (isEnglishHead(head) && tail.trim()) return [head, tail.replace(/^[\s:=|,\-–—]+/, '')]
  }
  return splitLine(text.split(MARK).join(' ').replace(/ {2,}/g, ' '))
}

/** Tách vế nghĩa thành [nghĩa, câu ví dụ tiếng Anh] nếu phần sau là một câu tiếng Anh. */
function splitExample(meaning: string): [string, string] {
  const parts = splitLine(meaning)
  if (parts.length >= 2) {
    const rest = parts.slice(1).join(' ').trim()
    if (parts[0].trim() && isEnglishSentence(rest)) return [parts[0].trim(), rest]
  }
  return [meaning.trim(), '']
}

/* ------------------------------- Chế độ bảng ------------------------------- */

function detectTable(text: string, lines: string[]): { rows: string[][]; delimiter: string } | null {
  const share = (ch: string): number => lines.filter((l) => l.includes(ch)).length / lines.length
  // "apple, banana, cherry" toàn tiếng Anh là danh sách nhiều từ, không phải bảng.
  const plainEnglish = !lines.some((l) => hasVietnamese(l) || IPA_CHARS.test(l))
  for (const delimiter of ['\t', ';', '|', ',']) {
    if (share(delimiter) < (delimiter === '\t' ? 0.6 : 0.9)) continue
    if (plainEnglish && (delimiter === ',' || delimiter === ';')) continue
    const parsed = Papa.parse<string[]>(text, { delimiter, skipEmptyLines: false })
    const rows = parsed.data.filter((r) => r.some((c) => c.trim() !== ''))
    if (rows.length === 0) continue
    if (delimiter === '\t') return { rows: parsed.data, delimiter }
    // Các dấu khác: số cột phải đều nhau, dấu phẩy cần ít nhất 3 cột (nghĩa hay chứa dấu phẩy).
    const counts = new Map<number, number>()
    rows.forEach((r) => counts.set(r.length, (counts.get(r.length) ?? 0) + 1))
    const [len, n] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (len >= (delimiter === ',' ? 3 : 2) && n / rows.length >= 0.9) return { rows: parsed.data, delimiter }
  }
  return null
}

function majorityKind(cells: string[]): CellKind {
  const counts = new Map<CellKind, number>()
  for (const c of cells) {
    const k = cellKind(c)
    if (k !== 'empty') counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  let best: CellKind = 'empty'
  let max = 0
  counts.forEach((n, k) => {
    if (n > max) {
      best = k
      max = n
    }
  })
  return best
}

function parseTable(rows: string[][], errors: string[]): CsvWord[] {
  const width = Math.max(...rows.map((r) => r.length))
  const kinds = Array.from({ length: width }, (_, c) => majorityKind(rows.map((r) => r[c] ?? '')))
  const used = new Set<number>()
  const pick = (...want: CellKind[]): number => {
    for (const k of want) {
      const i = kinds.findIndex((kind, idx) => kind === k && !used.has(idx))
      if (i >= 0) {
        used.add(i)
        return i
      }
    }
    return -1
  }
  let wordCol = pick('en')
  if (wordCol < 0) wordCol = pick('other', 'vi', 'enSentence')
  const meaningCol = pick('vi', 'viSentence', 'en')
  const ipaCol = pick('ipa')
  const posCol = pick('pos')
  const exampleCol = pick('enSentence')
  const exampleViCol = pick('viSentence')
  // Cột tiếng Việt còn thừa (VD: "desk, cái bàn, bàn làm việc") gộp vào nghĩa.
  const extraVi = kinds.flatMap((k, i) => (k === 'vi' && !used.has(i) ? [i] : []))

  const c = rowCollector(errors, { allowEmptyMeaning: true })
  rows.forEach((r, idx) => {
    if (!r.some((cell) => cell.trim())) return
    const cell = (i: number): string => (i >= 0 ? stripQuotes(r[i] ?? '') : '')
    let word = cell(wordCol)
    let meaning = [cell(meaningCol), ...extraVi.map(cell)].filter(Boolean).join(', ')
    // Dòng lẻ bị đảo cột
    if (hasVietnamese(word) && meaning && !hasVietnamese(meaning)) [word, meaning] = [meaning, word]
    const inline = extractInline(word)
    word = stripQuotes(inline.text.split(MARK).join(' '))
    const ipaCell = cell(ipaCol)
    const posCell = cell(posCol)
    c.add(idx + 1, {
      word,
      meaningVi: meaning,
      ipa: ipaCell || inline.ipa,
      partOfSpeech: (posCell && normalizePos(posCell)) || inline.pos,
      example: cell(exampleCol),
      exampleVi: cell(exampleViCol)
    })
  })
  return c.rows
}

/* ------------------------------- Chế độ dòng ------------------------------- */

interface LineParts {
  line: number
  left: string
  right: string
  extra: string[]
  ipa: string
  pos: string
}

function parseLines(lines: { no: number; text: string }[], errors: string[]): CsvWord[] {
  const c = rowCollector(errors, { allowEmptyMeaning: true })
  const docHasVi = lines.some((l) => hasVietnamese(l.text))

  // Không có dấu ngăn cách nào, dòng Anh / dòng Việt xen kẽ (copy từ flashcard)
  if (docHasVi && lines.length >= 2 && lines.every((l) => noSeparator(l.text))) {
    const vi = lines.map((l) => hasVietnamese(l.text))
    for (const enFirst of [true, false]) {
      let pairs = 0
      let ok = 0
      for (let i = 0; i + 1 < lines.length; i += 2) {
        pairs++
        if (enFirst ? !vi[i] && vi[i + 1] : vi[i] && !vi[i + 1]) ok++
      }
      if (pairs > 0 && ok / pairs >= 0.8) {
        for (let i = 0; i < lines.length; i += 2) {
          const [en, vn] = enFirst ? [lines[i], lines[i + 1]] : [lines[i + 1], lines[i]]
          if (!en) {
            errors.push(`Dòng ${lines[i].no}: không thấy từ tiếng Anh đi kèm, đã bỏ qua.`)
            continue
          }
          const inline = extractInline(en.text)
          c.add(en.no, {
            word: stripQuotes(inline.text.split(MARK).join(' ')),
            meaningVi: vn?.text.trim() ?? '',
            ipa: inline.ipa,
            partOfSpeech: inline.pos
          })
        }
        return c.rows
      }
    }
  }

  const parsed: LineParts[] = []
  for (const { no, text } of lines) {
    const inline = extractInline(text)
    const parts = splitMarked(inline.text).map((p) => p.split(MARK).join(' ').trim())
    const [left = '', right = '', ...extra] = parts
    // Toàn tiếng Anh, không có dấu ngăn cách mạnh: "laptop, meeting, deadline" là nhiều từ
    if (!docHasVi && noSeparator(inline.text) && /[,;]/.test(inline.text)) {
      const many = inline.text
        .split(MARK)
        .join(' ')
        .split(/[,;]/)
        .map(stripQuotes)
        .filter(Boolean)
      if (many.every((w) => wordCount(w) <= 4)) {
        many.forEach((w) => parsed.push({ line: no, left: w, right: '', extra: [], ipa: '', pos: '' }))
        continue
      }
    }
    parsed.push({ line: no, left, right, extra, ipa: inline.ipa, pos: inline.pos })
  }

  // Hướng cột cả danh sách: đa số dòng "nghĩa - từ" thì đảo cả những dòng không rõ
  let swapped = 0
  let normal = 0
  for (const p of parsed) {
    if (!p.right) continue
    const l = hasVietnamese(p.left)
    const r = hasVietnamese(p.right)
    if (l && !r) swapped++
    if (!l && r) normal++
  }
  const docSwap = swapped > normal

  for (const p of parsed) {
    let { left, right } = p
    if (right) {
      const l = hasVietnamese(left)
      const r = hasVietnamese(right)
      if ((l && !r) || (docSwap && l === r)) [left, right] = [right, left]
    }
    left = stripQuotes(left)
    if (!left) {
      errors.push(`Dòng ${p.line}: không thấy từ, đã bỏ qua.`)
      continue
    }
    if (!right) {
      if (hasVietnamese(left)) {
        errors.push(`Dòng ${p.line}: không thấy từ tiếng Anh, đã bỏ qua.`)
        continue
      }
      if (wordCount(left) > 6 || left.length > 60) {
        errors.push(`Dòng ${p.line}: dòng quá dài — nếu là đoạn văn, hãy dùng "Trích từ đoạn văn".`)
        continue
      }
    }
    let ipa = p.ipa
    let example = ''
    // Cột thứ 3+ (copy bảng có tab nhưng không đủ để vào chế độ bảng)
    for (const x of p.extra) {
      if (!ipa && isIpaCell(x)) ipa = x.trim()
      else if (!example && isEnglishSentence(x)) example = x.trim()
    }
    let meaning = right
    if (!example) [meaning, example] = splitExample(right)
    c.add(p.line, { word: left, meaningVi: meaning, ipa, partOfSpeech: p.pos, example })
  }
  return c.rows
}

/* --------------------------------- Đầu vào --------------------------------- */

export function parseSmart(input: string): SmartParseResult {
  const text = input.replace(/^﻿/, '').normalize('NFC')
  const raw = text.split(/\r?\n/)
  const first = raw.find((l) => l.trim() !== '')
  if (first === undefined) return { rows: [], errors: [], needsMeaning: 0 }

  let result: { rows: CsvWord[]; errors: string[] }
  if (looksLikeHeader(first, true)) {
    result = parseWordsCsv(text, { allowEmptyMeaning: true })
  } else {
    const errors: string[] = []
    const lines = raw.flatMap((l, i) => (l.trim() ? [{ no: i + 1, text: l.replace(BULLET, '') }] : []))
    const table = detectTable(text, lines.map((l) => l.text))
    const rows = table ? parseTable(table.rows, errors) : parseLines(lines, errors)
    result = { rows, errors }
  }
  return { ...result, needsMeaning: result.rows.filter((r) => !r.meaningVi).length }
}
