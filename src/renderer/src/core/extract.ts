import { COMMON_WORDS } from './commonWords'

/** Một từ gợi ý học, kèm câu trong đoạn văn để làm câu ví dụ. */
export interface VocabCandidate {
  word: string
  /** Số lần xuất hiện (gộp cả dạng số nhiều). */
  count: number
  /** Câu đầu tiên chứa từ (đã rút gọn nếu quá dài). */
  sentence: string
}

const MAX_SENTENCE = 200
const TOKEN = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g

/** Các dạng số ít có thể có: studies → study, boxes → box, cats → cat. */
export function pluralBases(word: string): string[] {
  const w = word.toLowerCase()
  const out: string[] = []
  const add = (s: string): void => {
    if (s.length >= 2 && s !== w && !out.includes(s)) out.push(s)
  }
  if (w.length > 4 && w.endsWith('ies')) add(w.slice(0, -3) + 'y')
  if (w.length > 3 && /(ss|x|z|ch|sh|o)es$/.test(w)) add(w.slice(0, -2))
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) add(w.slice(0, -1))
  return out
}

/** Các dạng gốc có thể có (số nhiều, -ed, -ing), theo thứ tự nên thử khi tra từ điển. */
export function lemmaCandidates(word: string): string[] {
  const w = word.toLowerCase()
  const out = pluralBases(w)
  const add = (s: string | null): void => {
    if (s && s.length >= 2 && s !== w && !out.includes(s)) out.push(s)
  }
  const undouble = (s: string): string | null => (/([b-df-hj-np-tv-z])\1$/.test(s) ? s.slice(0, -1) : null)
  if (w.length > 4 && w.endsWith('ied')) add(w.slice(0, -3) + 'y')
  for (const suffix of ['ed', 'ing']) {
    if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
      const stem = w.slice(0, -suffix.length)
      add(stem)
      add(undouble(stem))
      add(stem + 'e')
    }
  }
  return out
}

function isCommon(w: string): boolean {
  if (COMMON_WORDS.has(w)) return true
  // Dạng số nhiều / ngôi thứ ba và quá khứ có quy tắc của từ cơ bản (needs, wanted…)
  const bases = w.endsWith('ed') ? lemmaCandidates(w) : pluralBases(w)
  return bases.some((b) => COMMON_WORDS.has(b))
}

/** Tách câu theo dấu . ! ? … hoặc xuống dòng. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…]["'”’)\]]*)\s+|\n+/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

/** Rút gọn câu dài, giữ phần quanh từ cần học. */
function clip(sentence: string, at: number, len: number): string {
  if (sentence.length <= MAX_SENTENCE) return sentence
  const half = Math.floor((MAX_SENTENCE - len) / 2)
  const start = Math.max(0, at - half)
  const end = Math.min(sentence.length, start + MAX_SENTENCE)
  return `${start > 0 ? '…' : ''}${sentence.slice(start, end).trim()}${end < sentence.length ? '…' : ''}`
}

interface Info {
  count: number
  order: number
  sentence: string
  lowerSeen: boolean
  midCapSeen: boolean
  acronym: boolean
}

/**
 * Gợi ý từ vựng đáng học trong một đoạn văn tiếng Anh (offline):
 * bỏ từ chức năng / từ rất cơ bản, tên riêng, chữ viết tắt, dạng rút gọn, từ đã có;
 * gộp số nhiều về số ít khi cả hai cùng xuất hiện. Kết quả theo thứ tự xuất hiện.
 */
export function extractVocab(
  passage: string,
  { exclude = new Set<string>(), max = 60 }: { exclude?: ReadonlySet<string>; max?: number } = {}
): VocabCandidate[] {
  const infos = new Map<string, Info>()
  let order = 0
  for (const sentence of splitSentences(passage.normalize('NFC'))) {
    let index = 0
    for (const m of sentence.matchAll(TOKEN)) {
      const first = index++ === 0
      let token = m[0]
      if (/['’]s$/i.test(token)) token = token.slice(0, -2) // sở hữu cách: company's → company
      if (/['’]/.test(token) || token.length < 3) continue
      const key = token.toLowerCase()
      let info = infos.get(key)
      if (!info) {
        info = {
          count: 0,
          order: order++,
          sentence: clip(sentence, m.index ?? 0, token.length),
          lowerSeen: false,
          midCapSeen: false,
          acronym: true
        }
        infos.set(key, info)
      }
      info.count++
      const capital = token[0] !== token[0].toLowerCase()
      if (!capital) info.lowerSeen = true
      else if (!first) info.midCapSeen = true
      if (token !== token.toUpperCase() || token.length < 2) info.acronym = false
    }
  }

  // Gộp số nhiều vào số ít nếu cả hai cùng có trong đoạn văn
  for (const [key, info] of [...infos]) {
    const base = pluralBases(key).find((b) => infos.has(b))
    if (!base) continue
    const b = infos.get(base)!
    b.count += info.count
    b.lowerSeen ||= info.lowerSeen
    if (info.order < b.order) {
      b.order = info.order
      b.sentence = info.sentence
    }
    infos.delete(key)
  }

  const isExcluded = (key: string): boolean => exclude.has(key) || pluralBases(key).some((b) => exclude.has(b))
  const picked = [...infos].filter(([key, info]) => {
    if (info.acronym && !info.lowerSeen) return false // NASA, AI
    if (info.midCapSeen && !info.lowerSeen) return false // tên riêng: London, Sarah
    return !isCommon(key) && !isExcluded(key)
  })

  let chosen = picked
  if (picked.length > max) {
    // Ưu tiên từ xuất hiện nhiều và dài hơn, rồi trả lại theo thứ tự xuất hiện
    const score = ([key, info]: [string, Info]): number => info.count * 2 + key.length / 4
    chosen = [...picked].sort((a, b) => score(b) - score(a)).slice(0, max)
  }
  return chosen
    .sort((a, b) => a[1].order - b[1].order)
    .map(([word, info]) => ({ word, count: info.count, sentence: info.sentence }))
}
