import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  clipboard,
  ipcMain,
  nativeImage,
  screen,
  globalShortcut,
  shell,
  dialog,
  Notification,
  protocol,
  desktopCapturer,
  session
} from 'electron'
import { join, extname } from 'path'
import fs from 'fs/promises'
import fsSync from 'fs'
import { getMaxHistoryLimit, persistHistoryList, DEFAULT_MAX_HISTORY } from '../../src/shared/historyUtils.js'
import { executeShortcutTransaction, resolveStoredShortcut, getDefaultShortcuts } from '../../src/shared/shortcutUtils.js'
import { selectDesktopCapturerSource } from '../../src/shared/screenUtils.js'
import {
  fetchWithTimeout,
  parseResponseSafe,
  isAllowedAimakeXUrl,
  isSafeExternalUrl,
  evaluateNavigationPolicy
} from '../../src/shared/networkUtils.js'
import { SETTINGS_WHITELIST_KEYS, DEFAULT_SETTINGS, filterSafeSettings } from '../../src/shared/settingsUtils.js'
import { sanitizeTextForLogs, isMaskedApiKey, maskApiKey } from '../../src/shared/apiKeyUtils.js'
import {
  planDiskPruning,
  parseDataUrl,
  MAX_IMAGE_FILE_SIZE,
  validateFinishSnipperPayload
} from '../../src/shared/imageUtils.js'
import { executeFinishSnipperTransaction } from '../../src/shared/screenshotTransaction.js'
import {
  backupUserData,
  registerImageProtocol,
  saveImageToStorage,
  saveDataUrlToStorage,
  loadImageFromStorage,
  loadImageAsDataUrl,
  deleteImageFile,
  cleanupOrphanFiles,
  migrateLegacyBase64History
} from './imageStorage.js'
import {
  initSecureStorage,
  saveEncryptedApiKey,
  getDecryptedApiKey,
  hasApiKey,
  getMaskedApiKeys,
  migrateLegacyApiKeys
} from './secureStorage.js'

// ─── 注册特权协议 scheme（必须在 app.whenReady 之前执行）────────────
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clipai-image',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false
    }
  }
])

// 忽略终端管道断开引起的 EPIPE 异常
process.stdout?.on('error', (err) => {
  if (err.code === 'EPIPE') return
})
process.stderr?.on('error', (err) => {
  if (err.code === 'EPIPE') return
})
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') return
  console.error('Uncaught Exception:', sanitizeTextForLogs(err.message))
})

// ─── 单实例锁 (防止重复打开多个实例/图标) ──────────────────────────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
      if (process.platform === 'darwin') {
        app.dock.show()
        app.focus({ steal: true })
      }
    }
  })
}

// 稳定获取应用图标路径（兼容开发环境、打包环境与 Resources 目录，Windows 优先 icon.ico）
function getAppIconPath() {
  const isWin = process.platform === 'win32'
  const primaryIcon = isWin ? 'icon.ico' : 'icon.png'
  const fallbackIcon = 'icon.png'

  const candidates = [
    join(__dirname, `../../resources/${primaryIcon}`),
    join(process.resourcesPath || '', primaryIcon),
    join(app.getAppPath ? app.getAppPath() : process.cwd(), 'resources', primaryIcon),
    join(process.cwd(), 'resources', primaryIcon),
    join(__dirname, `../../resources/${fallbackIcon}`),
    join(process.resourcesPath || '', fallbackIcon),
    join(app.getAppPath ? app.getAppPath() : process.cwd(), 'resources', fallbackIcon),
    join(process.cwd(), 'resources', fallbackIcon)
  ]

  for (const p of candidates) {
    if (fsSync.existsSync(p)) return p
  }
  return join(__dirname, '../../resources/icon.png')
}
const APP_ICON_PATH = getAppIconPath()

// ─── electron-store (CommonJS 兼容) ──────────────────────────
let store
async function initStore() {
  const { default: Store } = await import('electron-store')
  store = new Store()
}

let mainWindow = null
let imageViewerWindow = null
let snipperWindow = null
let currentViewerImage = null
let currentSnipperData = null
let tray = null
let clipboardHistory = []
let lastClipboardText = ''
let lastClipboardImageHash = ''
let monitorInterval = null

// ─── 统一历史记录持久化与上限控制 (事务一致性保证) ───────────────
function persistHistory(list) {
  const maxLimit = getMaxHistoryLimit(store?.get('maxHistory', DEFAULT_MAX_HISTORY))
  const trimmed = persistHistoryList(list, maxLimit)
  // 先写入 store，确保持久化成功后才更新内存状态
  store?.set('history', trimmed)
  clipboardHistory = trimmed
  return trimmed
}

// 动态定位 preload 脚本路径（优先使用 CommonJS .js / .cjs 构建输出）
function getPreloadPath(name = 'index') {
  const jsPath = join(__dirname, `../preload/${name}.js`)
  const cjsPath = join(__dirname, `../preload/${name}.cjs`)
  const mjsPath = join(__dirname, `../preload/${name}.mjs`)
  if (fsSync.existsSync(jsPath)) return jsPath
  if (fsSync.existsSync(cjsPath)) return cjsPath
  if (fsSync.existsSync(mjsPath)) return mjsPath
  return jsPath
}

// ─── IPC 发送者来源与权限校验 ──────────────────────────────────────
function verifyIpcSender(event, allowedRoles = ['main']) {
  if (!event || !event.sender) return false
  const senderWin = BrowserWindow.fromWebContents(event.sender)
  if (!senderWin) return false

  const isMain = mainWindow && !mainWindow.isDestroyed() && senderWin === mainWindow
  const isViewer = imageViewerWindow && !imageViewerWindow.isDestroyed() && senderWin === imageViewerWindow
  const isSnipper = snipperWindow && !snipperWindow.isDestroyed() && senderWin === snipperWindow

  if (allowedRoles.includes('main') && isMain) return true
  if (allowedRoles.includes('viewer') && isViewer) return true
  if (allowedRoles.includes('snipper') && isSnipper) return true

  console.warn(`⚠️ 拦截未授权 IPC 调用，来自未授权窗口 (角色: ${allowedRoles.join(',')})`)
  return false
}

// ─── 创建主窗口 ───────────────────────────────────────────────
function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize

  const savedBounds = store?.get('windowBounds', { width: 440, height: 720 })
  const isCompact = store?.get('compactMode', false)
  const initialWidth = isCompact ? Math.max(340, savedBounds.width || 340) : Math.max(420, savedBounds.width || 440)
  const initialHeight = isCompact ? Math.max(450, savedBounds.height || 480) : Math.max(520, savedBounds.height || 720)

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    minWidth: isCompact ? 320 : 380,
    minHeight: isCompact ? 380 : 450,
    x: savedBounds.x ?? Math.round((width - initialWidth) / 2),
    y: savedBounds.y ?? Math.round((height - initialHeight) / 2),
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    icon: APP_ICON_PATH,
    alwaysOnTop: store?.get('alwaysOnTop', false),
    opacity: Math.min(Math.max((store?.get('windowOpacity', 100) || 100) / 100, 0.4), 1.0),
    webPreferences: {
      preload: getPreloadPath('index'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true
    }
  })

  // 注册 will-attach-webview 安全加固
  mainWindow.webContents.on('will-attach-webview', (e, webPreferences, params) => {
    if (!isAllowedAimakeXUrl(params.src)) {
      e.preventDefault()
      console.warn(`⚠️ 拦截非法 WebView 挂载尝试: ${params.src}`)
      return
    }

    // 强制安全配置
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    webPreferences.allowRunningInsecureContent = false
    webPreferences.webSecurity = true
  })

  // 开发与生产环境加载
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // 窗口状态持久化（防抖 300ms，避免拖拽边框缩放与移动时高频触发同步写盘阻塞主进程与 GPU 渲染）
  let saveBoundsTimer = null
  const saveBounds = () => {
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer)
    saveBoundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMinimized()) {
        const bounds = mainWindow.getBounds()
        store?.set('windowBounds', bounds)
      }
    }, 300)
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('console-message', (_, level, message) => {
    console.log(`[Renderer] ${message}`)
  })

  mainWindow.webContents.on('render-process-gone', (_, details) => {
    console.error('渲染进程异常退出，正在自动重载恢复:', details)
    if (details.reason !== 'clean-exit') {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload()
        }
      }, 500)
    }
  })

  mainWindow.webContents.on('did-fail-load', (_, code, desc) => {
    console.error('页面加载失败:', code, desc)
  })

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })
}

// ─── 系统托盘 ─────────────────────────────────────────────────
function createTray() {
  let trayIcon = nativeImage.createFromPath(APP_ICON_PATH)

  if (trayIcon.isEmpty()) {
    trayIcon = nativeImage.createFromPath(join(__dirname, '../../resources/icon.png'))
  }

  if (trayIcon.isEmpty()) {
    console.warn('托盘图标加载失败，使用默认')
    trayIcon = nativeImage.createEmpty()
  } else {
    trayIcon = trayIcon.resize({ width: 20, height: 20 })
  }

  tray = new Tray(trayIcon)
  tray.setToolTip('ClipAI — 智能剪贴板')

  tray.on('click', () => toggleWindow())

  const menu = Menu.buildFromTemplate([
    { label: '显示/隐藏 ClipAI', click: () => toggleWindow() },
    { type: 'separator' },
    { label: '截图', click: () => captureScreenshot() },
    { type: 'separator' },
    { label: '清空历史记录', click: async () => {
      const oldHistory = [...clipboardHistory]
      const favHistory = oldHistory.filter((i) => i && i.favorite)
      const nonFavImages = oldHistory.filter((i) => i && !i.favorite && i.type === 'image' && i.filePath)
      const favImagePaths = new Set(favHistory.filter((i) => i.type === 'image' && i.filePath).map((i) => i.filePath))

      // 1. 先持久化新历史
      let persistedHistory
      try {
        persistedHistory = persistHistory(favHistory)
      } catch (err) {
        console.error('托盘清空历史持久化失败，取消文件删除:', err)
        return
      }

      sendToRenderer('history-updated', persistedHistory)

      // 2. 持久化成功后再清理磁盘文件
      for (const item of nonFavImages) {
        if (!favImagePaths.has(item.filePath)) {
          await deleteImageFile(item.filePath)
        }
      }
    }},
    { type: 'separator' },
    { label: '退出', click: () => {
      globalShortcut.unregisterAll()
      clearInterval(monitorInterval)
      app.exit(0)
    }}
  ])
  tray.setContextMenu(menu)
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    mainWindow.show()
    mainWindow.focus()
    if (process.platform === 'darwin') {
      app.dock.show()
      app.focus({ steal: true })
    }
  }
}

// ─── 剪贴板监听 ───────────────────────────────────────────────
let isMonitoringClipboard = true

function startClipboardMonitor() {
  const text = clipboard.readText()
  if (text && text.trim()) {
    lastClipboardText = text
  }

  const img = clipboard.readImage()
  if (!img.isEmpty()) {
    lastClipboardImageHash = img.toBitmap().length.toString()
  }

  monitorInterval = setInterval(async () => {
    if (!isMonitoringClipboard) return

    try {
      const text = clipboard.readText()
      if (text && text.trim() && text !== lastClipboardText) {
        lastClipboardText = text
        const isUrl = /^https?:\/\//i.test(text.trim())
        const isCode = /[{};()=>\n\t]{3,}/.test(text)
        let label = '文本'
        if (isUrl) label = '链接'
        else if (isCode) label = '代码'

        await addToHistory({
          id: Date.now(),
          type: 'text',
          content: text,
          label,
          timestamp: new Date().toISOString(),
          favorite: false
        })
        return
      }

      const img = clipboard.readImage()
      if (!img.isEmpty()) {
        const bmp = img.toBitmap()
        const hash = bmp.length.toString()
        if (hash !== lastClipboardImageHash) {
          lastClipboardImageHash = hash
          const item = await saveImageToStorage(img, {
            id: Date.now(),
            label: '图片',
            isScreenshot: false,
            favorite: false
          })
          await addToHistory(item)
        }
      }
    } catch (e) {
      console.error('剪贴板监控异常:', e)
    }
  }, 600)
}

// ─── 图片磁盘配额管理 ──────────────────────────────────────────
async function enforceImageDiskQuota() {
  const { prunedIds, quotaExceededByFavorites } = planDiskPruning(clipboardHistory)
  if (quotaExceededByFavorites) {
    console.warn('⚠️ 收藏图片总大小已超过配额，根据安全策略不予自动删除收藏记录')
  }

  if (prunedIds.length > 0) {
    const prunedIdSet = new Set(prunedIds)
    const itemsToPrune = clipboardHistory.filter((i) => prunedIdSet.has(i.id))
    const updatedHistory = clipboardHistory.filter((i) => !prunedIdSet.has(i.id))

    // 1. 先持久化新历史
    let persistedHistory
    try {
      persistedHistory = persistHistory(updatedHistory)
      sendToRenderer('history-updated', persistedHistory)
    } catch (err) {
      console.error('配额清理持久化历史失败，取消文件删除:', err)
      return
    }

    // 2. 成功持久化后再删除磁盘文件
    for (const item of itemsToPrune) {
      if (item.filePath) {
        const stillUsed = persistedHistory.some((i) => i && i.filePath === item.filePath)
        if (!stillUsed) {
          await deleteImageFile(item.filePath)
        }
      }
    }
  }
}

async function addToHistory(item) {
  if (!item || !item.id) return { success: false, history: clipboardHistory }
  if (item.type === 'text') {
    if (clipboardHistory.find((h) => h.type === 'text' && h.content === item.content)) {
      return { success: true, history: clipboardHistory }
    }
  }

  const nextHistory = [item, ...clipboardHistory]
  const persisted = persistHistory(nextHistory)
  sendToRenderer('history-updated', persisted)

  if (item.type === 'image') {
    await enforceImageDiskQuota()
  }
  return { success: true, history: persisted }
}

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data)
  }
}

// ─── 全屏交互截图 (跨平台支持 macOS + Windows / Linux) ─────────────
async function openSnipperWindow() {
  if (snipperWindow && !snipperWindow.isDestroyed()) {
    snipperWindow.focus()
    return
  }

  const cursorPoint = screen.getCursorScreenPoint()
  const targetDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay()
  const { x, y, width, height } = targetDisplay.bounds
  const scaleFactor = targetDisplay.scaleFactor || 1

  try {
    let screenDataUrl = null

    if (process.platform === 'darwin') {
      const tmpFile = join(app.getPath('temp'), `clipai_screen_${Date.now()}.png`)
      try {
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        const execFileAsync = promisify(execFile)
        await execFileAsync('/usr/sbin/screencapture', ['-x', tmpFile])
        const img = nativeImage.createFromPath(tmpFile)
        if (!img.isEmpty()) {
          screenDataUrl = img.toDataURL()
        }
      } catch (_) {} finally {
        try { await fs.unlink(tmpFile) } catch (_) {}
      }
    }

    if (!screenDataUrl) {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) }
      })
      const selection = selectDesktopCapturerSource(sources, targetDisplay)
      if (selection.source) {
        if (selection.reason) {
          console.warn(`[Snipper] 屏幕选择提示: ${selection.reason}`)
        }
        screenDataUrl = selection.source.thumbnail.toDataURL()
      }
    }

    if (!screenDataUrl) {
      throw new Error('无法捕获屏幕画面，请检查系统屏幕录制/截图权限')
    }

    currentSnipperData = {
      image: screenDataUrl,
      bounds: { width, height },
      scaleFactor
    }

    snipperWindow = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      transparent: true,
      fullscreen: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      icon: APP_ICON_PATH,
      webPreferences: {
        preload: getPreloadPath('snipper'),
        sandbox: true,
        contextIsolation: true
      }
    })

    snipperWindow.setBounds({ x, y, width, height })

    if (process.platform === 'darwin') {
      snipperWindow.setAlwaysOnTop(true, 'screen-saver')
      snipperWindow.setVisibleOnAllWorkspaces(true)
    } else {
      snipperWindow.setAlwaysOnTop(true, 'status')
    }

    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      snipperWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#snipper`)
    } else {
      snipperWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'snipper' })
    }

    snipperWindow.on('closed', () => {
      snipperWindow = null
      currentSnipperData = null
    })
  } catch (err) {
    console.error('启动全屏截图窗口失败，降级为直接后台截图:', err.message)
    captureScreenshotDirect()
  }
}

async function captureScreenshot() {
  if (process.platform === 'darwin') {
    const tmpFile = join(app.getPath('temp'), `clipai_shot_${Date.now()}.png`)
    try {
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)

      // -i 交互截图, -x 静音截取, tmpFile (无需隐藏主窗口，保持屏幕常驻)
      await execFileAsync('/usr/sbin/screencapture', ['-i', '-x', tmpFile])

      const img = nativeImage.createFromPath(tmpFile)
      if (!img.isEmpty()) {
        const item = await saveImageToStorage(img, {
          id: Date.now(),
          label: '截图',
          isScreenshot: true,
          favorite: false
        })
        await addToHistory(item)
        clipboard.writeImage(img)
        lastClipboardImageHash = img.toBitmap().length.toString()

        // 截图成功后：发送成功通知并直接打开大图编辑/查看器窗口
        if (mainWindow && !mainWindow.isDestroyed()) {
          sendToRenderer('screenshot-success', item)
        }
        // 直接打开大图编辑器进行二次涂鸦与 AI 识别
        openImageViewer(item)

        try { await fs.unlink(tmpFile) } catch {}
        return item
      }
    } catch (e) {
      console.log('用户按下 ESC 取消截图或退出')
    } finally {
      try { await fs.unlink(tmpFile) } catch {}
    }
  } else {
    // Windows / Linux: 打开全屏截图选区窗口
    await openSnipperWindow()
  }

  return null
}

async function captureScreenshotDirect() {
  try {
    if (process.platform === 'darwin') {
      const tmpFile = join(app.getPath('temp'), `clipai_snap_${Date.now()}.png`)
      const { execFile } = await import('child_process')
      const { promisify } = await import('util')
      const execFileAsync = promisify(execFile)
      await execFileAsync('/usr/sbin/screencapture', ['-i', '-c', tmpFile])
      const img = clipboard.readImage()
      if (!img.isEmpty()) {
        const item = await saveImageToStorage(img, {
          id: Date.now(),
          label: '截图',
          isScreenshot: true,
          favorite: false
        })
        await addToHistory(item)
        sendToRenderer('screenshot-success', item)
      }
      try { await fs.unlink(tmpFile) } catch (_) {}
    } else {
      const cursorPoint = screen.getCursorScreenPoint()
      const targetDisplay = screen.getDisplayNearestPoint(cursorPoint) || screen.getPrimaryDisplay()
      const { width, height } = targetDisplay.bounds
      const scaleFactor = targetDisplay.scaleFactor || 1
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: Math.round(width * scaleFactor), height: Math.round(height * scaleFactor) }
      })
      const selection = selectDesktopCapturerSource(sources, targetDisplay)
      if (selection.source) {
        if (selection.reason) {
          console.warn(`[ScreenshotDirect] 屏幕选择提示: ${selection.reason}`)
        }
        const img = selection.source.thumbnail
        const item = await saveImageToStorage(img, {
          id: Date.now(),
          label: '截图',
          isScreenshot: true,
          favorite: false
        })
        await addToHistory(item)
        sendToRenderer('screenshot-success', item)
      }
    }
  } catch (e) {
    console.error('后台截图异常:', e)
  }
}

// ─── 全局快捷键注册事务引擎 ────────────────────────────────────
let currentActiveShortcuts = getDefaultShortcuts(process.platform)

function registerGlobalShortcuts(requestedShortcuts = {}) {
  const result = executeShortcutTransaction({
    targetShortcuts: requestedShortcuts,
    previousShortcuts: currentActiveShortcuts,
    registerFn: (type, key) => {
      try {
        if (type === 'shortcut') {
          return globalShortcut.register(key, () => toggleWindow())
        } else if (type === 'screenshotShortcut') {
          return globalShortcut.register(key, () => captureScreenshot())
        }
        return false
      } catch (err) {
        console.warn(`⚠️ 注册全局快捷键异常 [${type}:${key}]:`, err.message)
        return false
      }
    },
    unregisterAllFn: () => {
      try {
        globalShortcut.unregisterAll()
      } catch (_) {}
    }
  })

  // 确保存储与运行状态严格等于真实生效的快捷键
  currentActiveShortcuts = { ...result.activeShortcuts }
  return result
}

// ─── 全主流 AI 统一请求调度引擎 ────────────────────────────
const PROVIDER_DEFAULT_URLS = {
  deepseek: 'https://api.deepseek.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  ernie: 'https://qianfan.baidubce.com/v2',
  hunyuan: 'https://api.hunyuan.cloud.tencent.com/v1',
  minimax: 'https://api.minimax.chat/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openai: 'https://api.openai.com/v1',
  claude: 'https://api.anthropic.com/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  siliconflow: 'https://api.siliconflow.cn/v1',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  together: 'https://api.together.xyz/v1',
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1',
  custom: ''
}

const PROVIDER_DEFAULT_MODELS = {
  deepseek: 'deepseek-chat',
  qwen: 'qwen-plus',
  zhipu: 'glm-4-flash',
  moonshot: 'moonshot-v1-8k',
  doubao: 'doubao-pro-32k',
  ernie: 'ernie-speed-128k',
  hunyuan: 'hunyuan-standard',
  minimax: 'abab6.5s-chat',
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  claude: 'claude-3-7-sonnet-20250219',
  mistral: 'mistral-large-latest',
  xai: 'grok-2',
  siliconflow: 'deepseek-ai/DeepSeek-V3',
  groq: 'deepseek-r1-distill-llama-70b',
  openrouter: 'deepseek/deepseek-r1',
  together: 'deepseek-ai/DeepSeek-R1',
  ollama: 'deepseek-r1',
  lmstudio: 'local-model',
  custom: ''
}

async function executeAIRequest(params = {}) {
  const {
    provider = 'gemini',
    apiKey,
    model,
    customBaseUrl,
    prompt,
    text,
    content,
    filePath,
    type,
    messages: inputMessagesParam,
    inputMessages,
    timeoutMs = 60000
  } = params

  const providerConfigs = store?.get('providerConfigs', {}) || {}
  const currentProviderConfig = providerConfigs[provider] || {}
  
  // 权威且优先使用 safeStorage 解密出的真实 Key；若传入的 apiKey 包含脱敏掩码，坚决过滤丢弃！
  const decryptedSecureKey = getDecryptedApiKey(provider)
  const safeInputApiKey = (apiKey && !isMaskedApiKey(apiKey)) ? apiKey.trim() : ''
  const safeProviderConfigKey = (currentProviderConfig.apiKey && !isMaskedApiKey(currentProviderConfig.apiKey)) ? currentProviderConfig.apiKey.trim() : ''
  const safeStoreKey = (store?.get('apiKey') && !isMaskedApiKey(store.get('apiKey'))) ? store.get('apiKey').trim() : ''

  const finalApiKey = safeInputApiKey || decryptedSecureKey || safeProviderConfigKey || (provider === 'gemini' ? safeStoreKey : '')
  const finalModel = (model || currentProviderConfig.model || PROVIDER_DEFAULT_MODELS[provider] || 'gemini-2.5-flash').trim()
  const finalBaseUrl = (customBaseUrl || currentProviderConfig.customBaseUrl || PROVIDER_DEFAULT_URLS[provider] || '').trim()

  const isLocalOrFree = provider === 'ollama' || provider === 'lmstudio' || finalModel.includes('flash')
  if (!isLocalOrFree && !finalApiKey && provider !== 'custom') {
    return { success: false, error: `请先在设置中填写 ${provider.toUpperCase()} 的 API Key` }
  }

  let imageBase64DataUrl = null
  if (type === 'image' || (content && content.startsWith('data:image'))) {
    if (content && content.startsWith('data:image')) {
      imageBase64DataUrl = content
    } else if (filePath) {
      imageBase64DataUrl = await loadImageAsDataUrl(filePath)
    }
  }

  const queryText = text || (!imageBase64DataUrl && content ? content : '') || ''
  const isImage = Boolean(imageBase64DataUrl)
  const activeMessages = (Array.isArray(inputMessagesParam) && inputMessagesParam.length > 0)
    ? inputMessagesParam
    : (Array.isArray(inputMessages) && inputMessages.length > 0 ? inputMessages : null)

  if (!isImage && !queryText.trim() && !prompt?.trim() && (!activeMessages || activeMessages.length === 0)) {
    return { success: false, error: '请提供要处理的内容' }
  }

  try {
    // 1. Google Gemini 协议
    if (provider === 'gemini') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${finalModel}:generateContent?key=${finalApiKey}`
      let body
      if (isImage) {
        const mimeMatch = imageBase64DataUrl.match(/^data:(image\/\w+);base64,/)
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png'
        const base64Data = imageBase64DataUrl.replace(/^data:image\/\w+;base64,/, '')
        body = {
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: prompt ? `${prompt}\n\n${queryText || '请仔细分析此图片并提取关键信息'}` : (queryText || '请仔细分析此图片并提取关键信息') }
            ]
          }]
        }
      } else if (activeMessages && activeMessages.length > 0) {
        const geminiContents = []
        let systemText = prompt || ''
        activeMessages.forEach((m) => {
          if (m.role === 'system') {
            systemText = systemText ? `${systemText}\n${m.content}` : m.content
          } else {
            geminiContents.push({
              role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })
          }
        })
        body = { contents: geminiContents }
        if (systemText) {
          body.systemInstruction = { parts: [{ text: systemText }] }
        }
      } else {
        body = {
          contents: [{
            parts: [{ text: queryText }]
          }]
        }
        if (prompt) {
          body.systemInstruction = { parts: [{ text: prompt }] }
        }
      }

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, timeoutMs)

      const data = await parseResponseSafe(res, 'Gemini')
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text
      if (result) return { success: true, result }
      const errMsg = data.error?.message || JSON.stringify(data)
      return { success: false, error: `Gemini 请求未返回有效结果: ${errMsg}` }
    }

    // 2. Anthropic Claude 协议
    if (provider === 'claude') {
      const baseUrl = finalBaseUrl || 'https://api.anthropic.com/v1'
      const url = `${baseUrl.replace(/\/+$/, '')}/messages`
      
      const messages = []
      if (isImage) {
        const mimeMatch = imageBase64DataUrl.match(/^data:(image\/\w+);base64,/)
        const mediaType = mimeMatch ? mimeMatch[1] : 'image/png'
        const base64Data = imageBase64DataUrl.replace(/^data:image\/\w+;base64,/, '')
        messages.push({
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data }
            },
            { type: 'text', text: queryText || '请仔细分析此图片并提取关键信息' }
          ]
        })
      } else if (activeMessages && activeMessages.length > 0) {
        activeMessages.filter((m) => m.role !== 'system').forEach((m) => {
          messages.push({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })
        })
      } else {
        messages.push({ role: 'user', content: queryText })
      }

      const body = {
        model: finalModel,
        max_tokens: 4096,
        messages
      }
      if (prompt) body.system = prompt

      const res = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': finalApiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      }, timeoutMs)

      const data = await parseResponseSafe(res, 'Claude')
      const result = data.content?.[0]?.text
      if (result) return { success: true, result }
      const errMsg = data.error?.message || JSON.stringify(data)
      return { success: false, error: `Claude 请求异常: ${errMsg}` }
    }

    // 3. OpenAI 标准兼容协议（DeepSeek, 通义千问, 智谱, Moonshot, 豆包, MiniMax, Groq, Ollama 等）
    const baseUrl = finalBaseUrl || PROVIDER_DEFAULT_URLS[provider] || 'https://api.openai.com/v1'
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`

    const messages = []
    if (prompt) messages.push({ role: 'system', content: prompt })

    if (isImage) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: queryText || '请仔细分析此图片并提取关键信息' },
          { type: 'image_url', image_url: { url: imageBase64DataUrl } }
        ]
      })
    } else if (activeMessages && activeMessages.length > 0) {
      activeMessages.forEach((m) => {
        messages.push({ role: m.role === 'model' ? 'assistant' : m.role, content: m.content })
      })
    } else {
      messages.push({ role: 'user', content: queryText })
    }

    const headers = { 'Content-Type': 'application/json' }
    if (finalApiKey) {
      headers['Authorization'] = `Bearer ${finalApiKey}`
    }

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: finalModel,
        messages,
        temperature: 0.7
      })
    }, timeoutMs)

    const data = await parseResponseSafe(res, provider)
    const result = data.choices?.[0]?.message?.content
    if (result) return { success: true, result }
    const errMsg = data.error?.message || data.message || JSON.stringify(data)
    return { success: false, error: `${provider.toUpperCase()} 请求异常: ${errMsg}` }

  } catch (err) {
    console.error(`AI 请求调度发生错误 (${provider}):`, sanitizeTextForLogs(err.message))
    return { success: false, error: sanitizeTextForLogs(err.message) || '网络连接超时或异常' }
  }
}

// ─── 统一 IPC 接口调度与权限过滤 ─────────────────────────────────
ipcMain.handle('get-history', (event) => {
  if (!verifyIpcSender(event, ['main'])) return []
  return clipboardHistory
})

ipcMain.handle('copy-to-clipboard', async (event, item) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  if (!item) return { success: false, error: 'Item is required' }
  try {
    isMonitoringClipboard = false
    if (item.type === 'text') {
      clipboard.writeText(item.content || '')
      lastClipboardText = item.content || ''
    } else if (item.type === 'image') {
      let img = null
      if (item.filePath) {
        img = await loadImageFromStorage(item.filePath)
      } else if (item.content && item.content.startsWith('data:image')) {
        img = nativeImage.createFromDataURL(item.content)
      }
      if (img && !img.isEmpty()) {
        clipboard.writeImage(img)
        lastClipboardImageHash = img.toBitmap().length.toString()
      }
    }
    setTimeout(() => { isMonitoringClipboard = true }, 800)
    return { success: true }
  } catch (e) {
    isMonitoringClipboard = true
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-item', async (event, id) => {
  if (!verifyIpcSender(event, ['main'])) {
    return { success: false, history: clipboardHistory, error: 'Unauthorized' }
  }
  const targetItem = clipboardHistory.find((i) => i && i.id === id)
  const newHistory = clipboardHistory.filter((i) => i && i.id !== id)
  
  // 1. 先持久化新历史
  let persistedHistory
  try {
    persistedHistory = persistHistory(newHistory)
  } catch (err) {
    console.error('删除项目持久化失败，取消文件删除:', err)
    return { success: false, history: clipboardHistory, error: 'Store persistence failed' }
  }

  sendToRenderer('history-updated', persistedHistory)

  // 2. 成功持久化后再清理文件
  if (targetItem && targetItem.type === 'image' && targetItem.filePath) {
    const isReferencedElsewhere = persistedHistory.some((i) => i && i.type === 'image' && i.filePath === targetItem.filePath)
    if (!isReferencedElsewhere) {
      await deleteImageFile(targetItem.filePath)
    }
  }
  return { success: true, history: persistedHistory }
})

ipcMain.handle('toggle-favorite', (event, id) => {
  if (!verifyIpcSender(event, ['main'])) {
    return { success: false, history: clipboardHistory, error: 'Unauthorized' }
  }
  const nextHistory = clipboardHistory.map((item) => {
    if (item && item.id === id) return { ...item, favorite: !item.favorite }
    return item
  })
  try {
    const persistedHistory = persistHistory(nextHistory)
    sendToRenderer('history-updated', persistedHistory)
    return { success: true, history: persistedHistory }
  } catch (err) {
    return { success: false, history: clipboardHistory, error: err.message }
  }
})

ipcMain.handle('clear-history', async (event) => {
  if (!verifyIpcSender(event, ['main'])) {
    return { success: false, history: clipboardHistory, error: 'Unauthorized' }
  }
  const oldHistory = [...clipboardHistory]
  const favHistory = oldHistory.filter((i) => i && i.favorite)
  const nonFavImages = oldHistory.filter((i) => i && !i.favorite && i.type === 'image' && i.filePath)
  const favImagePaths = new Set(favHistory.filter((i) => i.type === 'image' && i.filePath).map((i) => i.filePath))

  // 1. 先持久化新历史
  let persistedHistory
  try {
    persistedHistory = persistHistory(favHistory)
  } catch (err) {
    console.error('清空历史持久化失败，取消文件删除:', err)
    return { success: false, history: oldHistory, error: 'Store persistence failed' }
  }

  sendToRenderer('history-updated', persistedHistory)

  // 2. 成功持久化后删除非收藏图片文件
  for (const item of nonFavImages) {
    if (!favImagePaths.has(item.filePath)) {
      await deleteImageFile(item.filePath)
    }
  }
  return { success: true, history: persistedHistory }
})

ipcMain.handle('take-screenshot', (event) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  return captureScreenshot()
})

ipcMain.handle('ai-request', (event, params) => {
  if (!verifyIpcSender(event, ['main', 'viewer'])) return { success: false, error: 'Unauthorized' }
  return executeAIRequest(params)
})

ipcMain.handle('test-ai-connection', async (event, params = {}) => {
  if (!verifyIpcSender(event, ['main', 'viewer'])) return { success: false, error: 'Unauthorized' }
  try {
    const res = await executeAIRequest({
      ...params,
      prompt: '你是一个智能助手，请只输出纯文本：OK',
      text: 'ping',
      timeoutMs: 15000
    })
    if (res.success && res.result) {
      return { success: true, message: '连接成功！' }
    }
    return { success: false, error: res.error || '未收到有效响应' }
  } catch (e) {
    return { success: false, error: sanitizeTextForLogs(e.message) }
  }
})

// ─── API Key 安全存储 IPC ─────────────────────────────────────
ipcMain.handle('save-api-key', (event, { provider, apiKey }) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  return saveEncryptedApiKey(provider, apiKey)
})

ipcMain.handle('has-api-key', (event, provider) => {
  if (!verifyIpcSender(event, ['main', 'viewer'])) return false
  return hasApiKey(provider)
})

ipcMain.handle('clear-api-key', (event, provider) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  return saveEncryptedApiKey(provider, '')
})

// ─── 设置与系统控制 IPC ───────────────────────────────────────
ipcMain.handle('get-settings', (event) => {
  if (!verifyIpcSender(event, ['main', 'viewer'])) return {}
  const allStored = store?.store || {}
  const safe = filterSafeSettings(allStored, DEFAULT_SETTINGS)
  const maskedKeys = getMaskedApiKeys()
  if (maskedKeys.gemini) {
    safe.apiKey = maskedKeys.gemini
  }
  if (safe.providerConfigs) {
    Object.keys(safe.providerConfigs).forEach((p) => {
      if (maskedKeys[p]) {
        safe.providerConfigs[p].apiKey = maskedKeys[p]
      }
    })
  }
  return safe
})

ipcMain.handle('set-window-opacity', (event, opacity) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  if (mainWindow && !mainWindow.isDestroyed()) {
    const num = Number(opacity)
    if (Number.isFinite(num)) {
      const val = Math.min(Math.max(num, 0.4), 1.0)
      mainWindow.setOpacity(val)
      store?.set('windowOpacity', Math.round(val * 100))
      return { success: true }
    }
  }
  return { success: false }
})

ipcMain.handle('set-settings', (event, s) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  if (!s || typeof s !== 'object') return { success: false, error: 'Invalid settings payload' }
  
  let shortcutResult = null
  const hasShortcutChange = 'shortcut' in s || 'screenshotShortcut' in s
  
  if (hasShortcutChange) {
    const defaultShortcuts = getDefaultShortcuts(process.platform)
    const target = {
      shortcut: 'shortcut' in s ? resolveStoredShortcut(s.shortcut, defaultShortcuts.shortcut) : resolveStoredShortcut(store?.get('shortcut'), defaultShortcuts.shortcut),
      screenshotShortcut: 'screenshotShortcut' in s ? resolveStoredShortcut(s.screenshotShortcut, defaultShortcuts.screenshotShortcut) : resolveStoredShortcut(store?.get('screenshotShortcut'), defaultShortcuts.screenshotShortcut)
    }
    shortcutResult = registerGlobalShortcuts(target)
    if (shortcutResult.success) {
      if ('shortcut' in s) store?.set('shortcut', target.shortcut)
      if ('screenshotShortcut' in s) store?.set('screenshotShortcut', target.screenshotShortcut)
    }
  }

  // 拦截并安全加密存储 API Key（防止明文写入 store）
  let apiKeyError = null
  if ('apiKey' in s && typeof s.apiKey === 'string') {
    if (s.apiKey.trim() && !isMaskedApiKey(s.apiKey)) {
      const res = saveEncryptedApiKey('gemini', s.apiKey.trim())
      if (!res.success || !res.secure) {
        apiKeyError = res.error || 'Gemini API Key 安全加密存储失败'
      }
    }
  }

  if (s.providerConfigs && typeof s.providerConfigs === 'object') {
    const cleanConfigs = { ...(store?.get('providerConfigs', {}) || {}) }
    for (const [provider, config] of Object.entries(s.providerConfigs)) {
      cleanConfigs[provider] = cleanConfigs[provider] || {}
      if (config.model) cleanConfigs[provider].model = config.model
      if (config.customBaseUrl !== undefined) cleanConfigs[provider].customBaseUrl = config.customBaseUrl
      if (config.apiKey && typeof config.apiKey === 'string' && !isMaskedApiKey(config.apiKey)) {
        const res = saveEncryptedApiKey(provider, config.apiKey.trim())
        if (!res.success || !res.secure) {
          apiKeyError = res.error || `${provider} API Key 安全加密存储失败`
        }
      }
    }
    store?.set('providerConfigs', cleanConfigs)
  }

  if (apiKeyError) {
    return { success: false, error: apiKeyError }
  }

  Object.entries(s).forEach(([k, v]) => {
    if (k === 'shortcut' || k === 'screenshotShortcut' || k === 'apiKey' || k === 'providerConfigs') return
    if (SETTINGS_WHITELIST_KEYS.includes(k)) {
      store?.set(k, v)
    }
  })

  if ('maxHistory' in s) {
    persistHistory(clipboardHistory)
  }
  if ('alwaysOnTop' in s && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(Boolean(s.alwaysOnTop))
  }
  if ('windowOpacity' in s && mainWindow && !mainWindow.isDestroyed()) {
    const num = Number(s.windowOpacity)
    if (Number.isFinite(num)) {
      const val = Math.min(Math.max(num / 100, 0.4), 1.0)
      mainWindow.setOpacity(val)
    }
  }

  // 实时将新配置（如语言）广播给查看器与截图窗口
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.webContents.send('settings-changed', s)
  }
  if (snipperWindow && !snipperWindow.isDestroyed()) {
    snipperWindow.webContents.send('settings-changed', s)
  }

  return {
    success: shortcutResult ? shortcutResult.success : true,
    shortcutResult,
    activeShortcuts: currentActiveShortcuts
  }
})

// 模型列表探测
ipcMain.handle('list-gemini-models', async (event, apiKey) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  const decryptedSecureKey = getDecryptedApiKey('gemini')
  const safeInputApiKey = (apiKey && !isMaskedApiKey(apiKey)) ? apiKey.trim() : ''
  const finalKey = safeInputApiKey || decryptedSecureKey || store?.get('apiKey', '') || ''
  
  if (!finalKey) return { success: false, error: '请先配置有效的 Gemini API Key' }
  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${finalKey}`,
      {},
      15000
    )
    const data = await parseResponseSafe(res, 'Gemini')
    if (data.models && Array.isArray(data.models)) {
      const models = data.models
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          name: m.name.replace('models/', ''),
          displayName: m.displayName || m.name.replace('models/', ''),
          description: m.description || ''
        }))
      return { success: true, models }
    }
    return { success: false, error: data.error?.message || '未获取到模型列表' }
  } catch (err) {
    return { success: false, error: sanitizeTextForLogs(err.message) }
  }
})

ipcMain.handle('list-models', async (event, { provider, apiKey, customBaseUrl } = {}) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  const p = provider || 'gemini'
  const providerConfigs = store?.get('providerConfigs', {}) || {}
  const currentConfig = providerConfigs[p] || {}
  const decryptedSecureKey = getDecryptedApiKey(p)
  const safeInputApiKey = (apiKey && !isMaskedApiKey(apiKey)) ? apiKey.trim() : ''
  const safeConfigKey = (currentConfig.apiKey && !isMaskedApiKey(currentConfig.apiKey)) ? currentConfig.apiKey.trim() : ''
  const finalKey = safeInputApiKey || decryptedSecureKey || safeConfigKey || (p === 'gemini' ? store?.get('apiKey', '') : '')

  const isLocal = p === 'ollama' || p === 'lmstudio'
  if (!isLocal && !finalKey && p !== 'custom') {
    return { success: false, error: `请先配置 ${p.toUpperCase()} 的 API Key` }
  }

  try {
    if (p === 'gemini') {
      const res = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${finalKey}`,
        {},
        15000
      )
      const data = await parseResponseSafe(res, 'Gemini')
      if (data.models && Array.isArray(data.models)) {
        const models = data.models
          .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
          .map((m) => ({
            name: m.name.replace('models/', ''),
            displayName: m.displayName || m.name.replace('models/', '')
          }))
        return { success: true, models }
      }
      return { success: false, error: data.error?.message || '未获取到模型列表' }
    }

    const baseUrl = customBaseUrl || currentConfig.customBaseUrl || PROVIDER_DEFAULT_URLS[p] || ''
    if (!baseUrl) return { success: false, error: '未配置 Base URL' }

    const url = `${baseUrl.replace(/\/+$/, '')}/models`
    const headers = {}
    if (finalKey) headers['Authorization'] = `Bearer ${finalKey}`

    const res = await fetchWithTimeout(url, { headers }, 15000)
    const data = await parseResponseSafe(res, p)
    if (data.data && Array.isArray(data.data)) {
      const models = data.data.map((m) => ({
        name: m.id || m.name,
        displayName: m.id || m.name
      }))
      return { success: true, models }
    }
    return { success: false, error: '未获取到模型列表' }
  } catch (err) {
    return { success: false, error: sanitizeTextForLogs(err.message) }
  }
})

// 提示词库持久化
ipcMain.handle('get-prompts', (event) => {
  if (!verifyIpcSender(event, ['main'])) return []
  return store?.get('prompts', [])
})

ipcMain.handle('save-prompts', (event, prompts) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  store?.set('prompts', prompts)
  return { success: true }
})

ipcMain.handle('sync-prompts-chat', (event) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  return { success: true }
})

// 窗口与系统操作
ipcMain.handle('hide-window', (event) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide()
  return { success: true }
})

ipcMain.handle('minimize-window', (event) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
  return { success: true }
})

ipcMain.handle('quit-app', (event) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  globalShortcut.unregisterAll()
  clearInterval(monitorInterval)
  app.exit(0)
})

ipcMain.handle('open-external', (event, url) => {
  if (!verifyIpcSender(event, ['main', 'viewer'])) return { success: false, error: 'Unauthorized' }
  if (isSafeExternalUrl(url)) {
    shell.openExternal(url)
    return { success: true }
  }
  return { success: false, error: 'Invalid URL scheme' }
})

ipcMain.handle('show-notification', (event, { title, body, emoji } = {}) => {
  if (!verifyIpcSender(event, ['main', 'viewer'])) return { success: false, error: 'Unauthorized' }
  if (Notification.isSupported()) {
    new Notification({
      title: emoji ? `${emoji} ${title || 'ClipAI'}` : (title || 'ClipAI'),
      body: body || '',
      icon: APP_ICON_PATH
    }).show()
    return { success: true }
  }
  return { success: false }
})

ipcMain.handle('set-compact-mode', (event, isCompact) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  if (!mainWindow || mainWindow.isDestroyed()) return { success: false }
  store?.set('compactMode', Boolean(isCompact))
  const [currentW, currentH] = mainWindow.getSize()
  if (isCompact) {
    mainWindow.setMinimumSize(320, 380)
    mainWindow.setSize(Math.min(currentW, 360), Math.min(currentH, 500), true)
  } else {
    mainWindow.setMinimumSize(380, 450)
    mainWindow.setSize(Math.max(currentW, 440), Math.max(currentH, 720), true)
  }
  return { success: true, compactMode: isCompact }
})

// ─── 独立高清大图查看器窗口 ────────────────────────────────────────
function openImageViewer(imageData) {
  currentViewerImage = imageData

  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    if (imageViewerWindow.isMinimized()) imageViewerWindow.restore()
    imageViewerWindow.show()
    imageViewerWindow.focus()
    imageViewerWindow.webContents.send('load-viewer-image', imageData)
    return { success: true }
  }

  imageViewerWindow = new BrowserWindow({
    width: 960,
    height: 700,
    minWidth: 440,
    minHeight: 340,
    title: 'ClipAI 高清图片查看器',
    backgroundColor: '#12131a',
    frame: false,
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: getPreloadPath('viewer'),
      sandbox: true,
      contextIsolation: true
    }
  })

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    imageViewerWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#viewer`)
  } else {
    imageViewerWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'viewer' })
  }

  const sendPayload = () => {
    if (imageViewerWindow && !imageViewerWindow.isDestroyed() && currentViewerImage) {
      imageViewerWindow.webContents.send('load-viewer-image', currentViewerImage)
    }
  }

  imageViewerWindow.once('ready-to-show', () => {
    imageViewerWindow.show()
    imageViewerWindow.focus()
    sendPayload()
  })

  imageViewerWindow.webContents.on('did-finish-load', () => {
    sendPayload()
  })

  imageViewerWindow.webContents.on('console-message', (_, level, message) => {
    console.log(`[Viewer-Renderer] ${message}`)
  })
  imageViewerWindow.webContents.on('render-process-gone', (e, details) => {
    console.error('⚠️ [Viewer] render process crashed:', details)
  })
  imageViewerWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL) => {
    console.error('⚠️ [Viewer] did-fail-load:', errorCode, errorDescription, validatedURL)
  })

  imageViewerWindow.on('closed', () => {
    imageViewerWindow = null
  })

  return { success: true }
}

ipcMain.handle('open-image-viewer', (event, img) => {
  if (!verifyIpcSender(event, ['main', 'snipper'])) return { success: false, error: 'Unauthorized' }
  return openImageViewer(img)
})

ipcMain.handle('get-current-viewer-image', (event) => {
  if (!verifyIpcSender(event, ['viewer', 'main'])) return null
  return currentViewerImage
})

ipcMain.handle('close-image-viewer', (event) => {
  if (!verifyIpcSender(event, ['viewer', 'main'])) return { success: false, error: 'Unauthorized' }
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.close()
  }
  return { success: true }
})

ipcMain.handle('minimize-image-viewer', (event) => {
  if (!verifyIpcSender(event, ['viewer'])) return { success: false, error: 'Unauthorized' }
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.minimize()
    return { success: true }
  }
  return { success: false, error: 'Viewer window not available' }
})

ipcMain.handle('copy-viewer-image', async (event, dataUrl) => {
  if (!verifyIpcSender(event, ['viewer'])) return { success: false, error: 'Unauthorized' }
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { success: false, error: '无效图片数据' }
  }

  const parsed = parseDataUrl(dataUrl)
  if (!parsed) return { success: false, error: '无法解析图片数据' }

  const buffer = Buffer.from(parsed.base64Data, 'base64')
  if (buffer.length > MAX_IMAGE_FILE_SIZE) {
    return { success: false, error: `图片过大 (${Math.round(buffer.length / 1024 / 1024)}MB > 25MB)` }
  }

  const img = nativeImage.createFromBuffer(buffer)
  if (img.isEmpty()) {
    return { success: false, error: '解码图片失败或图片为空' }
  }

  isMonitoringClipboard = false
  clipboard.writeImage(img)
  lastClipboardImageHash = img.toBitmap().length.toString()
  setTimeout(() => { isMonitoringClipboard = true }, 800)

  return { success: true }
})

ipcMain.handle('save-image-dialog', async (event, dataUrlOrPath) => {
  if (!verifyIpcSender(event, ['viewer', 'main'])) return { success: false, error: 'Unauthorized' }
  if (!dataUrlOrPath) return { success: false, error: '无图片数据' }
  try {
    const { filePath } = await dialog.showSaveDialog(imageViewerWindow || mainWindow, {
      title: '保存高清图片',
      defaultPath: `ClipAI_Image_${Date.now()}.png`,
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    })
    if (!filePath) return { canceled: true }

    if (dataUrlOrPath.startsWith('data:image')) {
      const base64Data = dataUrlOrPath.replace(/^data:image\/\w+;base64,/, '')
      await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'))
    } else {
      const img = await loadImageFromStorage(dataUrlOrPath)
      if (img && !img.isEmpty()) {
        await fs.writeFile(filePath, img.toPNG())
      } else {
        return { success: false, error: '未能加载图片' }
      }
    }
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── 截图交互窗口专用通道 ────────────────────────────────────────
ipcMain.handle('get-snipper-data', (event) => {
  if (!verifyIpcSender(event, ['snipper'])) return null
  return currentSnipperData
})

ipcMain.handle('finish-snipper', async (event, payload) => {
  if (!verifyIpcSender(event, ['snipper'])) return { success: false, error: 'Unauthorized' }

  return executeFinishSnipperTransaction(payload, {
    validatePayload: validateFinishSnipperPayload,
    saveDataUrl: saveDataUrlToStorage,
    addToHistory: async (item) => {
      const res = await addToHistory(item)
      if (!res || !res.success) {
        throw new Error('历史记录持久化失败')
      }
      return res
    },
    deleteImageFile: async (filePath) => {
      await deleteImageFile(filePath)
    },
    sendScreenshotSuccess: (item) => {
      sendToRenderer('screenshot-success', item)
    },
    writeClipboardImage: async (dataUrl) => {
      const parsed = parseDataUrl(dataUrl)
      if (!parsed) return
      const img = nativeImage.createFromBuffer(Buffer.from(parsed.base64Data, 'base64'))
      if (img.isEmpty()) return

      isMonitoringClipboard = false
      try {
        clipboard.writeImage(img)
        lastClipboardImageHash = img.toBitmap().length.toString()
      } finally {
        setTimeout(() => {
          isMonitoringClipboard = true
        }, 800)
      }
    },
    closeSnipperWindow: () => {
      if (snipperWindow && !snipperWindow.isDestroyed()) {
        snipperWindow.close()
      }
    },
    showMainWindow: () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    openImageViewer: (item) => {
      openImageViewer(item)
    },
    logWarning: (msg) => {
      console.warn(sanitizeTextForLogs(msg))
    }
  })
})

ipcMain.handle('close-snipper', (event) => {
  if (!verifyIpcSender(event, ['snipper'])) return { success: false, error: 'Unauthorized' }
  if (snipperWindow && !snipperWindow.isDestroyed()) {
    snipperWindow.close()
  }
  return { success: true }
})

ipcMain.handle('save-snipper-image', async (event, dataUrl) => {
  if (!verifyIpcSender(event, ['snipper'])) return { success: false, error: 'Unauthorized' }
  if (!dataUrl) return { success: false, error: '无截图数据' }
  try {
    const { filePath } = await dialog.showSaveDialog(snipperWindow || mainWindow, {
      title: '保存截屏图片',
      defaultPath: `ClipAI_Screenshot_${Date.now()}.png`,
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    })
    if (!filePath) return { canceled: true }
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
    await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'))
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('select-image-dialog', async (event) => {
  if (!verifyIpcSender(event, ['main'])) return { success: false, error: 'Unauthorized' }
  try {
    const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
      title: '选择图片文件',
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }
      ]
    })
    if (canceled || !filePaths || filePaths.length === 0) {
      return { canceled: true }
    }

    const selectedPath = filePaths[0]
    const ext = extname(selectedPath).toLowerCase()
    const mimeMap = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp'
    }
    const mime = mimeMap[ext] || 'image/png'
    const buffer = await fs.readFile(selectedPath)
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`
    return { success: true, dataUrl, filePath: selectedPath }
  } catch (err) {
    return { success: false, error: err.message }
  }
})

// ─── 应用生命周期与启动就绪流程 ─────────────────────────────────
app.whenReady().then(async () => {
  // 1. 注册受控自定义图片协议 clipai-image://
  registerImageProtocol()

  // 2. 初始化持久化存储
  await initStore()
  initSecureStorage(store)

  // 3. 阶段 0: 备份用户配置 (脱敏 API Key 并最多保留 3 份)
  await backupUserData()

  // 4. 阶段 6: 迁移存量明文 API Key 到 safeStorage 硬件密态存储
  migrateLegacyApiKeys()

  // 5. 迁移旧版 Base64 历史记录到结构化磁盘存储
  const rawHistory = store.get('history', [])
  const { migratedHistory, modified } = await migrateLegacyBase64History(rawHistory)
  if (modified) {
    persistHistory(migratedHistory)
  } else {
    clipboardHistory = Array.isArray(rawHistory) ? rawHistory : []
  }

  // 6. 清理孤立的临时文件与无主图片
  const referencedFiles = clipboardHistory
    .filter((i) => i && i.type === 'image' && i.filePath)
    .map((i) => i.filePath)
  cleanupOrphanFiles(referencedFiles)

  // 7. 检查初始图片配额
  await enforceImageDiskQuota()

  // 8. 默认拒绝所有未经明确授权的网页权限请求
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(false)
  })

  // 9. 创建界面与托盘
  createWindow()
  createTray()
  startClipboardMonitor()

  // 10. 注册全局快捷键（依据系统平台自适应默认值）
  const defaultShortcuts = getDefaultShortcuts(process.platform)
  const initialShortcut = resolveStoredShortcut(store.get('shortcut'), defaultShortcuts.shortcut)
  const initialScreenshotShortcut = resolveStoredShortcut(store.get('screenshotShortcut'), defaultShortcuts.screenshotShortcut)
  registerGlobalShortcuts({
    shortcut: initialShortcut,
    screenshotShortcut: initialScreenshotShortcut
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
})

// ─── 安全加固：WebView 与 WebContents 隔离 ─────────────────────
app.on('web-contents-created', (_, contents) => {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  const appRendererDir = join(__dirname, '../renderer')

  // 严格拦截新窗口打开
  contents.setWindowOpenHandler(({ url }) => {
    const policy = evaluateNavigationPolicy({
      url,
      contentsType: contents.getType(),
      devServerUrl,
      appRendererDir,
      isDev
    })

    if (policy === 'open-external') {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 严格校验导航
  contents.on('will-navigate', (e, url) => {
    const policy = evaluateNavigationPolicy({
      url,
      contentsType: contents.getType(),
      devServerUrl,
      appRendererDir,
      isDev
    })

    if (policy === 'allow-internal') {
      return
    }

    e.preventDefault()
    if (policy === 'open-external') {
      shell.openExternal(url)
    }
  })
})

app.on('window-all-closed', () => { /* 驻留托盘，不退出 */ })

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  clearInterval(monitorInterval)
})
