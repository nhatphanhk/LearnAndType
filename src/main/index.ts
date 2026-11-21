import { join } from 'node:path'
import { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, screen, shell, Tray } from 'electron'
// Icon riêng của app (thay icon Electron mặc định trên cửa sổ/taskbar, cả khi chạy dev)
import iconIco from '../../build/icon.ico?asset'
import iconPng from '../../build/icon.png?asset'

const isDev = !app.isPackaged
const appIcon = process.platform === 'win32' ? iconIco : iconPng
/** Mở cùng Windows: chạy ẩn dưới khay. */
const startHidden = process.argv.includes('--hidden')

// Cho phép dùng thư mục dữ liệu riêng (kiểm thử tự động, nhiều hồ sơ học)
if (process.env['LEARNANDTYPE_USER_DATA']) {
  app.setPath('userData', process.env['LEARNANDTYPE_USER_DATA'])
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
/** Bấm đóng chỉ ẩn cửa sổ (do renderer đặt theo cài đặt). */
let closeToTray = false
/** Đang thoát thật (từ menu khay) — không chặn sự kiện close nữa. */
let isQuitting = false

/* ------------------------------ Tra nhanh toàn cục ------------------------------ */

const QUICK_W = 480
const QUICK_H = 640
const QUICK_MAX_TEXT = 200
let quickWindow: BrowserWindow | null = null
/** Chữ lấy từ clipboard ở lần gọi tra nhanh gần nhất. */
let quickText = ''
let quickAccelerator: string | null = null

function createQuickWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: QUICK_W,
    height: QUICK_H,
    show: false,
    frame: false,
    resizable: true,
    minWidth: 400,
    minHeight: 480,
    alwaysOnTop: true,
    skipTaskbar: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Tra nhanh · LearnAndType',
    icon: appIcon,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })
  win.on('blur', () => {
    if (!win.webContents.isDevToolsOpened()) win.hide()
  })
  win.on('closed', () => {
    if (quickWindow === win) quickWindow = null
  })
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12' && isDev) {
      win.webContents.openDevTools({ mode: 'detach' })
      event.preventDefault()
    }
  })
  loadRenderer(win, '/quick')
  return win
}

/** Đặt popup cạnh con trỏ chuột, không tràn khỏi màn hình. */
function positionNearCursor(win: BrowserWindow): void {
  const pt = screen.getCursorScreenPoint()
  const area = screen.getDisplayNearestPoint(pt).workArea
  // Giữ cỡ người dùng đã kéo giãn (không vượt quá màn hình)
  const [curW, curH] = win.getSize()
  const w = Math.min(curW || QUICK_W, area.width)
  const h = Math.min(curH || QUICK_H, area.height)
  const x = Math.min(Math.max(pt.x + 12, area.x), area.x + area.width - w)
  const y = Math.min(Math.max(pt.y + 12, area.y), area.y + area.height - h)
  win.setBounds({ x: Math.round(x), y: Math.round(y), width: w, height: h })
}

async function openQuickLookup(): Promise<void> {
  // clipboard.readText() có thể là hàm đồng bộ hoặc trả về Promise tùy phiên bản Electron
  const raw: string = await Promise.resolve(clipboard.readText()).catch(() => '')
  quickText = raw.replace(/\s+/g, ' ').trim().slice(0, QUICK_MAX_TEXT)
  const fresh = !quickWindow
  if (!quickWindow) quickWindow = createQuickWindow()
  const win = quickWindow
  positionNearCursor(win)
  const show = (): void => {
    win.show()
    win.focus()
  }
  if (fresh) {
    win.once('ready-to-show', show)
  } else {
    win.webContents.send('quick:text', quickText)
    show()
  }
}

/** Đăng ký (hoặc gỡ, khi `accel` rỗng) phím tắt tra nhanh. Trả về true nếu đăng ký được. */
function setQuickShortcut(accel: string | null): boolean {
  if (quickAccelerator) globalShortcut.unregister(quickAccelerator)
  quickAccelerator = null
  if (!accel) return true
  try {
    if (!globalShortcut.register(accel, () => void openQuickLookup())) return false
  } catch {
    return false
  }
  quickAccelerator = accel
  return true
}

function loadRenderer(win: BrowserWindow, hash = ''): void {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

function createWindow(showOnReady = true): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'LearnAndType',
    icon: appIcon,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  if (showOnReady) win.once('ready-to-show', () => win.show())

  win.on('close', (event) => {
    if (closeToTray && !isQuitting) {
      event.preventDefault()
      win.hide()
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // Mở link ngoài bằng trình duyệt mặc định, không mở cửa sổ Electron mới
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F12' && isDev) {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r' && isDev)) {
      win.webContents.reload()
      event.preventDefault()
    }
  })

  loadRenderer(win)
  return win
}

/** Hiện cửa sổ chính (tạo mới nếu đã đóng), tùy chọn chuyển tới một trang. */
function showMain(route?: string): void {
  if (!mainWindow) mainWindow = createWindow()
  const win = mainWindow
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
  if (route) win.webContents.send('app:navigate', route)
}

function createTray(): void {
  tray = new Tray(appIcon)
  tray.setToolTip('LearnAndType')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Mở LearnAndType', click: () => showMain() },
      { label: 'Ôn tập ngay', click: () => showMain('/review') },
      { type: 'separator' },
      {
        label: 'Thoát',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showMain())
}

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('quick:setShortcut', (_e, accel: unknown) =>
    setQuickShortcut(typeof accel === 'string' && accel.trim() ? accel.trim() : null)
  )
  ipcMain.handle('quick:getText', () => quickText)
  ipcMain.handle('quick:hide', () => quickWindow?.hide())
  ipcMain.handle('quick:openMain', (_e, route: unknown) => {
    quickWindow?.hide()
    showMain(typeof route === 'string' ? route : undefined)
  })
  ipcMain.handle('app:focus', (_e, route: unknown) => showMain(typeof route === 'string' ? route : undefined))
  ipcMain.handle('app:setCloseToTray', (_e, value: unknown) => {
    closeToTray = value === true
  })
  ipcMain.handle('app:setLaunchAtLogin', (_e, value: unknown) => {
    // Bản dev chạy bằng electron.exe — không đăng ký để khỏi khởi động nhầm
    if (isDev) return false
    app.setLoginItemSettings({ openAtLogin: value === true, args: ['--hidden'] })
    return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMain())

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.learnandtype.app')
    Menu.setApplicationMenu(null)
    registerIpc()
    createTray()
    mainWindow = createWindow(!startHidden)

    app.on('activate', () => showMain())
  })

  app.on('will-quit', () => globalShortcut.unregisterAll())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
