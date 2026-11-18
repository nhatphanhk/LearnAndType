import { useEffect, useState, type ReactNode } from 'react'
import { exportBackup, importBackup, isBackupFile, resetProgress } from '@/db/repo'
import { useSettings, type ThemeSetting } from '@/store/settingsStore'
import { speak, speechSupported, useEnglishVoices } from '@/hooks/useSpeech'
import { toast } from '@/components/Toast'
import { Button, Card, Field, PageHeader, Toggle, cx, inputCls } from '@/components/ui'
import { dateStamp, downloadText, pickFile } from '@/download'
import { geminiErrorMessage, testGeminiKey } from '@/core/gemini'

const THEMES: { value: ThemeSetting; label: string }[] = [
  { value: 'system', label: '🖥️ Theo hệ thống' },
  { value: 'light', label: '☀️ Sáng' },
  { value: 'dark', label: '🌙 Tối' }
]

function AiSettings(): ReactNode {
  const apiKey = useSettings((s) => s.geminiApiKey)
  const aiClassify = useSettings((s) => s.aiClassify)
  const set = useSettings((s) => s.set)
  const [draft, setDraft] = useState(apiKey)
  const [show, setShow] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => setDraft(apiKey), [apiKey])

  const save = (): void => {
    set({ geminiApiKey: draft.trim() })
    toast.success(draft.trim() ? 'Đã lưu Gemini API key.' : 'Đã xóa Gemini API key.')
  }

  const test = async (): Promise<void> => {
    setTesting(true)
    try {
      await testGeminiKey(draft)
      set({ geminiApiKey: draft.trim() })
      toast.success('Key hoạt động — đã lưu.')
    } catch (e) {
      toast.error(geminiErrorMessage(e))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="font-semibold">🤖 Phân loại bằng AI (Gemini)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Khi nhập & phân loại, những từ app không tự đoán được chủ đề sẽ được gửi cho Gemini (từ tiếng Anh, nghĩa tiếng Việt và
        tên các chủ đề) để chọn chủ đề phù hợp. Key chỉ lưu trên máy này và không nằm trong file sao lưu. Lấy key miễn phí tại
        Google AI Studio.
      </p>
      <Field label="Gemini API key">
        <div className="flex flex-wrap gap-2">
          <input
            className={cx(inputCls, 'min-w-64 flex-1 font-mono')}
            type={show ? 'text' : 'password'}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Dán API key…"
            autoComplete="off"
            spellCheck={false}
            aria-label="Gemini API key"
          />
          <Button onClick={() => setShow((v) => !v)}>{show ? '🙈 Ẩn' : '👁️ Hiện'}</Button>
          <Button variant="primary" disabled={draft.trim() === apiKey} onClick={save}>
            Lưu
          </Button>
          <Button disabled={!draft.trim() || testing} onClick={() => void test()}>
            {testing ? 'Đang kiểm tra…' : 'Kiểm tra key'}
          </Button>
        </div>
      </Field>
      <Toggle
        checked={aiClassify}
        onChange={(v) => set({ aiClassify: v })}
        label="Tự động phân loại bằng AI khi nhập"
        description={
          apiKey ? 'Tắt thì vẫn có nút "🤖 Phân loại bằng AI" trong bảng xem lại.' : 'Cần nhập API key ở trên.'
        }
      />
    </Card>
  )
}

export default function SettingsPage(): ReactNode {
  const s = useSettings()
  const voices = useEnglishVoices()
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api
      ?.getVersion()
      .then(setVersion)
      .catch(() => undefined)
  }, [])

  const onExport = async (): Promise<void> => {
    const data = await exportBackup()
    downloadText(`learnandtype-backup-${dateStamp()}.json`, JSON.stringify(data), 'application/json')
    toast.success('Đã tạo file sao lưu.')
  }

  const onImport = async (): Promise<void> => {
    const file = await pickFile('.json,application/json')
    if (!file) return
    try {
      const data: unknown = JSON.parse(await file.text())
      if (!isBackupFile(data)) throw new Error('File không phải bản sao lưu của LearnAndType.')
      if (
        !window.confirm(
          'Khôi phục sẽ THAY THẾ toàn bộ tiến độ học và chủ đề tự tạo hiện tại bằng dữ liệu trong file. Tiếp tục?'
        )
      )
        return
      await importBackup(data)
      toast.success('Đã khôi phục dữ liệu.')
    } catch (e) {
      toast.error(`Không khôi phục được: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const onReset = async (): Promise<void> => {
    if (!window.confirm('Xóa toàn bộ tiến độ học, lịch sử phiên và thống kê? Chủ đề và từ vựng vẫn được giữ lại.')) return
    await resetProgress()
    toast.success('Đã đặt lại tiến độ học.')
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Cài đặt" subtitle="Tùy chỉnh cách luyện gõ, phát âm và quản lý dữ liệu." />

      <Card>
        <h2 className="mb-2 font-semibold">Giao diện</h2>
        <div className="flex flex-wrap gap-2">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => s.set({ theme: t.value })}
              className={cx(
                'cursor-pointer rounded-lg px-4 py-2 text-sm font-medium ring-1 transition-colors',
                s.theme === t.value
                  ? 'bg-indigo-600 text-white ring-indigo-600'
                  : 'ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold">Luyện gõ</h2>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <div className="flex items-center justify-between gap-4 py-3">
            <span>
              <span className="block font-medium">Số từ mỗi bài học</span>
              <span className="block text-sm text-slate-500">Số từ mới trong một Bài học hoặc một phiên luyện tập.</span>
            </span>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={20}
                value={s.lessonSize}
                onChange={(e) => s.set({ lessonSize: Number(e.target.value) })}
                className="accent-indigo-600"
              />
              <span className="w-8 text-right font-semibold tabular-nums">{s.lessonSize}</span>
            </div>
          </div>
          <Toggle
            checked={s.autoAdvance}
            onChange={(v) => s.set({ autoAdvance: v })}
            label="Tự chuyển sang từ tiếp theo"
            description="Khi gõ đúng, tự sang từ mới mà không cần nhấn Enter."
          />
          <Toggle
            checked={s.hideLength}
            onChange={(v) => s.set({ hideLength: v })}
            label="Ẩn độ dài từ"
            description="Ở chế độ Nhớ / Nghe / Điền câu, không hiện số ô chữ (khó hơn)."
          />
          <Toggle
            checked={s.caseSensitive}
            onChange={(v) => s.set({ caseSensitive: v })}
            label="Phân biệt chữ hoa / thường"
            description="Mặc định 'Cat' và 'cat' được tính là giống nhau."
          />
          <Toggle
            checked={s.soundEffects}
            onChange={(v) => s.set({ soundEffects: v })}
            label="Âm thanh đúng / sai"
          />
        </div>
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold">Phát âm</h2>
        {!speechSupported() ? (
          <p className="mt-2 text-sm text-slate-500">Hệ thống không hỗ trợ đọc văn bản.</p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <Toggle
              checked={s.autoSpeak}
              onChange={(v) => s.set({ autoSpeak: v })}
              label="Tự động phát âm"
              description="Đọc từ khi bắt đầu chép và khi hiện đáp án."
            />
            <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-2">
              <Field
                label="Giọng đọc"
                hint={voices.length === 0 ? 'Không tìm thấy giọng tiếng Anh. Cài thêm trong Settings › Time & language › Speech của Windows.' : undefined}
              >
                <select
                  className={inputCls}
                  value={s.voiceURI ?? ''}
                  onChange={(e) => s.set({ voiceURI: e.target.value || null })}
                >
                  <option value="">Mặc định (en-US)</option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`Tốc độ đọc: ${s.speechRate.toFixed(1)}×`}>
                <input
                  type="range"
                  min={0.5}
                  max={1.4}
                  step={0.1}
                  value={s.speechRate}
                  onChange={(e) => s.set({ speechRate: Number(e.target.value) })}
                  className="mt-2 w-full accent-indigo-600"
                />
              </Field>
            </div>
            <div className="py-3">
              <Button onClick={() => speak('Hello! Welcome to Learn and Type.')}>🔊 Nghe thử</Button>
            </div>
          </div>
        )}
      </Card>

      <AiSettings />

      <Card className="mt-6">
        <h2 className="font-semibold">Dữ liệu</h2>
        <p className="mt-1 text-sm text-slate-500">
          Tiến độ được lưu trên máy này. Hãy sao lưu định kỳ hoặc khi chuyển sang máy khác.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void onExport()}>⬇️ Sao lưu dữ liệu (.json)</Button>
          <Button onClick={() => void onImport()}>⬆️ Khôi phục từ file</Button>
          <Button variant="danger" onClick={() => void onReset()}>
            Đặt lại tiến độ học
          </Button>
        </div>
      </Card>

      <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
        <span>LearnAndType {version && `v${version}`}</span>
        <Button variant="ghost" size="sm" onClick={() => s.reset()}>
          Khôi phục cài đặt mặc định
        </Button>
      </div>
    </div>
  )
}
