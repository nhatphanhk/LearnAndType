import { contextBridge, ipcRenderer } from 'electron'

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  platform: process.platform,
  /** Hiện cửa sổ chính, tùy chọn chuyển tới `route` (ví dụ "/review"). */
  focus: (route?: string): Promise<void> => ipcRenderer.invoke('app:focus', route),
  setCloseToTray: (value: boolean): Promise<void> => ipcRenderer.invoke('app:setCloseToTray', value),
  /** Trả về trạng thái thực tế sau khi đặt (bản dev luôn false). */
  setLaunchAtLogin: (value: boolean): Promise<boolean> => ipcRenderer.invoke('app:setLaunchAtLogin', value),
  /** Main process yêu cầu chuyển trang. Trả về hàm hủy đăng ký. */
  onNavigate: (cb: (route: string) => void): (() => void) => {
    const listener = (_e: unknown, route: string): void => cb(route)
    ipcRenderer.on('app:navigate', listener)
    return () => ipcRenderer.removeListener('app:navigate', listener)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
