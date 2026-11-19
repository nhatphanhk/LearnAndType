import { PACK_APP, type PackFile } from './packs'

/** Gói mẫu dùng trong test. */
export const samplePack = (over: Partial<PackFile> = {}): PackFile => ({
  app: PACK_APP,
  id: 'toeic',
  version: 1,
  name: 'TOEIC',
  nameEn: 'TOEIC',
  emoji: '💼',
  exam: 'toeic',
  topics: [
    {
      id: 'office',
      name: 'Văn phòng',
      nameEn: 'Office',
      emoji: '🏢',
      words: [
        { word: 'agenda', meaningVi: 'chương trình họp', cefr: 'b2', tags: ['toeic'], synonyms: ['schedule', ''] },
        { word: 'deadline', meaningVi: 'hạn chót', cefr: 'B2' },
        { word: 'memo', meaningVi: '' }
      ]
    },
    {
      id: 'finance',
      name: 'Tài chính',
      nameEn: 'Finance',
      emoji: '💰',
      words: [
        { word: 'invoice', meaningVi: 'hóa đơn', cefr: 'C1', family: ['invoice (v)'] },
        { word: 'Agenda', meaningVi: 'trùng', tags: ['barrons'] }
      ]
    }
  ],
  ...over
})
