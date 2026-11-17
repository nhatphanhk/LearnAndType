import type { NavigateFunction } from 'react-router-dom'
import { usePractice, type StartOptions } from './store/practiceStore'
import { toast } from './components/Toast'
import type { SessionKind, Word } from './types'

/** Bắt đầu một phiên luyện gõ rồi chuyển sang màn hình luyện tập. */
export async function launchSession(
  navigate: NavigateFunction,
  kind: SessionKind,
  topicId: string | null,
  words: Word[],
  opts?: StartOptions
): Promise<void> {
  if (words.length === 0) {
    toast.info('Không có từ nào để luyện.')
    return
  }
  try {
    await usePractice.getState().start(kind, topicId, words, opts)
    navigate('/practice')
  } catch (e) {
    toast.error(`Không bắt đầu được phiên học: ${e instanceof Error ? e.message : String(e)}`)
  }
}
