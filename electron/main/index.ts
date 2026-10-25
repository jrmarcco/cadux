import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu } from 'electron'

const LOGIN_WIDTH = 360
const LOGIN_HEIGHT = 560
const MAIN_WIDTH = 1080
const MAIN_HEIGHT = 720
const MAIN_MIN_WIDTH = 960
const MAIN_MIN_HEIGHT = 640

function resolveEntryUrl(hash: string): { url: string; isFile: boolean } {
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    return { url: `${process.env['ELECTRON_RENDERER_URL']}/#${hash}`, isFile: false }
  }
  return { url: join(__dirname, '../renderer/index.html'), isFile: true }
}

function createWindow(hash: string, options: Electron.BrowserWindowConstructorOptions): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    frame: false,
    backgroundColor: '#f2f3f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    },
    ...options
  })

  win.on('ready-to-show', () => win.show())
  win.on('maximize', () => win.webContents.send('window:maximize-changed', true))
  win.on('unmaximize', () => win.webContents.send('window:maximize-changed', false))

  const entry = resolveEntryUrl(hash)
  if (entry.isFile) {
    void win.loadFile(entry.url, { hash })
  } else {
    void win.loadURL(entry.url)
  }

  // 禁止页面级导航与 window.open ( 渲染层只做 SPA 路由 )
  win.webContents.on('will-navigate', (event) => event.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  return win
}

function toLoginShape(win: BrowserWindow): void {
  if (win.isMaximized()) win.unmaximize()
  win.setMinimumSize(LOGIN_WIDTH, LOGIN_HEIGHT)
  win.setResizable(false)
  win.setMaximizable(false)
  win.setSize(LOGIN_WIDTH, LOGIN_HEIGHT)
  win.center()
}

function toMainShape(win: BrowserWindow): void {
  win.setMinimumSize(MAIN_MIN_WIDTH, MAIN_MIN_HEIGHT)
  win.setResizable(true)
  win.setMaximizable(true)
  win.setSize(MAIN_WIDTH, MAIN_HEIGHT)
  win.center()
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

void app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.handle('window:toggle-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window:get-maximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
  ipcMain.handle('window:set-background', (event, color: unknown) => {
    if (typeof color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(color)) return
    BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(color)
  })
  ipcMain.handle('app:enter-main', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    toMainShape(win)
  })
  ipcMain.handle('app:enter-login', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    toLoginShape(win)
  })

  mainWindow = createWindow('/main', {
    width: MAIN_WIDTH,
    height: MAIN_HEIGHT,
    minWidth: MAIN_MIN_WIDTH,
    minHeight: MAIN_MIN_HEIGHT,
    resizable: true,
    title: 'cadux'
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow('/main', {
        width: MAIN_WIDTH,
        height: MAIN_HEIGHT,
        minWidth: MAIN_MIN_WIDTH,
        minHeight: MAIN_MIN_HEIGHT,
        resizable: true
      })
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
