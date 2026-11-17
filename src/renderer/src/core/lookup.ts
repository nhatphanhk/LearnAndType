import { builtinEntities } from '@/data/builtin'
import type { CsvWord } from './csv'
import { lemmaCandidates } from './extract'
import { makeCloze } from './typing'

/**
 * Tự điền thông tin cho từ khi nhập:
 *  1. ~240 từ có sẵn trong app (offline, đủ nghĩa / phiên âm / ví dụ);
 *  2. dictionaryapi.dev — phiên âm, loại từ, câu ví dụ (miễn phí, không cần key);
 *  3. MyMemory — nghĩa tiếng Việt (miễn phí, không cần key, có hạn mức mỗi ngày).
 * Chỉ điền ô còn trống, không ghi đè dữ liệu người dùng đã có.
 */

export const DICT_URL = 'https://api.dictionaryapi.dev/api/v2/entries/en/'
export const TRANSLATE_URL = 'https://api.mymemory.translated.net/get'

export class QuotaError extends Error {
  constructor() {
    super('Hết lượt dịch miễn phí hôm nay.')
    this.name = 'QuotaError'
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

type FetchFn = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>

export interface LookupOptions {
  fetch?: FetchFn
  signal?: AbortSignal
}

export interface DictEntry {
  word: string
  ipa: string
  partOfSpeech: string
  example: string
  /** Vài định nghĩa tiếng Anh đầu tiên — dùng để đoán chủ đề, không lưu. */
  definitions: string[]
}

export function isAbort(e: unknown): boolean {
  return (e as { name?: string } | null)?.name === 'AbortError'
}

/* ------------------------------ Từ có sẵn ------------------------------ */

let builtinIndex: Map<string, { data: CsvWord; topicId: string }> | null = null

function builtinEntry(word: string): { data: CsvWord; topicId: string } | null {
  if (!builtinIndex) {
    builtinIndex = new Map(
      builtinEntities().words.map((w) => [
        w.word.toLowerCase(),
        {
          topicId: w.topicId,
          data: {
            word: w.word,
            meaningVi: w.meaningVi,
            ipa: w.ipa,
            partOfSpeech: w.partOfSpeech,
            emoji: w.emoji,
            example: w.example,
            exampleVi: w.exampleVi
          }
        }
      ])
    )
  }
  return builtinIndex.get(word.trim().toLowerCase()) ?? null
}

export function lookupBuiltin(word: string): CsvWord | null {
  return builtinEntry(word)?.data ?? null
}

/** Id chủ đề có sẵn chứa từ này (animals, food…), nếu có. */
export function builtinTopicOf(word: string): string | null {
  return builtinEntry(word)?.topicId ?? null
}

/* ------------------------------- Gọi mạng ------------------------------- */

async function getJson(url: string, opts: LookupOptions): Promise<{ status: number; data: unknown }> {
  const f: FetchFn = opts.fetch ?? ((u, init) => fetch(u, init))
  let res: Response
  try {
    res = await f(url, { signal: opts.signal })
  } catch (e) {
    if (isAbort(e)) throw e
    throw new NetworkError('Không kết nối được máy chủ.')
  }
  if (res.status === 404 || res.status === 403 || res.status === 429) return { status: res.status, data: null }
  if (!res.ok) throw new NetworkError(`Máy chủ báo lỗi ${res.status}.`)
  try {
    return { status: res.status, data: await res.json() }
  } catch (e) {
    if (isAbort(e)) throw e
    throw new NetworkError('Phản hồi không hợp lệ.')
  }
}

/* ------------------------------ Từ điển Anh ------------------------------ */

const POS_MAP: Record<string, string> = {
  noun: 'n',
  verb: 'v',
  adjective: 'adj',
  adverb: 'adv',
  preposition: 'prep',
  pronoun: 'pron',
  conjunction: 'conj'
}

interface ApiEntry {
  word?: string
  phonetic?: string
  phonetics?: { text?: string; audio?: string }[]
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string; example?: string }[] }[]
}

const MAX_DEFINITIONS = 5

export function parseDictionary(data: unknown, fallbackWord: string): DictEntry | null {
  const entries = (Array.isArray(data) ? data : []) as ApiEntry[]
  if (entries.length === 0) return null
  const word = entries[0].word?.trim() || fallbackWord
  const phonetics = entries.flatMap((e) => e.phonetics ?? []).filter((p) => p.text?.trim())
  // Ưu tiên phiên âm Anh-Mỹ (giống dữ liệu có sẵn), rồi đến phiên âm chung
  let ipa =
    phonetics.find((p) => /-us\.mp3$/i.test(p.audio ?? ''))?.text ??
    entries.find((e) => e.phonetic?.trim())?.phonetic ??
    phonetics[0]?.text ??
    ''
  ipa = ipa.trim()
  if (ipa && !/^[/[]/.test(ipa)) ipa = `/${ipa}/`
  const meanings = entries.flatMap((e) => e.meanings ?? [])
  let partOfSpeech = ''
  for (const m of meanings) {
    const pos = POS_MAP[m.partOfSpeech?.toLowerCase() ?? '']
    if (pos) {
      partOfSpeech = pos
      break
    }
  }
  if (!partOfSpeech && /\s/.test(word)) partOfSpeech = 'phr'
  const defs = meanings.flatMap((m) => m.definitions ?? [])
  // Câu ví dụ phải chứa từ để dùng được chế độ Điền vào câu
  const example = defs.map((d) => d.example?.trim() ?? '').find((ex) => ex && makeCloze(ex, word) !== null) ?? ''
  const definitions = defs
    .map((d) => d.definition?.trim() ?? '')
    .filter(Boolean)
    .slice(0, MAX_DEFINITIONS)
  return { word, ipa, partOfSpeech, example, definitions }
}

/**
 * Tra từ; không thấy thì thử dạng gốc (studies → study, negotiating → negotiate).
 * Dạng biến thể (prepares, invoices) có mục riêng trong từ điển nhưng thường không có phiên âm —
 * khi đó ưu tiên dạng gốc nếu tra được, không thì dùng mục của dạng biến thể.
 */
export async function lookupDictionary(word: string, opts: LookupOptions = {}): Promise<DictEntry | null> {
  const w = word.trim().toLowerCase()
  const lemmas = /\s/.test(w) ? [] : lemmaCandidates(w)
  const tries = [w, ...lemmas].slice(0, 4)
  let inflected: DictEntry | null = null
  for (const t of tries) {
    const { status, data } = await getJson(DICT_URL + encodeURIComponent(t), opts)
    if (status === 403 || status === 429) throw new NetworkError('Từ điển đang giới hạn số lần tra, hãy thử lại sau.')
    if (status === 404) continue
    const entry = parseDictionary(data, t)
    if (!entry) continue
    if (t === w && !entry.ipa && lemmas.length > 0) {
      inflected = entry
      continue
    }
    // Loại từ của dạng biến thể sát ngữ cảnh hơn (prepares → động từ, dù mục "prepare" mở đầu bằng danh từ)
    return inflected?.partOfSpeech ? { ...entry, partOfSpeech: inflected.partOfSpeech } : entry
  }
  return inflected
}

/* --------------------------------- Dịch nghĩa --------------------------------- */

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Chuẩn hóa kết quả dịch: bỏ dấu chấm cuối, viết thường như từ gốc.
 * Kết quả giống hệt từ gốc bị bỏ (không dịch được), trừ khi `allowSame` — từ mượn như "email".
 */
export function cleanTranslation(source: string, raw: string, allowSame = false): string {
  let t = decodeEntities(raw).normalize('NFC').trim().replace(/[.。]+$/, '').trim()
  if (!t || (!allowSame && t.toLowerCase() === source.trim().toLowerCase())) return ''
  if (source === source.toLowerCase()) {
    t = t === t.toUpperCase() ? t.toLowerCase() : t.charAt(0).toLowerCase() + t.slice(1)
  }
  return t
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string }
  responseStatus?: number | string
  quotaFinished?: boolean
}

/** Dịch Anh → Việt. `allowSame`: giữ kết quả giống hệt từ gốc (từ mượn). */
export async function translateVi(text: string, opts: LookupOptions & { allowSame?: boolean } = {}): Promise<string> {
  const url = `${TRANSLATE_URL}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent('en|vi')}`
  const { status, data } = await getJson(url, opts)
  if (status === 403 || status === 429) throw new QuotaError()
  const d = (data ?? {}) as MyMemoryResponse
  const translated = d.responseData?.translatedText ?? ''
  const code = Number(d.responseStatus)
  if (d.quotaFinished || code === 403 || code === 429 || /MYMEMORY WARNING/i.test(translated)) throw new QuotaError()
  if (code !== 200) return ''
  return cleanTranslation(text, translated, opts.allowSame)
}

/* --------------------------------- Tự điền --------------------------------- */

export type FillStatus = 'builtin' | 'online' | 'notfound' | 'error'

export interface FillResult {
  /** Vị trí trong mảng `rows` truyền vào. */
  index: number
  status: FillStatus
  /** Chỉ gồm các trường đang trống (và `word` nếu đã đổi về dạng gốc). */
  patch: Partial<CsvWord>
  /** Định nghĩa tiếng Anh từ từ điển (để đoán chủ đề). */
  definitions?: string[]
}

export interface AutofillOptions extends LookupOptions {
  concurrency?: number
  onResult?: (r: FillResult) => void
}

export interface AutofillSummary {
  /** Đã hết hạn mức dịch MyMemory. */
  quota: boolean
  /** Số từ không tra được vì lỗi mạng. */
  networkErrors: number
  aborted: boolean
}

/** Từ cần tra: chưa có nghĩa hoặc chưa có phiên âm. */
export function needsLookup(row: Pick<CsvWord, 'word' | 'meaningVi' | 'ipa'>): boolean {
  return !!row.word.trim() && (!row.meaningVi.trim() || !row.ipa.trim())
}

function onlyEmpty(row: CsvWord, data: Partial<CsvWord>): Partial<CsvWord> {
  const patch: Partial<CsvWord> = {}
  for (const k of ['meaningVi', 'ipa', 'partOfSpeech', 'emoji', 'example', 'exampleVi'] as const) {
    const v = data[k]?.trim()
    if (v && !row[k]?.trim()) patch[k] = v
  }
  return patch
}

const dictCache = new Map<string, DictEntry | null>()
const transCache = new Map<string, string>()

export function clearLookupCache(): void {
  dictCache.clear()
  transCache.clear()
}

interface FillState {
  quota: boolean
  networkErrors: number
}

async function fillOne(row: CsvWord, state: FillState, opts: LookupOptions): Promise<Omit<FillResult, 'index'>> {
  const word = row.word.trim()
  const builtin = lookupBuiltin(word)
  if (builtin) return { status: 'builtin', patch: onlyEmpty(row, builtin) }

  let failed = false
  let entry: DictEntry | null = null
  const key = word.toLowerCase()
  try {
    if (dictCache.has(key)) entry = dictCache.get(key)!
    else {
      entry = await lookupDictionary(word, opts)
      dictCache.set(key, entry)
    }
  } catch (e) {
    if (isAbort(e)) throw e
    failed = true
  }

  // Đã đổi về dạng gốc (negotiating → negotiate): dùng dạng gốc cho cả nghĩa.
  // Dòng đã có nghĩa (VD: CSV đầy đủ, chỉ tra để phân loại) thì giữ nguyên từ để khớp với nghĩa.
  const head = entry && entry.word.toLowerCase() !== key && !row.meaningVi.trim() ? entry.word : null
  const headBuiltin = head ? lookupBuiltin(head) : null
  if (head && headBuiltin) return { status: 'builtin', patch: { word: head, ...onlyEmpty(row, headBuiltin) } }

  let meaningVi = row.meaningVi.trim()
  if (!meaningVi && !state.quota) {
    const source = head ?? word
    const tkey = source.toLowerCase()
    try {
      // Bộ đệm giữ cả kết quả giống từ gốc; chỉ nhận nó làm nghĩa khi từ có trong từ điển (từ mượn: email)
      let t = transCache.get(tkey)
      if (t === undefined) {
        t = await translateVi(source, { ...opts, allowSame: true })
        transCache.set(tkey, t)
      }
      meaningVi = !entry && t.toLowerCase() === source.toLowerCase() ? '' : t
    } catch (e) {
      if (isAbort(e)) throw e
      if (e instanceof QuotaError) state.quota = true
      else failed = true
    }
  }

  if (failed) state.networkErrors++
  const patch = onlyEmpty(row, {
    meaningVi,
    ipa: entry?.ipa,
    partOfSpeech: entry?.partOfSpeech || (/\s/.test(word) ? 'phr' : ''),
    example: entry?.example
  })
  if (head) patch.word = head
  const found = !!entry || !!meaningVi
  return {
    status: found ? 'online' : failed ? 'error' : 'notfound',
    patch,
    ...(entry?.definitions.length ? { definitions: entry.definitions } : {})
  }
}

/** Tra song song (mặc định 3 từ một lúc), báo kết quả từng từ qua `onResult`. */
export async function autofillRows(rows: readonly CsvWord[], opts: AutofillOptions = {}): Promise<AutofillSummary> {
  const state: FillState = { quota: false, networkErrors: 0 }
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < rows.length) {
      if (opts.signal?.aborted) return
      const index = next++
      let result: Omit<FillResult, 'index'>
      try {
        result = await fillOne(rows[index], state, opts)
      } catch (e) {
        if (isAbort(e)) return
        state.networkErrors++
        result = { status: 'error', patch: {} }
      }
      if (opts.signal?.aborted) return
      opts.onResult?.({ index, ...result })
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 3, rows.length)) }, worker))
  return { ...state, aborted: !!opts.signal?.aborted }
}
