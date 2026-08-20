import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// 在纯浏览器 / IDE 内置预览模式下，自动注入 Mock 数据支持无缝在线预览与交互
if (!window.clipai) {
  let mockHistory = [
    {
      id: 'demo-1',
      type: 'text',
      content: 'const greeting = "Hello ClipAI World!";\nconsole.log(greeting);',
      timestamp: Date.now() - 1000 * 60 * 5,
      favorite: true,
      charCount: 56
    },
    {
      id: 'demo-2',
      type: 'text',
      content: 'https://github.com/your-username/clipai - 智能剪贴板管理工具',
      timestamp: Date.now() - 1000 * 60 * 25,
      favorite: false,
      charCount: 58
    },
    {
      id: 'demo-3',
      type: 'text',
      content: '提示词：请帮我将以下文本润色为优雅专业的科技媒体文风。',
      timestamp: Date.now() - 1000 * 60 * 120,
      favorite: false,
      charCount: 26
    }
  ]

  let mockSettings = {
    apiKey: '',
    provider: 'gemini',
    geminiModel: 'gemini-2.0-flash',
    theme: 'ios',
    windowOpacity: 95,
    density: 'standard',
    zoomLevel: 100
  }

  let listeners = []

  window.clipai = {
    getHistory: async () => mockHistory,
    setHistory: async (h) => { mockHistory = h; listeners.forEach(fn => fn(mockHistory)); return { success: true } },
    onHistoryUpdated: (fn) => { listeners.push(fn); return () => { listeners = listeners.filter(l => l !== fn) } },
    getSettings: async () => mockSettings,
    setSettings: async (s) => { mockSettings = { ...mockSettings, ...s }; return { success: true } },
    getPrompts: async () => [
      { id: '1', title: '🔤 翻译为英文', content: '请将以下内容精准翻译为地道流利的英文：' },
      { id: '2', title: '✨ 文本润色', content: '请对以下文本进行专业润色，增强表达逻辑与感染力：' },
      { id: '3', title: '📝 提炼核心摘要', content: '请简明扼要提炼以下内容的核心要点（3条内）：' }
    ],
    savePrompts: async () => ({ success: true }),
    setZoomFactor: () => {},
    getZoomFactor: () => 1.0,
    setCompactMode: async () => ({ success: true }),
    setWindowOpacity: async () => ({ success: true }),
    hideWindow: async () => {},
    minimizeWindow: async () => {},
    openExternal: (url) => window.open(url, '_blank'),
    takeScreenshot: async () => ({ success: false, error: '截图需在桌面端运行' }),
    listGeminiModels: async () => ({ success: true, models: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }] }),
    selectImageDialog: async () => ({ success: false, error: '请在桌面端选择本地图片' })
  }
}


import ImageViewer from './components/ImageViewer'
import ScreenSnipper from './components/ScreenSnipper'

const isViewer = window.location.hash === '#viewer' || window.location.hash.includes('viewer')
const isSnipper = window.location.hash === '#snipper' || window.location.hash.includes('snipper')

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isViewer ? <ImageViewer /> : isSnipper ? <ScreenSnipper /> : <App />}
  </React.StrictMode>
)




