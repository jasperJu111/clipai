import { safeStorage } from 'electron'
import { maskApiKey, sanitizeTextForLogs } from '../../src/shared/apiKeyUtils.js'

let storeInstance = null

export function initSecureStorage(store) {
  storeInstance = store
}

/**
 * 加密存储指定提供商的 API Key
 */
export function saveEncryptedApiKey(provider, rawApiKey) {
  if (!provider || !storeInstance) {
    return { success: false, secure: false, error: 'Store not initialized' }
  }

  const key = typeof rawApiKey === 'string' ? rawApiKey.trim() : ''
  const secureKeys = storeInstance.get('secureApiKeys', {}) || {}

  if (!key) {
    delete secureKeys[provider]
    storeInstance.set('secureApiKeys', secureKeys)
    return { success: true, secure: true, cleared: true, masked: '' }
  }

  const isEncAvailable = safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()

  if (!isEncAvailable) {
    console.warn(`⚠️ safeStorage 硬件加密不可用，拒绝假加密存储 (${provider})`)
    return {
      success: false,
      secure: false,
      error: '系统安全加密存储不可用 (safeStorage is unavailable)',
      masked: maskApiKey(key)
    }
  }

  try {
    const encryptedBuffer = safeStorage.encryptString(key)
    secureKeys[provider] = {
      encrypted: true,
      data: encryptedBuffer.toString('hex'),
      masked: maskApiKey(key),
      updatedAt: Date.now()
    }
    storeInstance.set('secureApiKeys', secureKeys)
    return { success: true, secure: true, encrypted: true, masked: maskApiKey(key) }
  } catch (err) {
    console.error('safeStorage 加密异常:', sanitizeTextForLogs(err.message))
    return { success: false, secure: false, error: `加密写入失败: ${err.message}` }
  }
}

/**
 * 解密获取指定提供商的 API Key（仅在主进程发起网络请求时使用，绝不回传渲染进程）
 */
export function getDecryptedApiKey(provider) {
  if (!provider || !storeInstance) return ''
  const secureKeys = storeInstance.get('secureApiKeys', {}) || {}
  const record = secureKeys[provider]
  if (!record || !record.data) return ''

  if (record.encrypted && safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
    try {
      const buffer = Buffer.from(record.data, 'hex')
      return safeStorage.decryptString(buffer)
    } catch (err) {
      console.error('safeStorage 解密异常:', sanitizeTextForLogs(err.message))
      return ''
    }
  }

  return ''
}

/**
 * 判断指定提供商是否已配置有效的 API Key
 */
export function hasApiKey(provider) {
  if (!provider || !storeInstance) return false
  const secureKeys = storeInstance.get('secureApiKeys', {}) || {}
  const record = secureKeys[provider]
  if (record && record.data) return true

  // 兼顾未迁移成功的明文配置
  if (provider === 'gemini' && storeInstance.get('apiKey')) return true
  const providerConfigs = storeInstance.get('providerConfigs', {}) || {}
  return Boolean(providerConfigs[provider] && providerConfigs[provider].apiKey)
}

/**
 * 获取所有提供商的 API Key 脱敏掩码字典（用于 get-settings 安全展示）
 */
export function getMaskedApiKeys() {
  if (!storeInstance) return {}
  const secureKeys = storeInstance.get('secureApiKeys', {}) || {}
  const maskedMap = {}

  for (const [provider, record] of Object.entries(secureKeys)) {
    if (record && record.masked) {
      maskedMap[provider] = record.masked
    }
  }

  // 兼容尚未安全迁移的明文 Key
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
 * 迁移旧版 store 中的明文 API Key（阶段 6）
 * 仅在安全写入成功时删除旧明文 Key；若 safeStorage 不可用或写入失败则保留旧 Key 并报告
 */
export function migrateLegacyApiKeys() {
  if (!storeInstance) return { migratedCount: 0, failedCount: 0 }

  const isEncAvailable = safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()
  if (!isEncAvailable) {
    console.warn('⚠️ 系统安全加密不可用，保留存量明文 API Key，暂不执行清除')
    return { migratedCount: 0, failedCount: 0, encryptionUnavailable: true }
  }

  let migratedCount = 0
  let failedCount = 0

  // 1. 迁移根级 apiKey (旧 Gemini 默认)
  const legacyRootKey = storeInstance.get('apiKey')
  if (typeof legacyRootKey === 'string' && legacyRootKey.trim()) {
    const res = saveEncryptedApiKey('gemini', legacyRootKey.trim())
    if (res.success && res.secure) {
      storeInstance.delete('apiKey')
      migratedCount++
    } else {
      failedCount++
    }
  }

  // 2. 迁移 providerConfigs 下的明文 apiKey
  const providerConfigs = storeInstance.get('providerConfigs', {}) || {}
  let configsModified = false

  for (const [provider, config] of Object.entries(providerConfigs)) {
    if (config && typeof config.apiKey === 'string' && config.apiKey.trim()) {
      const res = saveEncryptedApiKey(provider, config.apiKey.trim())
      if (res.success && res.secure) {
        delete config.apiKey
        configsModified = true
        migratedCount++
      } else {
        failedCount++
      }
    }
  }

  if (configsModified) {
    storeInstance.set('providerConfigs', providerConfigs)
  }

  if (migratedCount > 0) {
    console.log(`🔒 已自动将 ${migratedCount} 个旧明文 API Key 安全迁移至密态存储`)
  }

  return { migratedCount, failedCount }
}
