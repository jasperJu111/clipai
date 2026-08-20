/**
 * 对 API Key 进行安全掩码展示（例如：sk-••••••••abcd）
 */
export function maskApiKey(rawKey) {
  if (typeof rawKey !== 'string' || !rawKey.trim()) {
    return ''
  }
  const trimmed = rawKey.trim()
  if (trimmed.length <= 8) {
    return '••••••••'
  }
  const prefix = trimmed.slice(0, Math.min(4, Math.floor(trimmed.length / 4)))
  const suffix = trimmed.slice(-Math.min(4, Math.floor(trimmed.length / 4)))
  return `${prefix}••••••••${suffix}`
}

/**
 * 判断某个 API Key 是否属于掩码（脱敏显示文本），防止把掩码当作真实密钥发送
 */
export function isMaskedApiKey(key) {
  if (typeof key !== 'string' || !key.trim()) return false
  return key.includes('••••') || key.includes('****')
}

/**
 * 校验字符串是否包含可能的明文 API Key，并进行安全脱敏（用于日志和异常报告）
 */
export function sanitizeTextForLogs(text) {
  if (typeof text !== 'string') return text
  // 脱敏常见 API Key 格式：sk-..., key=AIza..., Bearer ..., Authorization header
  return text
    .replace(/(key=)([a-zA-Z0-9_-]{10,})/gi, '$1[REDACTED_API_KEY]')
    .replace(/(Bearer\s+)([a-zA-Z0-9_.-]{10,})/gi, '$1[REDACTED_API_KEY]')
    .replace(/(sk-[a-zA-Z0-9_-]{10,})/gi, '[REDACTED_API_KEY]')
    .replace(/(AIza[0-9A-Za-z-_]{20,})/gi, '[REDACTED_API_KEY]')
}
