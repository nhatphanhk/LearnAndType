import type { PracticeMode, SessionKind, Topic, WordProgress } from './types'

/** Tên chủ đề dạng chữ, kèm emoji nếu chủ đề có. */
export function topicLabel(t: Pick<Topic, 'emoji' | 'name'>): string {
  const emoji = t.emoji?.trim()
  return emoji ? `${emoji} ${t.name}` : t.name
}

export const KIND_INFO: Record<SessionKind, { title: string; icon: string; desc: string }> = {
  lesson: { title: 'Bài học', icon: '🎓', desc: 'Học từ mới: chép từng từ rồi tự nhớ lại cả nhóm.' },
  copy: { title: 'Chép từ', icon: '⌨️', desc: 'Nhìn từ, phiên âm, nghĩa (và ảnh nếu có) rồi gõ lại.' },
  recall: { title: 'Nhớ từ', icon: '🧠', desc: 'Chỉ thấy nghĩa (và ảnh nếu có), tự gõ ra từ tiếng Anh.' },
  listen: { title: 'Nghe & gõ', icon: '🎧', desc: 'Nghe phát âm và gõ lại từ nghe được.' },
  cloze: { title: 'Điền vào câu', icon: '🧩', desc: 'Điền từ còn thiếu vào câu ví dụ.' },
  review: { title: 'Ôn tập', icon: '🔁', desc: 'Ôn các từ đến hạn theo lịch lặp lại ngắt quãng.' },
  retry: { title: 'Luyện lại từ sai', icon: '🎯', desc: 'Gõ lại những từ vừa trả lời sai.' },
  game: { title: 'Trò chơi', icon: '🎮', desc: 'Mini-game gõ từ: Từ rơi, Đua 60 giây.' }
}

export const MODE_LABEL: Record<PracticeMode, string> = {
  copy: 'Chép từ',
  recall: 'Nhớ từ',
  listen: 'Nghe & gõ',
  cloze: 'Điền vào câu'
}

export const POS_LABEL: Record<string, string> = {
  n: 'danh từ',
  v: 'động từ',
  adj: 'tính từ',
  adv: 'trạng từ',
  prep: 'giới từ',
  pron: 'đại từ',
  conj: 'liên từ',
  phr: 'cụm từ'
}

export function posLabel(pos: string): string {
  return POS_LABEL[pos] ?? pos
}

export function statusBadge(p: WordProgress | undefined): { text: string; tone: 'slate' | 'indigo' | 'emerald' } {
  if (!p || p.box <= 0) return { text: 'Chưa học', tone: 'slate' }
  if (p.status === 'mastered') return { text: `Đã thuộc · hộp ${p.box}`, tone: 'emerald' }
  return { text: `Đang học · hộp ${p.box}`, tone: 'indigo' }
}

export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  if (totalMin < 1) return `${Math.max(0, Math.round(ms / 1000))} giây`
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatDue(ts: number, now: number): string {
  const day = 24 * 60 * 60 * 1000
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const diff = Math.round((ts - start.getTime()) / day)
  if (diff <= 0) return 'hôm nay'
  if (diff === 1) return 'ngày mai'
  return `${diff} ngày nữa`
}
