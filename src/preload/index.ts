import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  platform: process.platform,
  /** Hiện cửa sổ chính, tùy chọn chuyển tới `route` (ví dụ "/review"). */
  focus: (route?: string): Promise<void> => ipcRenderer.invoke('app:focus', route),
  setCloseToTray: (value: boolean): Promise<void> => ipcRenderer.invoke('app:setCloseToTray', value),
  /** Trả về trạng thái thực tế sau khi đặt (bản dev luôn false). */
  setLaunchAtLogin: (value: boolean): Promise<boolean> => ipcRenderer.invoke('app:setLaunchAtLogin', value),
  /** Đăng ký phím tắt tra nhanh (rỗng = tắt). Trả về false nếu phím đã bị chiếm hoặc không hợp lệ. */
  setQuickShortcut: (accel: string): Promise<boolean> => ipcRenderer.invoke('quick:setShortcut', accel),
  /** Chữ lấy từ clipboard ở lần tra nhanh gần nhất. */
  getQuickText: (): Promise<string> => ipcRenderer.invoke('quick:getText'),
  hideQuick: (): Promise<void> => ipcRenderer.invoke('quick:hide'),
  /** Đóng popup tra nhanh và mở cửa sổ chính. */
  openMainFromQuick: (route?: string): Promise<void> => ipcRenderer.invoke('quick:openMain', route),
  /** Popup tra nhanh nhận chữ mới. Trả về hàm hủy đăng ký. */
  onQuickText: (cb: (text: string) => void): (() => void) => {
    const listener = (_e: unknown, text: string): void => cb(text)
    ipcRenderer.on('quick:text', listener)
    return () => ipcRenderer.removeListener('quick:text', listener)
  },
  /** Main process yêu cầu chuyển trang. Trả về hàm hủy đăng ký. */
  onNavigate: (cb: (route: string) => void): (() => void) => {
    const listener = (_e: unknown, route: string): void => cb(route)
    ipcRenderer.on('app:navigate', listener)
    return () => ipcRenderer.removeListener('app:navigate', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
