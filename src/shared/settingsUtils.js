export const SETTINGS_WHITELIST_KEYS = [
  'apiKey',
  'provider',
  'providerConfigs',
  'geminiModel',
  'openaiModel',
  'maxHistory',
  'alwaysOnTop',
  'shortcut',
  'screenshotShortcut',
  'zoomLevel',
  'density',
  'compactMode',
  'theme',
  'windowOpacity',
  'language',
  'cachedModels',
  'providerDetectedModels',
  'customBgImage',
  'customBgBlur',
  'customBgDim'
]

export const DEFAULT_SETTINGS = {
  apiKey: '',
  provider: 'gemini',
  providerConfigs: {},
  geminiModel: 'gemini-2.5-flash',
  openaiModel: 'gpt-4o-mini',
  maxHistory: 200,
  alwaysOnTop: false,
  shortcut: 'Alt+Space',
  screenshotShortcut: 'Alt+A',
  zoomLevel: 100,
  density: 'standard',
  compactMode: false,
  theme: 'linear',
  windowOpacity: 95,
  language: 'auto',
  cachedModels: [],
  providerDetectedModels: {},
  customBgImage: '',
  customBgBlur: 10,
  customBgDim: 50
}

export function filterSafeSettings(storeObj = {}, defaults = DEFAULT_SETTINGS) {
  const filtered = {}
  SETTINGS_WHITELIST_KEYS.forEach((k) => {
    if (storeObj[k] !== undefined) {
      filtered[k] = storeObj[k]
    }
  })
  return { ...defaults, ...filtered }
}
