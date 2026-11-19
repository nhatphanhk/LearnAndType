/**
 * Bảng tra từ → cấp độ CEFR, kỳ thi, chủ đề thi, dựng từ các gói đóng kèm app (data/packs) và bảng cấp độ.
 * Nạp lười một lần, dùng chung cho Nhập & phân loại, Phân loại lại và Phân loại từ đang có.
 */
import { buildExamIndex, type ExamIndex } from '@/core/examClassify'
import { loadBundledPacks } from './packs'
import { loadCefrLevels } from './levels'

let cache: Promise<ExamIndex> | null = null

export function loadExamIndex(): Promise<ExamIndex> {
  cache ??= Promise.all([loadBundledPacks(), loadCefrLevels()])
    .then(([packs, levels]) => buildExamIndex(packs, levels))
    .catch((e) => {
      cache = null
      throw e
    })
  return cache
}
