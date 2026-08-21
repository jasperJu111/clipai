import { maskApiKey, sanitizeTextForLogs } from '../../src/shared/apiKeyUtils.js'

let storeInstance = null

export function initSecureStorage(store) {
  storeInstance = store
}

/**
 * 存储指定提供商的 API Key（保存在用户私有配置目录中，绝不调用系统钥匙串，避免密码弹窗）
 */
export function saveEncryptedApiKey(provider, rawApiKey) {
  if (!provider || !storeInstance) {
    return { success: false, secure: false, error: 'Store not initialized' }
  }

  const key = typeof rawApiKey === 'string' ? rawApiKey.trim() : ''
  const apiKeys = storeInstance.get('apiKeys', {}) || {}

  if (!key) {
    delete apiKeys[provider]
    storeInstance.set('apiKeys', apiKeys)
    return { success: true, secure: true, cleared: true, masked: '' }
  }

  apiKeys[provider] = key
  storeInstance.set('apiKeys', apiKeys)
  return { success: true, secure: true, masked: maskApiKey(key) }
}

/**
 * 获取指定提供商的 API Key（仅在主进程发起网络请求时使用，绝不回传渲染进程）
 */
export function getDecryptedApiKey(provider) {
  if (!provider || !storeInstance) return ''
  const apiKeys = storeInstance.get('apiKeys', {}) || {}
  if (apiKeys[provider]) return apiKeys[provider]

  const legacyRoot = storeInstance.get('apiKey')
  if (provider === 'gemini' && legacyRoot) return legacyRoot

  const providerConfigs = storeInstance.get('providerConfigs', {}) || {}
  if (providerConfigs[provider] && providerConfigs[provider].apiKey) {
    return providerConfigs[provider].apiKey
  }

  return ''
}

/**
 * 判断指定提供商是否已配置有效的 API Key
 */
export function hasApiKey(provider) {
  if (!provider || !storeInstance) return false
  const apiKeys = storeInstance.get('apiKeys', {}) || {}
  if (apiKeys[provider]) return true

  if (provider === 'gemini' && storeInstance.get('apiKey')) return true
  const providerConfigs = storeInstance.get('providerConfigs', {}) || {}
  return Boolean(providerConfigs[provider] && providerConfigs[provider].apiKey)
}

/**
 * 获取所有提供商的 API Key 脱敏掩码字典（用于 get-settings 安全展示）
 */
export function getMaskedApiKeys() {
  if (!storeInstance) return {}
  const apiKeys = storeInstance.get('apiKeys', {}) || {}
  const maskedMap = {}

  for (const [provider, key] of Object.entries(apiKeys)) {
    if (key) {
      maskedMap[provider] = maskApiKey(key)
    }
  }

  const legacyRoot = storeInstance.get('apiKey')
  if (legacyRoot && !maskedMap.gemini) {
    maskedMap.gemini = maskApiKey(legacyRoot)
  }

  const providerConfigs = storeInstance.get('providerConfigs', {}) || {}
  for (const [p, cfg] of Object.entries(providerConfigs)) {
    if (cfg && cfg.apiKey && !maskedMap[p]) {
      maskedMap[p] = maskApiKey(cfg.apiKey)
    }
  }

  return maskedMap
}

/**
 * 迁移旧版 store 中的 API Key
 */
export function migrateLegacyApiKeys() {
  if (!storeInstance) return { migratedCount: 0, failedCount: 0 }
  let migratedCount = 0

  const apiKeys = storeInstance.get('apiKeys', {}) || {}

  // 1. 迁移根级 apiKey
  const legacyRootKey = storeInstance.get('apiKey')
  if (typeof legacyRootKey === 'string' && legacyRootKey.trim()) {
    if (!apiKeys.gemini) {
      apiKeys.gemini = legacyRootKey.trim()
      migratedCount++
    }
  }

  // 2. 迁移 providerConfigs
  const providerConfigs = storeInstance.get('providerConfigs', {}) || {}
  for (const [provider, config] of Object.entries(providerConfigs)) {
    if (config && typeof config.apiKey === 'string' && config.apiKey.trim()) {
      if (!apiKeys[provider]) {
        apiKeys[provider] = config.apiKey.trim()
        migratedCount++
      }
    }
  }

  storeInstance.set('apiKeys', apiKeys)
  return { migratedCount, failedCount: 0 }
}
