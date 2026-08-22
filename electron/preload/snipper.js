const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('clipai', {
  getSnipperData: () => ipcRenderer.invoke('get-snipper-data'),
  onSnipperRefresh: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('snipper-refresh', handler)
    return () => ipcRenderer.removeListener('snipper-refresh', handler)
  },
  onSnipperRefreshBuffer: (callback) => {
    const handler = (_, data) => callback(data)
    ipcRenderer.on('snipper-refresh-buffer', handler)
    return () => ipcRenderer.removeListener('snipper-refresh-buffer', handler)
  },
  sendSnipperReady: (data) => {
    ipcRenderer.send('snipper-ready', data)
  },
  finishSnipper: (payload) => ipcRenderer.invoke('finish-snipper', payload),
  closeSnipper: () => ipcRenderer.invoke('close-snipper', {}),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (callback) => {
    const handler = (_, settings) => callback(settings)
    ipcRenderer.on('settings-changed', handler)
    return () => ipcRenderer.removeListener('settings-changed', handler)
  }
})
