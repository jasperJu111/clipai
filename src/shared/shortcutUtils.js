export function parseShortcutFromEvent(e) {
  if (!e || typeof e !== 'object') return null

  // 单独按修饰键时暂不提交
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return null
  }

  const mods = []
  if (e.metaKey) mods.push('Command')
  if (e.ctrlKey) mods.push('Ctrl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')

  let rawKey = (e.key || '').toUpperCase()
  if (e.code === 'Space' || e.key === ' ') rawKey = 'Space'
  if (e.code && e.code.startsWith('Key')) rawKey = e.code.replace('Key', '')
  if (e.code && e.code.startsWith('Digit')) rawKey = e.code.replace('Digit', '')

  if (mods.length === 0 && !rawKey.startsWith('F')) {
    mods.push('Alt')
  }

  return [...mods, rawKey].join('+')
}

export function isValidShortcutString(shortcut) {
  if (typeof shortcut !== 'string') return false
  const trimmed = shortcut.trim()
  if (!trimmed || trimmed.endsWith('+')) return false
  return true
}

/**
 * 解析存储/外部传入的快捷键值：
 * - 只有当 value 为 null 或 undefined 时才回退至 fallback 默认值；
 * - 若 value 为字符串（包括空字符串 "" 表示用户主动禁用），则完整保留并返回该值；
 * - 若 value 为非法类型（数字/对象等），安全回退至 fallback。
 */
export function resolveStoredShortcut(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }
  if (typeof value === 'string') {
    return value
  }
  return fallback
}

/**
 * 快捷键注册事务：
 * 1. 支持传入空字符串 "" 表示用户主动禁用该快捷键（不调用 register，不报错）
 * 2. 只有非空且有效的快捷键才调用 registerFn 注册
 * 3. 若有任何一个非空快捷键注册失败，则全部回滚到 previousShortcuts
 * 4. 注册失败绝不持久化；注册成功正常持久化包含空字符串的新配置
 */
export function executeShortcutTransaction({
  targetShortcuts = {},
  previousShortcuts = {},
  registerFn,
  unregisterAllFn
}) {
  if (typeof unregisterAllFn === 'function') {
    unregisterAllFn()
  }

  const attemptResults = {
    registered: [],
    failed: []
  }

  const normalizedTargets = {}
  const keysToRegister = Object.entries(targetShortcuts)

  for (const [type, rawKey] of keysToRegister) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : ''
    normalizedTargets[type] = key

    // 用户主动禁用：留空不注册，直接视为有效操作
    if (key === '') {
      continue
    }

    if (!isValidShortcutString(key)) {
      attemptResults.failed.push({ type, key, reason: '快捷键格式无效' })
      continue
    }

    try {
      const ok = typeof registerFn === 'function' ? registerFn(type, key) : false
      if (ok) {
        attemptResults.registered.push({ type, key })
      } else {
        attemptResults.failed.push({ type, key, reason: '已被系统或其他程序占用' })
      }
    } catch (err) {
      attemptResults.failed.push({ type, key, reason: err.message || '注册异常' })
    }
  }

  // 若存在注册失败，启动事务回滚到 previousShortcuts
  if (attemptResults.failed.length > 0) {
    if (typeof unregisterAllFn === 'function') {
      unregisterAllFn()
    }

    const rolledBackShortcuts = {}
    for (const [type, rawPrev] of Object.entries(previousShortcuts)) {
      const prevKey = typeof rawPrev === 'string' ? rawPrev.trim() : ''
      rolledBackShortcuts[type] = prevKey
      if (prevKey !== '' && isValidShortcutString(prevKey)) {
        try {
          if (typeof registerFn === 'function') {
            registerFn(type, prevKey)
          }
        } catch (_) {}
      }
    }

    return {
      success: false,
      failed: attemptResults.failed,
      activeShortcuts: rolledBackShortcuts
    }
  }

  // 全部成功
  return {
    success: true,
    failed: [],
    activeShortcuts: normalizedTargets
  }
}
