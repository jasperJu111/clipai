import zhCN from './zh-CN.js'
import zhTW from './zh-TW.js'
import enUS from './en-US.js'
import jaJP from './ja-JP.js'
import koKR from './ko-KR.js'
import esES from './es-ES.js'
import deDE from './de-DE.js'
import frFR from './fr-FR.js'

export const LANGUAGES = [
  { id: 'auto', name: '跟随系统 (Auto)', flag: '🌐', short: 'Auto' },
  { id: 'zh-CN', name: '简体中文', flag: '🇨🇳', short: '简中' },
  { id: 'zh-TW', name: '繁體中文', flag: '🇭🇰', short: '繁中' },
  { id: 'en-US', name: 'English', flag: '🇺🇸', short: 'EN' },
  { id: 'ja-JP', name: '日本語', flag: '🇯🇵', short: '日文' },
  { id: 'ko-KR', name: '한국어', flag: '🇰🇷', short: '韩文' },
  { id: 'es-ES', name: 'Español', flag: '🇪🇸', short: '西文' },
  { id: 'de-DE', name: 'Deutsch', flag: '🇩🇪', short: '德文' },
  { id: 'fr-FR', name: 'Français', flag: '🇫🇷', short: '法文' }
]

export const translations = {
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR,
  'es-ES': esES,
  'de-DE': deDE,
  'fr-FR': frFR
}

// 获取匹配的系统语言
export function detectSystemLanguage() {
  const navLang = (navigator.language || navigator.userLanguage || 'zh-CN').toLowerCase()
  if (navLang.startsWith('zh-tw') || navLang.startsWith('zh-hk')) return 'zh-TW'
  if (navLang.startsWith('zh')) return 'zh-CN'
  if (navLang.startsWith('ja')) return 'ja-JP'
  if (navLang.startsWith('ko')) return 'ko-KR'
  if (navLang.startsWith('es')) return 'es-ES'
  if (navLang.startsWith('de')) return 'de-DE'
  if (navLang.startsWith('fr')) return 'fr-FR'
  if (navLang.startsWith('en')) return 'en-US'
  return 'en-US'
}

// 核心翻译函数生成器
export function createTranslator(langCode = 'auto') {
  const activeLang = langCode === 'auto' ? detectSystemLanguage() : langCode
  const dict = translations[activeLang] || translations['en-US'] || translations['zh-CN']
  const fallbackDict = (activeLang === 'zh-CN' || activeLang === 'zh-TW') ? translations['zh-CN'] : translations['en-US']

  return function t(path, params = {}) {
    if (!path || typeof path !== 'string') return null

    const keys = path.split('.')
    let val = keys.reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : null), dict)
    
    if (val === null || val === undefined) {
      val = keys.reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : null), fallbackDict)
    }

    if (val === null || val === undefined) {
      val = keys.reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : null), translations['zh-CN'])
    }

    if (val === null || val === undefined) return null

    if (typeof val === 'string') {
      return val.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`))
    }

    return val
  }
}
