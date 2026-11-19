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
