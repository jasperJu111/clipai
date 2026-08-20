import { contextBridge, ipcRenderer, webFrame } from 'electron'

// 🖼️ 独立图片查看器最小权限 Preload 脚本
contextBridge.exposeInMainWorld('clipai', {
  getCurrentViewerImage: () => ipcRenderer.invoke('get-current-viewer-image'),
  saveImageDialog: (dataUrl) => ipcRenderer.invoke('save-image-dialog', dataUrl),
  closeImageViewer: () => ipcRenderer.invoke('close-image-viewer'),

  // 专用受控复制与最小化接口
  copyImageToClipboard: (dataUrl) => ipcRenderer.invoke('copy-viewer-image', dataUrl),
  minimizeImageViewer: () => ipcRenderer.invoke('minimize-image-viewer'),

  // AI 问答与连通性测试（受控）
  aiRequest: (params) => ipcRenderer.invoke('ai-request', params),
  askAI: (params) => ipcRenderer.invoke('ai-request', params),
  testAIConnection: (params) => ipcRenderer.invoke('test-ai-connection', params),

  // 基础读取设置与通知
  getSettings: () => ipcRenderer.invoke('get-settings'),
  showNotification: (payload) => ipcRenderer.invoke('show-notification', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // 缩放控制
  setZoomFactor: (factor) => webFrame.setZoomFactor(factor),
  getZoomFactor: () => webFrame.getZoomFactor(),

  // 监听图片加载
  onLoadViewerImage: (callback) => {
    const handler = (_, img) => callback(img)
    ipcRenderer.on('load-viewer-image', handler)
    return () => ipcRenderer.removeListener('load-viewer-image', handler)
  }
})
