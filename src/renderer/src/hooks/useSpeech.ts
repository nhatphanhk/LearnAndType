import { useEffect, useState } from 'react'
import { useSettings } from '@/store/settingsStore'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined

export function getEnglishVoices(): SpeechSynthesisVoice[] {
  if (!synth) return []
  return synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'))
}

function pickVoice(voiceURI: string | null): SpeechSynthesisVoice | undefined {
  const voices = getEnglishVoices()
  return (
    voices.find((v) => v.voiceURI === voiceURI) ??
    voices.find((v) => v.lang === 'en-US' && v.localService) ??
    voices.find((v) => v.lang === 'en-US') ??
    voices[0]
  )
}

/** Phát âm một từ/câu tiếng Anh bằng Web Speech API. */
export function speak(text: string, opts: { rate?: number; voiceURI?: string | null } = {}): void {
  if (!synth || !text) return
  const { speechRate, voiceURI } = useSettings.getState()
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(opts.voiceURI ?? voiceURI)
  if (voice) {
    u.voice = voice
    u.lang = voice.lang
  } else {
    u.lang = 'en-US'
  }
  u.rate = opts.rate ?? speechRate
  synth.speak(u)
}

export function stopSpeaking(): void {
  synth?.cancel()
}

export function speechSupported(): boolean {
  return !!synth
}

/** Danh sách giọng tiếng Anh, cập nhật khi hệ thống tải xong giọng đọc. */
export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => getEnglishVoices())
  useEffect(() => {
    if (!synth) return
    const update = (): void => setVoices(getEnglishVoices())
    update()
    synth.addEventListener('voiceschanged', update)
    return () => synth.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}
