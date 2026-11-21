/**
 * Phân loại từ vựng vào chủ đề bằng Gemini — chỉ dùng cho những từ bộ phân loại offline không đoán được.
 * Gửi lên Google: từ tiếng Anh, nghĩa tiếng Việt, vài định nghĩa (nếu có) và danh sách tên chủ đề.
 */

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
/**
 * Thử lần lượt (quá tải tính theo từng model, nên càng nhiều model dự phòng càng bền).
 * Model lite nhanh, rẻ đứng trước; model không còn tồn tại (404) tự bị bỏ qua.
 */
export const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-3.5-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest'
] as const
const BATCH_SIZE = 40
const TIMEOUT_MS = 20_000
/** Số vòng thử toàn bộ danh sách model khi tất cả đều quá tải. */
const ROUNDS = 2
const RETRY_DELAY_MS = 2_000

/** Model chạy được gần nhất trong phiên — lần sau gọi trước. */
let preferredModel: string | null = null

/** Chỉ dùng trong test. */
export function resetGeminiState(): void {
  preferredModel = null
}
const NONE = 'none'

type FetchFn = (url: string, init: RequestInit) => Promise<Response>

export interface AiTopicOption {
  /** Khóa đích (targetKey) — trả lại đúng khóa này. */
  key: string
  label: string
}

export interface AiWord {
  word: string
  meaningVi: string
  definitions?: readonly string[]
}

export interface GeminiOptions {
  apiKey: string
  signal?: AbortSignal
  fetch?: FetchFn
  models?: readonly string[]
  /** Chờ giữa các vòng thử (thay được trong test). */
  sleep?: (ms: number) => Promise<void>
}

export type GeminiErrorKind = 'auth' | 'quota' | 'unavailable' | 'bad-response'

export class GeminiError extends Error {
  constructor(
    message: string,
    readonly kind: GeminiErrorKind
  ) {
    super(message)
    this.name = 'GeminiError'
  }
}

/** Thông báo tiếng Việt cho lỗi Gemini. */
export function geminiErrorMessage(e: unknown): string {
  if (e instanceof GeminiError) {
    switch (e.kind) {
      case 'auth':
        return 'Gemini API key không hợp lệ hoặc không có quyền — kiểm tra lại trong Cài đặt.'
      case 'quota':
        return 'Đã hết hạn mức Gemini (quota) — thử lại sau.'
      case 'unavailable':
        return 'Gemini đang quá tải hoặc không kết nối được — thử lại sau.'
      default:
        return 'Gemini trả về kết quả không đọc được.'
    }
  }
  return e instanceof Error ? e.message : String(e)
}

function buildRequest(words: readonly AiWord[], topics: readonly AiTopicOption[]): unknown {
  const ids = topics.map((_, i) => `t${i}`)
  const topicList = topics.map((t, i) => `${ids[i]}: ${t.label}`).join('\n')
  const items = words.map((w, i) => ({
    i,
    word: w.word,
    meaning: w.meaningVi,
    ...(w.definitions?.length ? { definitions: w.definitions.slice(0, 2) } : {})
  }))
  return {
    systemInstruction: {
      parts: [
        {
          text:
            'You sort English vocabulary (with Vietnamese meanings) into learning topics. ' +
            'For each word pick the single topic id that best fits its meaning. ' +
            `Use "${NONE}" only when no topic is a reasonable fit (e.g. function words like "however"). ` +
            `Topics:\n${topicList}`
        }
      ]
    },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(items) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { i: { type: 'INTEGER' }, topic: { type: 'STRING', enum: [...ids, NONE] } },
          required: ['i', 'topic']
        }
      }
    }
  }
}

async function callModel(model: string, body: unknown, opts: GeminiOptions): Promise<string> {
  const f: FetchFn = opts.fetch ?? ((u, init) => fetch(u, init))
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  let res: Response
  try {
    res = await f(`${ENDPOINT}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify(body),
      signal: opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout
    })
  } catch (e) {
    if (opts.signal?.aborted) throw e
    throw new GeminiError('network', 'unavailable')
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const text = await res.text().catch(() => '')
    // 400 cũng dùng cho yêu cầu sai; chỉ coi là lỗi key khi Google nói vậy
    if (res.status !== 400 || /API[_ ]KEY|api key|PERMISSION|UNAUTHENTICATED/i.test(text)) {
      throw new GeminiError('auth', 'auth')
    }
    throw new GeminiError(`bad request: ${text.slice(0, 200)}`, 'bad-response')
  }
  if (res.status === 429) throw new GeminiError('quota', 'quota')
  if (res.status === 404 || res.status >= 500) throw new GeminiError(`HTTP ${res.status}`, 'unavailable')
  if (!res.ok) throw new GeminiError(`HTTP ${res.status}`, 'bad-response')
  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  } | null
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new GeminiError('empty', 'bad-response')
  return text
}

const defaultSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    })
  })

/**
 * Gọi các model lần lượt (model chạy được gần nhất đứng đầu): quá tải / hết quota / không tồn tại thì chuyển model sau;
 * cả vòng đều lỗi thì chờ rồi thử thêm vòng nữa. Key sai thì dừng ngay.
 */
async function generate(body: unknown, opts: GeminiOptions): Promise<string> {
  const base = opts.models ?? GEMINI_MODELS
  const order = preferredModel && base.includes(preferredModel) ? [preferredModel, ...base.filter((m) => m !== preferredModel)] : [...base]
  const sleep = opts.sleep ?? ((ms: number) => defaultSleep(ms, opts.signal))
  let last: unknown = null
  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) {
      await sleep(RETRY_DELAY_MS * round)
      if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    }
    for (const model of order) {
      try {
        const text = await callModel(model, body, opts)
        preferredModel = model
        return text
      } catch (e) {
        if (opts.signal?.aborted || (e instanceof GeminiError && e.kind === 'auth')) throw e
        last = e
      }
    }
  }
  throw last ?? new GeminiError('no model', 'unavailable')
}

function parseAnswer(text: string, count: number, topics: readonly AiTopicOption[]): (string | null)[] {
  let arr: unknown
  try {
    arr = JSON.parse(text)
  } catch {
    throw new GeminiError('json', 'bad-response')
  }
  if (!Array.isArray(arr)) throw new GeminiError('not array', 'bad-response')
  const out: (string | null)[] = Array.from({ length: count }, () => null)
  for (const item of arr as { i?: unknown; topic?: unknown }[]) {
    const i = typeof item?.i === 'number' ? item.i : -1
    const m = typeof item?.topic === 'string' ? /^t(\d+)$/.exec(item.topic) : null
    if (i < 0 || i >= count || !m) continue
    const t = topics[Number(m[1])]
    if (t) out[i] = t.key
  }
  return out
}

/**
 * Phân loại `words` vào một trong `topics`. Trả về khóa chủ đề cho từng từ (cùng thứ tự), null nếu AI không chọn.
 * Gửi theo lô; lỗi ở một lô làm cả lần gọi thất bại (ném GeminiError).
 */
export async function classifyWithGemini(
  words: readonly AiWord[],
  topics: readonly AiTopicOption[],
  opts: GeminiOptions
): Promise<(string | null)[]> {
  if (!opts.apiKey.trim()) throw new GeminiError('no key', 'auth')
  if (words.length === 0 || topics.length === 0) return words.map(() => null)
  const out: (string | null)[] = []
  for (let start = 0; start < words.length; start += BATCH_SIZE) {
    const batch = words.slice(start, start + BATCH_SIZE)
    const text = await generate(buildRequest(batch, topics), { ...opts, apiKey: opts.apiKey.trim() })
    out.push(...parseAnswer(text, batch.length, topics))
  }
  return out
}

export interface AiExamGuess {
  /** Cấp độ CEFR ước lượng (null nếu AI không trả). */
  cefr: string | null
  /** Khóa chủ đề thi phù hợp, null = không thuộc chủ đề thi nào. */
  topic: string | null
}

const CEFR_ENUM = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

/**
 * Ước lượng cấp độ CEFR và chủ đề luyện thi (TOEIC / IELTS) cho các từ không có trong bảng cấp độ / gói thi.
 * Gửi lên Google: từ tiếng Anh, nghĩa tiếng Việt và danh sách tên chủ đề thi.
 */
export async function classifyExamWithGemini(
  words: readonly AiWord[],
  topics: readonly AiTopicOption[],
  opts: GeminiOptions
): Promise<AiExamGuess[]> {
  if (!opts.apiKey.trim()) throw new GeminiError('no key', 'auth')
  if (words.length === 0) return []
  const ids = topics.map((_, i) => `t${i}`)
  const topicList = topics.map((t, i) => `${ids[i]}: ${t.label}`).join('\n')
  const out: AiExamGuess[] = []
  for (let start = 0; start < words.length; start += BATCH_SIZE) {
    const batch = words.slice(start, start + BATCH_SIZE)
    const body = {
      systemInstruction: {
        parts: [
          {
            text:
              'You label English vocabulary (with Vietnamese meanings) for learners preparing for TOEIC and IELTS. ' +
              'For each word give its CEFR level (as in the Oxford 3000/5000 or English Vocabulary Profile) and the single ' +
              `exam topic id it is most useful for. Use "${NONE}" when the word is not typical of any listed exam topic ` +
              `(e.g. everyday words like animals or fruit). Topics:\n${topicList}`
          }
        ]
      },
      contents: [
        { role: 'user', parts: [{ text: JSON.stringify(batch.map((w, i) => ({ i, word: w.word, meaning: w.meaningVi }))) }] }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              i: { type: 'INTEGER' },
              cefr: { type: 'STRING', enum: CEFR_ENUM },
              topic: { type: 'STRING', enum: [...ids, NONE] }
            },
            required: ['i', 'cefr', 'topic']
          }
        }
      }
    }
    const text = await generate(body, { ...opts, apiKey: opts.apiKey.trim() })
    let arr: unknown
    try {
      arr = JSON.parse(text)
    } catch {
      throw new GeminiError('json', 'bad-response')
    }
    if (!Array.isArray(arr)) throw new GeminiError('not array', 'bad-response')
    const res: AiExamGuess[] = batch.map(() => ({ cefr: null, topic: null }))
    for (const item of arr as { i?: unknown; cefr?: unknown; topic?: unknown }[]) {
      const i = typeof item?.i === 'number' ? item.i : -1
      if (i < 0 || i >= batch.length) continue
      const cefr = typeof item.cefr === 'string' && CEFR_ENUM.includes(item.cefr) ? item.cefr : null
      const m = typeof item.topic === 'string' ? /^t(\d+)$/.exec(item.topic) : null
      res[i] = { cefr, topic: m ? (topics[Number(m[1])]?.key ?? null) : null }
    }
    out.push(...res)
  }
  return out
}

/** Kiểm tra nhanh key (dùng ở Cài đặt). */
export async function testGeminiKey(apiKey: string, fetchFn?: FetchFn): Promise<void> {
  const r = await classifyWithGemini(
    [{ word: 'verdict', meaningVi: 'phán quyết' }],
    [
      { key: 'law', label: 'Law & society' },
      { key: 'food', label: 'Food & drink' }
    ],
    { apiKey, fetch: fetchFn }
  )
  if (r.length !== 1) throw new GeminiError('test', 'bad-response')
}

/* ------------------------------ Giải thích từ (tra nhanh) ------------------------------ */

export interface AiExplanation {
  senses: { pos: string; meaningVi: string; explanationVi: string; example: string; exampleVi: string }[]
  /** Cách dùng / cấu trúc, VD "deal with + N". */
  usage: string
  collocations: { en: string; vi: string }[]
  family: { word: string; pos: string; meaningVi: string }[]
  /** Phân biệt với từ dễ nhầm. */
  confusables: { word: string; differenceVi: string }[]
  /** Lỗi người Việt hay gặp. */
  mistakes: string[]
  /** Mẹo nhớ. */
  mnemonic: string
}

export interface ExplainInput {
  word: string
  pos?: string
  meaningVi?: string
  definitions?: readonly string[]
}

const STR = { type: 'STRING' } as const
const EXPLAIN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    senses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { pos: STR, meaningVi: STR, explanationVi: STR, example: STR, exampleVi: STR },
        required: ['pos', 'meaningVi', 'explanationVi', 'example', 'exampleVi']
      }
    },
    usage: STR,
    collocations: { type: 'ARRAY', items: { type: 'OBJECT', properties: { en: STR, vi: STR }, required: ['en', 'vi'] } },
    family: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { word: STR, pos: STR, meaningVi: STR }, required: ['word', 'pos', 'meaningVi'] }
    },
    confusables: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { word: STR, differenceVi: STR }, required: ['word', 'differenceVi'] }
    },
    mistakes: { type: 'ARRAY', items: STR },
    mnemonic: STR
  },
  required: ['senses', 'usage', 'collocations', 'family', 'confusables', 'mistakes', 'mnemonic']
}

const MAX_TEXT = 400
const clip = (v: unknown, max = MAX_TEXT): string => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '')

function objects<T>(v: unknown, max: number, pick: (o: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(v)) return []
  const out: T[] = []
  for (const item of v) {
    if (!item || typeof item !== 'object') continue
    const r = pick(item as Record<string, unknown>)
    if (r) out.push(r)
    if (out.length >= max) break
  }
  return out
}

/** Đọc và cắt gọn kết quả AI (bỏ mục thiếu dữ liệu). */
export function parseExplanation(text: string): AiExplanation {
  let o: unknown
  try {
    o = JSON.parse(text)
  } catch {
    throw new GeminiError('json', 'bad-response')
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new GeminiError('not object', 'bad-response')
  const d = o as Record<string, unknown>
  const res: AiExplanation = {
    senses: objects(d.senses, 4, (s) => {
      const meaningVi = clip(s.meaningVi, 120)
      return meaningVi
        ? { pos: clip(s.pos, 20), meaningVi, explanationVi: clip(s.explanationVi), example: clip(s.example, 200), exampleVi: clip(s.exampleVi, 200) }
        : null
    }),
    usage: clip(d.usage),
    collocations: objects(d.collocations, 8, (c) => {
      const en = clip(c.en, 80)
      return en ? { en, vi: clip(c.vi, 120) } : null
    }),
    family: objects(d.family, 8, (f) => {
      const word = clip(f.word, 40)
      return word ? { word, pos: clip(f.pos, 20), meaningVi: clip(f.meaningVi, 120) } : null
    }),
    confusables: objects(d.confusables, 4, (c) => {
      const word = clip(c.word, 40)
      const differenceVi = clip(c.differenceVi)
      return word && differenceVi ? { word, differenceVi } : null
    }),
    mistakes: (Array.isArray(d.mistakes) ? d.mistakes : []).map((m) => clip(m)).filter(Boolean).slice(0, 4),
    mnemonic: clip(d.mnemonic)
  }
  if (res.senses.length === 0) throw new GeminiError('no senses', 'bad-response')
  return res
}

const explainCache = new Map<string, AiExplanation>()

/**
 * Giải thích sâu một từ bằng tiếng Việt cho người học (nghĩa, cách dùng, cụm từ, họ từ, phân biệt, lỗi hay gặp, mẹo nhớ).
 * Gửi lên Google: từ, loại từ, nghĩa tiếng Việt và tối đa 2 định nghĩa tiếng Anh. Kết quả được đệm trong phiên.
 */
export async function explainWordWithGemini(input: ExplainInput, opts: GeminiOptions): Promise<AiExplanation> {
  if (!opts.apiKey.trim()) throw new GeminiError('no key', 'auth')
  const key = input.word.trim().toLowerCase()
  const hit = explainCache.get(key)
  if (hit) return hit
  const body = {
    systemInstruction: {
      parts: [
        {
          text:
            'You are an English teacher for Vietnamese learners (TOEIC / IELTS). Explain the given English word so the learner ' +
            'truly understands and remembers it. Write every explanation in natural Vietnamese; keep example sentences in English ' +
            'with a Vietnamese translation. Give the 1-4 most common senses (most common first), the key grammar pattern(s) in ' +
            '"usage", 3-6 common collocations, the word family (other parts of speech), 1-3 easily confused words with the difference, ' +
            '1-3 typical mistakes Vietnamese learners make, and one short memorable mnemonic. Use short part-of-speech labels ' +
            '(n, v, adj, adv, phr). Leave arrays empty rather than inventing rare items.'
        }
      ]
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: JSON.stringify({
              word: input.word.trim(),
              ...(input.pos ? { pos: input.pos } : {}),
              ...(input.meaningVi?.trim() ? { meaning: input.meaningVi.trim() } : {}),
              ...(input.definitions?.length ? { definitions: input.definitions.slice(0, 2) } : {})
            })
          }
        ]
      }
    ],
    generationConfig: { temperature: 0.3, responseMimeType: 'application/json', responseSchema: EXPLAIN_SCHEMA }
  }
  const res = parseExplanation(await generate(body, { ...opts, apiKey: opts.apiKey.trim() }))
  explainCache.set(key, res)
  return res
}

/** Chỉ dùng trong test. */
export function clearExplainCache(): void {
  explainCache.clear()
}
