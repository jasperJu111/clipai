import { contextBridge, ipcRenderer } from 'electron'

// 📸 全屏截图交互窗口最小权限 Preload 脚本
contextBridge.exposeInMainWorld('clipai', {
  // 运行平台标识 ('darwin' | 'win32' | 'linux')
  platform: process.platform,

  getSnipperData: () => ipcRenderer.invoke('get-snipper-data'),
  finishSnipper: (data) => ipcRenderer.invoke('finish-snipper', data),
  closeSnipper: () => ipcRenderer.invoke('close-snipper'),
  saveSnipperImage: (dataUrl) => ipcRenderer.invoke('save-snipper-image', dataUrl),
  openImageViewer: (imageData) => ipcRenderer.invoke('open-image-viewer', imageData),

  // 防御性空实现（防子组件意外调用）
  getHistory: async () => [],
  getSettings: async () => ({}),
  getPrompts: async () => [],
  onHistoryUpdated: () => () => {},
  onScreenshotSuccess: () => () => {}
})
