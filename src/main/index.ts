import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, shell, Tray } from 'electron'
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

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
