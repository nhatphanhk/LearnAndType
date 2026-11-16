/** [word, ipa, loại từ, nghĩa tiếng Việt, emoji, câu ví dụ, dịch câu ví dụ] */
export type BuiltinWordTuple = [string, string, string, string, string, string, string]

export interface BuiltinTopic {
  id: string
  name: string
  nameEn: string
  emoji: string
  description: string
  words: BuiltinWordTuple[]
}
