import { lemmaCandidates } from './extract'

/**
 * Chủ đề theo WordNet (offline): ~70 nghìn từ / cụm 2 chữ → id chủ đề mẫu (core/classify.ts).
 * Sinh bằng `npm run build:wordnet` (scripts/build-wordnet-topics.mjs); file JSON ~1 MB nên tải lười.
 */

export type WordnetTopics = ReadonlyMap<string, string>

export interface WordnetFile {
  c: string[]
  w: Record<string, number>
}

export function parseWordnetFile(data: WordnetFile): WordnetTopics {
  const m = new Map<string, string>()
  for (const [word, i] of Object.entries(data.w)) {
    const t = data.c[i]
    if (t) m.set(word, t)
  }
  return m
}

let loading: Promise<WordnetTopics> | null = null

/** Tải một lần (chunk riêng, không làm chậm lúc mở app). */
export function loadWordnetTopics(): Promise<WordnetTopics> {
  loading ??= import('@/data/wordnet-topics.json').then((mod) => parseWordnetFile((mod.default ?? mod) as WordnetFile))
  loading.catch(() => (loading = null))
  return loading
}

export interface WordnetHit {
  topic: string
  /** Khớp cả từ / cụm (hoặc dạng gốc) hay chỉ khớp chữ cuối của cụm. */
  exact: boolean
}

/** Chủ đề của từ: nguyên dạng → dạng gốc (số nhiều, -ed, -ing) → chữ cuối của cụm nhiều chữ. */
export function wordnetTopicOf(map: WordnetTopics, word: string): WordnetHit | null {
  const w = word.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!w) return null
  const direct = map.get(w)
  if (direct) return { topic: direct, exact: true }
  const parts = w.split(' ')
  if (parts.length === 1 || parts.length === 2) {
    // Dạng gốc của chữ cuối (credit cards → credit card, studies → study)
    const head = parts.slice(0, -1).join(' ')
    for (const base of lemmaCandidates(parts[parts.length - 1])) {
      const t = map.get(head ? `${head} ${base}` : base)
      if (t) return { topic: t, exact: true }
    }
  }
  if (parts.length > 1) {
    const last = parts[parts.length - 1]
    for (const cand of [last, ...lemmaCandidates(last)]) {
      const t = map.get(cand)
      if (t) return { topic: t, exact: false }
    }
  }
  return null
}
