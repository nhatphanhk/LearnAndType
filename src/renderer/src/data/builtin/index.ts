import type { Topic, Word } from '@/types'
import type { BuiltinTopic } from './types'
import { animals } from './animals'
import { food } from './food'
import { fruits } from './fruits'
import { family } from './family'
import { jobs } from './jobs'
import { body } from './body'
import { house } from './house'
import { school } from './school'
import { transport } from './transport'
import { nature } from './nature'
import { sports } from './sports'
import { clothes } from './clothes'

/** Tăng khi thay đổi dữ liệu có sẵn để app tự cập nhật lại khi khởi động. */
export const BUILTIN_VERSION = 1

export const BUILTIN_TOPICS: BuiltinTopic[] = [
  animals,
  food,
  fruits,
  family,
  jobs,
  body,
  house,
  school,
  transport,
  nature,
  sports,
  clothes
]

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function builtinEntities(createdAt = 0): { topics: Topic[]; words: Word[] } {
  const topics: Topic[] = []
  const words: Word[] = []
  BUILTIN_TOPICS.forEach((t, order) => {
    topics.push({
      id: t.id,
      name: t.name,
      nameEn: t.nameEn,
      emoji: t.emoji,
      description: t.description,
      isBuiltIn: true,
      order,
      createdAt
    })
    t.words.forEach(([word, ipa, partOfSpeech, meaningVi, emoji, example, exampleVi], i) => {
      words.push({
        id: `${t.id}:${slugify(word)}`,
        topicId: t.id,
        word,
        ipa,
        partOfSpeech,
        meaningVi,
        emoji,
        example,
        exampleVi,
        isBuiltIn: true,
        createdAt: createdAt + i
      })
    })
  })
  return { topics, words }
}
