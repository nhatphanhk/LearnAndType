import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ThemeSetting = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeSetting
  voiceURI: string | null
  speechRate: number
  autoSpeak: boolean
  lessonSize: number
  hideLength: boolean
  autoAdvance: boolean
  caseSensitive: boolean
  soundEffects: boolean
  /** Gemini API key (chỉ lưu trên máy này) — AI phân loại từ không đoán được chủ đề. */
  geminiApiKey: string
  /** Tự gọi AI khi nhập & phân loại (nếu có key). */
  aiClassify: boolean
  /** Mục tiêu mỗi ngày: số lượt gõ (0 = tắt). */
  dailyGoalWords: number
  /** Mục tiêu mỗi ngày: số phút gõ (0 = tắt). */
  dailyGoalMinutes: number
  /** Gửi thông báo Windows nhắc học khi chưa đạt mục tiêu. */
  reminderEnabled: boolean
  /** Giờ nhắc học, dạng HH:MM. */
  reminderTime: string
  /** Bấm nút đóng thì thu app xuống khay hệ thống thay vì thoát. */
  closeToTray: boolean
  /** Tự chạy (ẩn dưới khay) khi đăng nhập Windows. */
  launchAtLogin: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  voiceURI: null,
  speechRate: 0.9,
  autoSpeak: true,
  lessonSize: 10,
  hideLength: false,
  autoAdvance: false,
  caseSensitive: false,
  soundEffects: true,
  geminiApiKey: '',
  aiClassify: true,
  dailyGoalWords: 20,
  dailyGoalMinutes: 0,
  reminderEnabled: false,
  reminderTime: '20:00',
  closeToTray: false,
  launchAtLogin: false
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void
  reset: () => void
}

/** localStorage có thể bị chặn; khi đó dùng bộ nhớ tạm để app vẫn chạy. */
function safeStorage(): Storage {
  try {
    const k = '__lt_probe__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return localStorage
  } catch {
    const mem = new Map<string, string>()
    return {
      get length() {
        return mem.size
      },
      clear: () => mem.clear(),
      getItem: (k) => mem.get(k) ?? null,
      key: (i) => [...mem.keys()][i] ?? null,
      removeItem: (k) => void mem.delete(k),
      setItem: (k, v) => void mem.set(k, v)
    }
  }
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      // Khôi phục mặc định không xóa API key đã nhập
      reset: () => set((s) => ({ ...DEFAULT_SETTINGS, geminiApiKey: s.geminiApiKey }))
    }),
    {
      name: 'learn-and-type:settings',
      version: 1,
      storage: createJSONStorage(safeStorage)
    }
  )
)
