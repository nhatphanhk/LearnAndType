import { useSettings } from '@/store/settingsStore'

let ctx: AudioContext | null = null

function tone(freqs: number[], duration = 0.09, type: OscillatorType = 'sine', gain = 0.06): void {
  if (!useSettings.getState().soundEffects) return
  try {
    ctx ??= new AudioContext()
    const t0 = ctx.currentTime
    freqs.forEach((f, i) => {
      const osc = ctx!.createOscillator()
      const g = ctx!.createGain()
      osc.type = type
      osc.frequency.value = f
      const start = t0 + i * duration
      g.gain.setValueAtTime(gain, start)
      g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
      osc.connect(g).connect(ctx!.destination)
      osc.start(start)
      osc.stop(start + duration)
    })
  } catch {
    // Không có âm thanh cũng không sao
  }
}

export const sfx = {
  correct: (): void => tone([660, 880], 0.08),
  wrong: (): void => tone([220, 180], 0.12, 'triangle', 0.08),
  done: (): void => tone([523, 659, 784, 1046], 0.1)
}
