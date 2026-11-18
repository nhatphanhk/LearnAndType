import { beforeEach, describe, expect, it } from 'vitest'
import { GEMINI_MODELS, GeminiError, classifyWithGemini, geminiErrorMessage, resetGeminiState } from './gemini'

const topics = [
  { key: 'new:law', label: '⚖️ Pháp luật & xã hội' },
  { key: 'topic:custom-1', label: 'Khoa học' }
]
const words = [
  { word: 'verdict', meaningVi: 'phán quyết' },
  { word: 'photosynthesis', meaningVi: 'quang hợp' },
  { word: 'however', meaningVi: 'tuy nhiên' }
]

const reply = (arr: unknown, status = 200): Response =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(arr) }] } }] }), { status })

describe('classifyWithGemini', () => {
  beforeEach(() => resetGeminiState())
  const noSleep = async (): Promise<void> => undefined
  const model = (url: string): string => /models\/([^:]+):/.exec(url)![1]

  it('ánh xạ id chủ đề về khóa, "none" và id lạ thành null, gửi key qua header', async () => {
    const calls: { url: string; init: RequestInit }[] = []
    const res = await classifyWithGemini(words, topics, {
      apiKey: ' KEY ',
      fetch: async (url, init) => {
        calls.push({ url, init })
        return reply([
          { i: 0, topic: 't0' },
          { i: 1, topic: 't1' },
          { i: 2, topic: 'none' },
          { i: 9, topic: 't0' },
          { i: 1, topic: 't7' }
        ])
      }
    })
    expect(res).toEqual(['new:law', 'topic:custom-1', null])
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('gemini-flash-lite-latest:generateContent')
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('KEY')
    const body = JSON.parse(String(calls[0].init.body))
    expect(body.generationConfig.responseSchema.items.properties.topic.enum).toEqual(['t0', 't1', 'none'])
    expect(body.systemInstruction.parts[0].text).toContain('t0: ⚖️ Pháp luật & xã hội')
  })

  it('model đầu quá tải (503) thì chuyển sang model dự phòng', async () => {
    const urls: string[] = []
    const res = await classifyWithGemini(words.slice(0, 1), topics, {
      apiKey: 'k',
      sleep: noSleep,
      fetch: async (url) => {
        urls.push(url)
        return urls.length === 1 ? new Response('busy', { status: 503 }) : reply([{ i: 0, topic: 't0' }])
      }
    })
    expect(res).toEqual(['new:law'])
    expect(model(urls[1])).toBe(GEMINI_MODELS[1])
  })

  it('thử hết chuỗi model, cả vòng quá tải thì chờ rồi thử vòng 2; nhớ model chạy được cho lần sau', async () => {
    const urls: string[] = []
    const sleeps: number[] = []
    const ok = GEMINI_MODELS[3]
    const opts = {
      apiKey: 'k',
      sleep: async (ms: number) => void sleeps.push(ms),
      fetch: async (url: string) => {
        urls.push(url)
        // Vòng 1: mọi model 503 / 404; vòng 2: model thứ 4 chạy được
        const round2 = urls.length > GEMINI_MODELS.length
        if (round2 && model(url) === ok) return reply([{ i: 0, topic: 't0' }])
        return new Response('x', { status: model(url) === GEMINI_MODELS[2] ? 404 : 503 })
      }
    }
    expect(await classifyWithGemini(words.slice(0, 1), topics, opts)).toEqual(['new:law'])
    expect(urls.slice(0, GEMINI_MODELS.length).map(model)).toEqual([...GEMINI_MODELS])
    expect(sleeps).toHaveLength(1)
    // Lần sau: gọi model vừa chạy được trước tiên
    urls.length = 0
    await classifyWithGemini(words.slice(0, 1), topics, { ...opts, fetch: async (url: string) => (urls.push(url), reply([{ i: 0, topic: 't1' }])) })
    expect(urls.map(model)).toEqual([ok])
  })

  it('mọi model lỗi cả 2 vòng thì ném lỗi unavailable', async () => {
    let n = 0
    const p = classifyWithGemini(words, topics, { apiKey: 'k', sleep: noSleep, fetch: async () => (n++, new Response('x', { status: 503 })) })
    await expect(p).rejects.toMatchObject({ kind: 'unavailable' })
    expect(n).toBe(GEMINI_MODELS.length * 2)
  })

  it('key sai thì dừng ngay, không thử model khác', async () => {
    let n = 0
    const p = classifyWithGemini(words, topics, {
      apiKey: 'bad',
      fetch: async () => {
        n++
        return new Response('{"error":{"status":"INVALID_ARGUMENT","message":"API key not valid"}}', { status: 400 })
      }
    })
    await expect(p).rejects.toMatchObject({ kind: 'auth' })
    expect(n).toBe(1)
  })

  it('chia lô khi nhiều từ và không gọi mạng khi không có key / không có từ', async () => {
    const many = Array.from({ length: 85 }, (_, i) => ({ word: `w${i}`, meaningVi: 'x' }))
    let n = 0
    const res = await classifyWithGemini(many, topics, {
      apiKey: 'k',
      fetch: async (_u, init) => {
        n++
        const items = JSON.parse(JSON.parse(String(init.body)).contents[0].parts[0].text) as { i: number }[]
        return reply(items.map((x) => ({ i: x.i, topic: 't1' })))
      }
    })
    expect(n).toBe(3)
    expect(res).toHaveLength(85)
    expect(res.every((x) => x === 'topic:custom-1')).toBe(true)
    await expect(classifyWithGemini(words, topics, { apiKey: '  ' })).rejects.toBeInstanceOf(GeminiError)
    expect(await classifyWithGemini([], topics, { apiKey: 'k' })).toEqual([])
  })

  it('có thông báo tiếng Việt cho từng loại lỗi', () => {
    expect(geminiErrorMessage(new GeminiError('x', 'quota'))).toMatch(/hạn mức/)
    expect(geminiErrorMessage(new GeminiError('x', 'auth'))).toMatch(/API key/)
  })
})
