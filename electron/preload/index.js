import { contextBridge, ipcRenderer, webFrame } from 'electron'

contextBridge.exposeInMainWorld('clipai', {
  // 运行平台标识 ('darwin' | 'win32' | 'linux')
  platform: process.platform,

  // 历史记录
  getHistory: () => ipcRenderer.invoke('get-history'),
  copyToClipboard: (item) => ipcRenderer.invoke('copy-to-clipboard', item),
  deleteItem: (id) => ipcRenderer.invoke('delete-item', id),
  toggleFavorite: (id) => ipcRenderer.invoke('toggle-favorite', id),
  clearHistory: () => ipcRenderer.invoke('clear-history'),

  // 截图
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),

  // AI 请求与测试
  aiRequest: (params) => ipcRenderer.invoke('ai-request', params),
  askAI: (params) => ipcRenderer.invoke('ai-request', params),
  testAIConnection: (params) => ipcRenderer.invoke('test-ai-connection', params),
  listModels: (params) => ipcRenderer.invoke('list-models', params),
  listGeminiModels: (apiKey) => ipcRenderer.invoke('list-gemini-models', apiKey),
  saveApiKey: (provider, apiKey) => ipcRenderer.invoke('save-api-key', { provider, apiKey }),
  hasApiKey: (provider) => ipcRenderer.invoke('has-api-key', provider),
  clearApiKey: (provider) => ipcRenderer.invoke('clear-api-key', provider),

  // 缩放与显示控制
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),
  setCompactMode: (isCompact) => ipcRenderer.invoke('set-compact-mode', isCompact),
  setWindowOpacity: (opacity) => ipcRenderer.invoke('set-window-opacity', opacity),

  // 设置
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),

  // 提示词
  getPrompts: () => ipcRenderer.invoke('get-prompts'),
  savePrompts: (prompts) => ipcRenderer.invoke('save-prompts', prompts),
  syncPromptsChat: () => ipcRenderer.invoke('sync-prompts-chat'),

  // 窗口控制
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  showNotification: (payload) => ipcRenderer.invoke('show-notification', payload),

  // 独立图片查看器与自定义壁纸
  selectImageDialog: () => ipcRenderer.invoke('select-image-dialog'),
  openImageViewer: (imageData) => ipcRenderer.invoke('open-image-viewer', imageData),
  getCurrentViewerImage: () => ipcRenderer.invoke('get-current-viewer-image'),
  saveImageDialog: (dataUrl) => ipcRenderer.invoke('save-image-dialog', dataUrl),
  closeImageViewer: () => ipcRenderer.invoke('close-image-viewer'),

  // 全屏交互截图
  getSnipperData: () => ipcRenderer.invoke('get-snipper-data'),
  closeSnipper: () => ipcRenderer.invoke('close-snipper'),
  finishSnipper: (data) => ipcRenderer.invoke('finish-snipper', data),
  saveSnipperImage: (dataUrl) => ipcRenderer.invoke('save-snipper-image', dataUrl),

  onLoadViewerImage: (callback) => {
    const handler = (_, img) => callback(img)
    ipcRenderer.on('load-viewer-image', handler)
    return () => ipcRenderer.removeListener('load-viewer-image', handler)
  },

  // 事件监听
  onHistoryUpdated: (callback) => {
    const handler = (_, history) => callback(history)
    ipcRenderer.on('history-updated', handler)
    return () => ipcRenderer.removeListener('history-updated', handler)
  },
  onScreenshotSuccess: (callback) => {
    const handler = (_, item) => callback(item)
    ipcRenderer.on('screenshot-success', handler)
    return () => ipcRenderer.removeListener('screenshot-success', handler)
  }
})
