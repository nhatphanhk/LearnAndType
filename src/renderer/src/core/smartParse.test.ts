import { describe, expect, it } from 'vitest'
import { normalizePos, parseSmart } from './smartParse'

const pairs = (text: string): string[][] => parseSmart(text).rows.map((w) => [w.word, w.meaningVi])

describe('parseSmart – các dạng dán quen thuộc', () => {
  it('đọc nhiều kiểu dấu ngăn cách', () => {
    const r = parseSmart(
      [
        'laptop - máy tính xách tay',
        'meeting: cuộc họp',
        'deadline = hạn chót',
        'printer | máy in',
        'desk, cái bàn, bàn làm việc',
        'email – thư điện tử'
      ].join('\n')
    )
    expect(r.errors).toEqual([])
    expect(r.needsMeaning).toBe(0)
    expect(r.rows.map((w) => [w.word, w.meaningVi])).toEqual([
      ['laptop', 'máy tính xách tay'],
      ['meeting', 'cuộc họp'],
      ['deadline', 'hạn chót'],
      ['printer', 'máy in'],
      ['desk', 'cái bàn, bàn làm việc'],
      ['email', 'thư điện tử']
    ])
    expect(r.rows.every((w) => w.emoji === '' && w.imageUrl === undefined)).toBe(true)
  })

  it('chọn dấu ngăn cách xuất hiện sớm nhất, giữ từ có gạch nối', () => {
    expect(pairs('well-known - nổi tiếng\nrun: chạy - động từ\nice cream - kem: món tráng miệng\n')).toEqual([
      ['well-known', 'nổi tiếng'],
      ['run', 'chạy - động từ'],
      ['ice cream', 'kem: món tráng miệng']
    ])
  })

  it('bỏ đánh số, gạch đầu dòng, dòng trống và CRLF', () => {
    const r = parseSmart('1. cat - con mèo\r\n2) dog - con chó\r\n\r\n- bird - con chim\r\n• fish: con cá\r\n')
    expect(r.errors).toEqual([])
    expect(r.rows.map((w) => w.word)).toEqual(['cat', 'dog', 'bird', 'fish'])
  })

  it('đọc cột copy từ bảng tính (tab), cột 3 là phiên âm', () => {
    const r = parseSmart('apple\tquả táo\t/ˈæp.əl/\nbanana\tquả chuối\n')
    expect(r.rows[0]).toMatchObject({ word: 'apple', meaningVi: 'quả táo', ipa: '/ˈæp.əl/' })
    expect(r.rows[1]).toMatchObject({ word: 'banana', meaningVi: 'quả chuối', ipa: '' })
  })

  it('có dòng tiêu đề thì đọc như CSV/TSV', () => {
    const tsv = parseSmart('word\tmeaning\texample\ncat\tcon mèo\tThe cat sleeps.\n')
    expect(tsv.errors).toEqual([])
    expect(tsv.rows[0]).toMatchObject({ word: 'cat', meaningVi: 'con mèo', example: 'The cat sleeps.' })
    expect(pairs('Từ,Nghĩa\ndog,con chó\n')).toEqual([['dog', 'con chó']])
  })

  it('đọc cột chủ đề (topic / Chủ đề / category) trong CSV có tên cột', () => {
    const r = parseSmart('word,meaning,topic\nprinter,máy in,Văn phòng\nzebra,ngựa vằn,\n')
    expect(r.rows).toEqual([
      { word: 'printer', meaningVi: 'máy in', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '', topic: 'Văn phòng' },
      { word: 'zebra', meaningVi: 'ngựa vằn', ipa: '', partOfSpeech: '', emoji: '', example: '', exampleVi: '' }
    ])
    expect(parseSmart('Từ;Nghĩa;Chủ đề\ncat;con mèo;Động vật\n').rows[0].topic).toBe('Động vật')
    expect(parseSmart('word\tcategory\nlaptop\tTech\n').rows[0]).toMatchObject({ word: 'laptop', meaningVi: '', topic: 'Tech' })
  })

  it('văn bản rỗng thì không có từ và không báo lỗi', () => {
    expect(parseSmart('  \n\n')).toEqual({ rows: [], errors: [], needsMeaning: 0 })
  })

  it('bỏ từ trùng, giữ dòng chỉ có từ tiếng Anh để tra nghĩa sau', () => {
    const r = parseSmart('cat - con mèo\nhello\nCAT - mèo\n')
    expect(pairs('cat - con mèo\nhello\nCAT - mèo\n')).toEqual([
      ['cat', 'con mèo'],
      ['hello', '']
    ])
    expect(r.needsMeaning).toBe(1)
    expect(r.errors).toHaveLength(1)
    expect(r.errors[0]).toContain('Dòng 3')
  })
})

describe('parseSmart – nhận dạng dữ liệu lộn xộn', () => {
  it('tự đảo khi nghĩa tiếng Việt đứng trước', () => {
    expect(pairs('máy tính xách tay - laptop\ncuộc họp: meeting')).toEqual([
      ['laptop', 'máy tính xách tay'],
      ['meeting', 'cuộc họp']
    ])
  })

  it('đảo cả dòng không dấu khi đa số danh sách là "nghĩa - từ"', () => {
    expect(pairs('máy tính - computer\nmeo - cat\ncuộc họp - meeting')).toEqual([
      ['computer', 'máy tính'],
      ['cat', 'meo'],
      ['meeting', 'cuộc họp']
    ])
  })

  it('tách phiên âm và loại từ trong dòng', () => {
    const r = parseSmart(
      ['meeting (n) /ˈmiː.t̬ɪŋ/: cuộc họp', 'laptop /ˈlæp.tɑːp/ máy tính xách tay', 'run v. chạy', 'negotiate (verb) - đàm phán'].join('\n')
    )
    expect(r.errors).toEqual([])
    expect(r.rows).toMatchObject([
      { word: 'meeting', meaningVi: 'cuộc họp', partOfSpeech: 'n', ipa: '/ˈmiː.t̬ɪŋ/' },
      { word: 'laptop', meaningVi: 'máy tính xách tay', ipa: '/ˈlæp.tɑːp/' },
      { word: 'run', meaningVi: 'chạy', partOfSpeech: 'v' },
      { word: 'negotiate', meaningVi: 'đàm phán', partOfSpeech: 'v' }
    ])
  })

  it('không cắt nhầm ngoặc nằm trong phần nghĩa', () => {
    const r = parseSmart('fly - bay (v), con ruồi\nbank - ngân hàng (tài chính)')
    expect(r.rows).toMatchObject([
      { word: 'fly', meaningVi: 'bay (v), con ruồi', partOfSpeech: '' },
      { word: 'bank', meaningVi: 'ngân hàng (tài chính)' }
    ])
  })

  it('lấy câu tiếng Anh ở vế thứ ba làm câu ví dụ', () => {
    const r = parseSmart('meeting - cuộc họp - We have a meeting at nine.')
    expect(r.rows[0]).toMatchObject({ word: 'meeting', meaningVi: 'cuộc họp', example: 'We have a meeting at nine.' })
  })

  it('bảng không có tên cột, cột bị đảo, đủ phiên âm / loại từ / ví dụ', () => {
    const r = parseSmart(
      [
        'quả táo\tapple\t/ˈæp.əl/\tn\tI eat an apple every day.\tTôi ăn một quả táo mỗi ngày.',
        'quả chuối\tbanana\t/bəˈnæn.ə/\tn\tMonkeys love bananas.\tKhỉ rất thích chuối.'
      ].join('\n')
    )
    expect(r.errors).toEqual([])
    expect(r.rows[0]).toEqual({
      word: 'apple',
      meaningVi: 'quả táo',
      ipa: '/ˈæp.əl/',
      partOfSpeech: 'n',
      emoji: '',
      example: 'I eat an apple every day.',
      exampleVi: 'Tôi ăn một quả táo mỗi ngày.'
    })
    expect(r.rows[1]).toMatchObject({ word: 'banana', meaningVi: 'quả chuối', example: 'Monkeys love bananas.' })
  })

  it('bảng dùng dấu chấm phẩy', () => {
    expect(pairs('apple;quả táo\nbanana;quả chuối')).toEqual([
      ['apple', 'quả táo'],
      ['banana', 'quả chuối']
    ])
  })

  it('dòng Anh / dòng Việt xen kẽ (copy từ flashcard)', () => {
    const r = parseSmart('laptop /ˈlæp.tɑːp/\nmáy tính xách tay\n\nmeeting\ncuộc họp\n')
    expect(r.errors).toEqual([])
    expect(r.rows).toMatchObject([
      { word: 'laptop', meaningVi: 'máy tính xách tay', ipa: '/ˈlæp.tɑːp/' },
      { word: 'meeting', meaningVi: 'cuộc họp' }
    ])
  })

  it('văn bản NFD (macOS) vẫn nhận ra tiếng Việt', () => {
    expect(pairs('con mèo - cat')).toEqual([['cat', 'con mèo']])
  })
})

describe('parseSmart – chỉ có từ tiếng Anh', () => {
  it('mỗi dòng một từ: giữ lại, nghĩa để trống', () => {
    const r = parseSmart('laptop\nmeeting\nget rid of\n')
    expect(r.errors).toEqual([])
    expect(r.needsMeaning).toBe(3)
    expect(pairs('laptop\nmeeting\nget rid of\n')).toEqual([
      ['laptop', ''],
      ['meeting', ''],
      ['get rid of', '']
    ])
  })

  it('nhiều từ trên một dòng, ngăn bằng dấu phẩy', () => {
    expect(parseSmart('laptop, meeting; deadline').rows.map((w) => w.word)).toEqual(['laptop', 'meeting', 'deadline'])
  })

  it('cột "word" duy nhất có tiêu đề', () => {
    const r = parseSmart('word\nlaptop\nmeeting\n')
    expect(r.errors).toEqual([])
    expect(r.rows.map((w) => w.word)).toEqual(['laptop', 'meeting'])
    expect(r.needsMeaning).toBe(2)
  })

  it('báo lỗi dòng chỉ có tiếng Việt và dòng quá dài', () => {
    const r = parseSmart('cat - con mèo\nxin chào các bạn\nThis is a very long sentence that is clearly not a word.')
    expect(r.rows.map((w) => w.word)).toEqual(['cat'])
    expect(r.errors).toHaveLength(2)
    expect(r.errors[0]).toContain('Dòng 2')
    expect(r.errors[1]).toContain('Trích từ đoạn văn')
  })
})

describe('normalizePos', () => {
  it('quy về khóa loại từ của app', () => {
    expect(normalizePos('(n)')).toBe('n')
    expect(normalizePos('v.')).toBe('v')
    expect(normalizePos('Adjective')).toBe('adj')
    expect(normalizePos('danh từ')).toBe('n')
    expect(normalizePos('n/v')).toBe('n')
    expect(normalizePos('phr. v')).toBe('phr')
    expect(normalizePos('tài chính')).toBeUndefined()
  })
})
