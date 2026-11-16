import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron'

const isDev = !app.isPackaged

// Cho phép dùng thư mục dữ liệu riêng (kiểm thử tự động, nhiều hồ sơ học)
if (process.env['LEARNANDTYPE_USER_DATA']) {
  app.setPath('userData', process.env['LEARNANDTYPE_USER_DATA'])
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'LearnAndType',
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

  win.once('ready-to-show', () => win.show())

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

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.learnandtype.app')
    Menu.setApplicationMenu(null)
    ipcMain.handle('app:version', () => app.getVersion())
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
