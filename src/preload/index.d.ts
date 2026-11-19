export {}

declare global {
  interface Window {
    api?: {
      getVersion: () => Promise<string>
      platform: string
      focus: (route?: string) => Promise<void>
      setCloseToTray: (value: boolean) => Promise<void>
      setLaunchAtLogin: (value: boolean) => Promise<boolean>
      onNavigate: (cb: (route: string) => void) => () => void
      setQuickShortcut: (accel: string) => Promise<boolean>
      getQuickText: () => Promise<string>
      hideQuick: () => Promise<void>
      openMainFromQuick: (route?: string) => Promise<void>
      onQuickText: (cb: (text: string) => void) => () => void
    }
  }
}
