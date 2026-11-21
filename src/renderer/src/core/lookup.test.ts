import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CsvWord } from './csv'
import {
  DICT_URL,
  TRANSLATE_URL,
  autofillRows,
  cleanTranslation,
  clearLookupCache,
  lookupDictionary,
  needsLookup,
  parseDictionary,
  translateVi,
  type FillResult
} from './lookup'

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const NEGOTIATE = [
  {
    word: 'negotiate',
    phonetics: [
      { text: '/nəˈɡəʊ.ʃi.eɪt/', audio: '' },
      { text: '/nəˈɡoʊ.ʃi.eɪt/', audio: 'https://x/negotiate-us.mp3' }
    ],
    meanings: [
      {
        partOfSpeech: 'verb',
        definitions: [
          { definition: 'To confer.' },
          { definition: 'To arrange.', example: 'They had to agree first.' },
          { definition: 'To cope.', example: 'He could negotiate the curves very well.' }
        ]
      }
    ]
  }
]

const row = (word: string, extra: Partial<CsvWord> = {}): CsvWord => ({
  word,
  meaningVi: '',
  ipa: '',
  partOfSpeech: '',
  emoji: '',
  example: '',
  exampleVi: '',
  ...extra
})

/** fetch giả: từ điển có "negotiate", "deadline"; MyMemory dịch theo bảng. */
function fakeFetch(translations: Record<string, string> = {}, opts: { quota?: boolean; offline?: string[] } = {}) {
  return vi.fn(async (url: string): Promise<Response> => {
    if (url.startsWith(DICT_URL)) {
      const w = decodeURIComponent(url.slice(DICT_URL.length))
      if (opts.offline?.includes(w)) throw new TypeError('Failed to fetch')
      if (w === 'negotiate') return json(NEGOTIATE)
      // Dạng biến thể có mục riêng nhưng không có phiên âm (giống dữ liệu thật của dictionaryapi.dev)
      if (w === 'invoices' || w === 'managers') return json([{ word: w, meanings: [{ partOfSpeech: 'noun', definitions: [] }] }])
      if (w === 'prepares') return json([{ word: w, meanings: [{ partOfSpeech: 'verb', definitions: [] }] }])
      if (w === 'prepare') return json([{ word: w, phonetic: '/pɹɪˈpɛə/', meanings: [{ partOfSpeech: 'noun', definitions: [] }, { partOfSpeech: 'verb', definitions: [] }] }])
      if (w === 'invoice') return json([{ word: 'invoice', phonetic: '/ˈɪn.vɔɪs/', meanings: [{ partOfSpeech: 'noun', definitions: [] }] }])
      if (w === 'email') return json([{ word: 'email', phonetic: '/ˈiː.meɪl/', meanings: [{ partOfSpeech: 'noun', definitions: [] }] }])
      if (w === 'deadline') return json([{ word: 'deadline', phonetic: 'ˈdɛd.laɪn', meanings: [{ partOfSpeech: 'noun', definitions: [] }] }])
      return json({ title: 'No Definitions Found' }, 404)
    }
    if (url.startsWith(TRANSLATE_URL)) {
      const q = new URL(url).searchParams.get('q') ?? ''
      if (opts.offline?.includes(q)) throw new TypeError('Failed to fetch')
      if (opts.quota) return json({ responseData: { translatedText: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS' }, quotaFinished: true, responseStatus: 429 })
      return json({ responseData: { translatedText: translations[q] ?? q }, quotaFinished: false, responseStatus: 200 })
    }
    throw new Error(`URL lạ: ${url}`)
  })
}

beforeEach(() => clearLookupCache())

describe('parseDictionary', () => {
  it('lấy phiên âm Anh-Mỹ, loại từ và câu ví dụ có chứa từ', () => {
    expect(parseDictionary(NEGOTIATE, 'negotiate')).toMatchObject({
      word: 'negotiate',
      ipa: '/nəˈɡoʊ.ʃi.eɪt/',
      partOfSpeech: 'v',
      example: 'He could negotiate the curves very well.',
      definitions: ['To confer.', 'To arrange.', 'To cope.'],
      audio: { us: 'https://x/negotiate-us.mp3' }
    })
  })

  it('gộp nghĩa theo loại từ, giữ ví dụ, đồng nghĩa / trái nghĩa (bỏ trùng, bỏ chính từ đó)', () => {
    const e = parseDictionary(
      [
        {
          word: 'run',
          phonetics: [{ audio: 'https://x/run-uk.mp3' }, { audio: 'https://x/run-us.mp3' }],
          meanings: [
            {
              partOfSpeech: 'verb',
              definitions: [{ definition: 'To move fast.', example: 'Run!', synonyms: ['sprint', 'Run'] }],
              synonyms: ['sprint', 'dash'],
              antonyms: ['walk']
            },
            { partOfSpeech: 'noun', definitions: [{ definition: 'An act of running.' }, { definition: '' }] },
            { partOfSpeech: 'verb', definitions: [{ definition: 'To manage.' }] }
          ]
        }
      ],
      'run'
    )
    expect(e?.senses).toEqual([
      {
        pos: 'v',
        definitions: [{ definition: 'To move fast.', example: 'Run!' }, { definition: 'To manage.' }],
        synonyms: ['sprint', 'dash'],
        antonyms: ['walk']
      },
      { pos: 'n', definitions: [{ definition: 'An act of running.' }], synonyms: [], antonyms: [] }
    ])
    expect(e?.audio).toEqual({ us: 'https://x/run-us.mp3', uk: 'https://x/run-uk.mp3' })
  })

  it('thêm dấu / quanh phiên âm và trả null khi không có mục nào', () => {
    expect(parseDictionary([{ word: 'x', phonetic: 'eks', meanings: [] }], 'x')?.ipa).toBe('/eks/')
    expect(parseDictionary({ title: 'No Definitions Found' }, 'x')).toBeNull()
  })
})

describe('lookupDictionary', () => {
  it('không thấy thì thử dạng gốc', async () => {
    const f = fakeFetch()
    const e = await lookupDictionary('negotiating', { fetch: f })
    expect(e?.word).toBe('negotiate')
    expect(f.mock.calls.map(([u]) => decodeURIComponent(u.slice(DICT_URL.length)))).toEqual(['negotiating', 'negotiat', 'negotiate'])
  })

  it('dạng biến thể không có phiên âm: ưu tiên dạng gốc, không có dạng gốc thì giữ nguyên', async () => {
    expect(await lookupDictionary('invoices', { fetch: fakeFetch() })).toMatchObject({ word: 'invoice', ipa: '/ˈɪn.vɔɪs/' })
    expect(await lookupDictionary('managers', { fetch: fakeFetch() })).toMatchObject({ word: 'managers', ipa: '', partOfSpeech: 'n' })
    // Loại từ lấy theo dạng biến thể (động từ), không theo mục đầu của dạng gốc (danh từ)
    expect(await lookupDictionary('prepares', { fetch: fakeFetch() })).toMatchObject({ word: 'prepare', partOfSpeech: 'v' })
  })

  it('từ không có trong từ điển trả null', async () => {
    expect(await lookupDictionary('qwzxv', { fetch: fakeFetch() })).toBeNull()
  })
})

describe('translateVi / cleanTranslation', () => {
  it('viết thường như từ gốc, bỏ dấu chấm cuối, bỏ kết quả không dịch', () => {
    expect(cleanTranslation('laptop', 'Máy tính xách tay')).toBe('máy tính xách tay')
    expect(cleanTranslation('get rid of', 'từ bỏ.')).toBe('từ bỏ')
    expect(cleanTranslation('deadline', 'HẠN CHÓT')).toBe('hạn chót')
    expect(cleanTranslation('London', 'Luân Đôn')).toBe('Luân Đôn')
    expect(cleanTranslation('okay', 'Okay')).toBe('')
    expect(cleanTranslation('rock', 'rock &amp; roll')).toBe('rock & roll')
  })

  it('hết hạn mức thì ném QuotaError', async () => {
    await expect(translateVi('laptop', { fetch: fakeFetch({}, { quota: true }) })).rejects.toMatchObject({ name: 'QuotaError' })
    const f = vi.fn(async () => json({}, 429))
    await expect(translateVi('laptop', { fetch: f })).rejects.toMatchObject({ name: 'QuotaError' })
  })
})

describe('autofillRows', () => {
  const run = async (rows: CsvWord[], f: ReturnType<typeof fakeFetch>) => {
    const results: FillResult[] = []
    const summary = await autofillRows(rows, { fetch: f, onResult: (r) => results.push(r) })
    results.sort((a, b) => a.index - b.index)
    return { summary, results }
  }

  it('từ có sẵn trong app được điền offline, không gọi mạng', async () => {
    const f = fakeFetch()
    const { results } = await run([row('Cat')], f)
    expect(f).not.toHaveBeenCalled()
    expect(results[0]).toMatchObject({ status: 'builtin', patch: { meaningVi: 'con mèo', ipa: '/kæt/', partOfSpeech: 'n' } })
  })

  it('tra online: nghĩa từ MyMemory, phiên âm / loại từ / ví dụ từ từ điển, đổi về dạng gốc', async () => {
    const f = fakeFetch({ negotiate: 'Đàm phán', deadline: 'Hạn chót' })
    const { summary, results } = await run([row('negotiating'), row('deadline')], f)
    expect(summary).toEqual({ quota: false, networkErrors: 0, aborted: false })
    expect(results[0]).toMatchObject({
      status: 'online',
      patch: { word: 'negotiate', meaningVi: 'đàm phán', partOfSpeech: 'v', ipa: '/nəˈɡoʊ.ʃi.eɪt/' }
    })
    expect(results[1].patch).toEqual({ meaningVi: 'hạn chót', ipa: '/ˈdɛd.laɪn/', partOfSpeech: 'n' })
  })

  it('từ mượn (dịch ra y nguyên) vẫn có nghĩa khi từ có trong từ điển', async () => {
    const f = fakeFetch({ email: 'Email' })
    const { results } = await run([row('email'), row('qwzxv')], f)
    expect(results[0].patch.meaningVi).toBe('email')
    expect(results[1].patch.meaningVi).toBeUndefined()
  })

  it('đổi dạng biến thể về dạng gốc rồi mới dịch', async () => {
    const f = fakeFetch({ invoice: 'Hóa đơn', invoices: 'hoá đơn hợp lệ theo quy định thuế' })
    const { results } = await run([row('invoices', { example: 'Please pay the invoices.' })], f)
    expect(results[0].patch).toEqual({ word: 'invoice', meaningVi: 'hóa đơn', ipa: '/ˈɪn.vɔɪs/', partOfSpeech: 'n' })
  })

  it('trả định nghĩa để đoán chủ đề; dòng đã có nghĩa thì giữ nguyên từ, không dịch', async () => {
    const f = fakeFetch()
    const { results } = await run([row('invoices', { meaningVi: 'các hóa đơn', ipa: '/x/' })], f)
    expect(results[0].patch.word).toBeUndefined()
    expect(results[0].definitions).toBeUndefined() // mục "invoice" giả không có định nghĩa
    const neg = await run([row('negotiate', { meaningVi: 'đàm phán', ipa: '/x/' })], f)
    expect(neg.results[0].definitions).toEqual(['To confer.', 'To arrange.', 'To cope.'])
    expect(f.mock.calls.some(([u]) => u.startsWith(TRANSLATE_URL))).toBe(false)
  })

  it('không ghi đè ô đã có và không dịch lại khi đã có nghĩa', async () => {
    const f = fakeFetch()
    const { results } = await run([row('negotiate', { meaningVi: 'thương lượng', example: 'Câu của tôi.' })], f)
    expect(results[0].patch).toEqual({ ipa: '/nəˈɡoʊ.ʃi.eɪt/', partOfSpeech: 'v' })
    expect(f.mock.calls.some(([u]) => u.startsWith(TRANSLATE_URL))).toBe(false)
  })

  it('hết hạn mức dịch: dừng dịch nhưng vẫn điền phiên âm', async () => {
    const f = fakeFetch({}, { quota: true })
    const { summary, results } = await run([row('negotiate'), row('deadline')], f)
    expect(summary.quota).toBe(true)
    expect(results.every((r) => !r.patch.meaningVi && !!r.patch.ipa)).toBe(true)
    // Sau lần báo hết hạn mức đầu tiên không gọi MyMemory nữa
    expect(f.mock.calls.filter(([u]) => u.startsWith(TRANSLATE_URL)).length).toBeLessThan(2 + 1)
  })

  it('lỗi mạng ở một từ không làm hỏng các từ khác', async () => {
    const f = fakeFetch({ deadline: 'hạn chót' }, { offline: ['qwzxv'] })
    const { summary, results } = await run([row('qwzxv'), row('deadline'), row('zzzzq')], f)
    expect(summary.networkErrors).toBe(1)
    expect(results.map((r) => r.status)).toEqual(['error', 'online', 'notfound'])
    // "zzzzq" không có trong từ điển, MyMemory trả lại y nguyên → không có nghĩa
    expect(results[2].patch.meaningVi).toBeUndefined()
  })

  it('dùng bộ nhớ đệm cho từ đã tra', async () => {
    const f = fakeFetch({ deadline: 'hạn chót' })
    await run([row('deadline')], f)
    const calls = f.mock.calls.length
    await run([row('Deadline')], f)
    expect(f.mock.calls.length).toBe(calls)
  })

  it('dừng giữa chừng khi bị hủy', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    const results: FillResult[] = []
    const s = await autofillRows([row('deadline')], { fetch: fakeFetch(), signal: ctrl.signal, onResult: (r) => results.push(r) })
    expect(s.aborted).toBe(true)
    expect(results).toEqual([])
  })

  it('needsLookup: thiếu nghĩa hoặc phiên âm', () => {
    expect(needsLookup(row('a'))).toBe(true)
    expect(needsLookup(row('a', { meaningVi: 'x', ipa: '/a/' }))).toBe(false)
    expect(needsLookup(row('  '))).toBe(false)
  })
})
