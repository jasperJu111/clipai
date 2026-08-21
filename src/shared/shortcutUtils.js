/**
 * 获取跨平台默认快捷键
 * - macOS (darwin): 唤醒 'Alt+Space', 截图 'Alt+A'
 * - Windows (win32): 唤醒 'Ctrl+Shift+Space' (避免与系统 Alt+Space 冲突), 截图 'Ctrl+Shift+A'
 * - 其他 (Linux等): 唤醒 'Ctrl+Shift+Space', 截图 'Ctrl+Shift+A'
 */
export function getDefaultShortcuts(platform = 'darwin') {
  const isWin = platform === 'win32'
  if (isWin) {
    return {
      shortcut: 'Ctrl+Shift+Space',
      screenshotShortcut: 'Alt+A'
    }
  }
  return {
    shortcut: 'Alt+Space',
    screenshotShortcut: 'Alt+A'
  }
}

export function parseShortcutFromEvent(e, platform = 'darwin') {
  if (!e || typeof e !== 'object') return null

  // 单独按修饰键时暂不提交
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
    return null
  }

  const isMac = platform === 'darwin'
  const mods = []
  if (e.metaKey) mods.push(isMac ? 'Command' : 'Super')
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

/**
 * 跨平台友好展示快捷键字符
 * - macOS (darwin): 显示 ⌘ Cmd, ⌥ Option, ⌃ Ctrl, ⇧ Shift
 * - Windows (win32) / Linux: 显示 Ctrl, Alt, Shift, Win (严禁出现 ⌘ 或 🍏 Option)
 */
export function formatShortcutForDisplay(shortcut, platform = 'darwin') {
  if (!shortcut || typeof shortcut !== 'string') return ''
  const isMac = platform === 'darwin'
  if (isMac) {
    return shortcut
      .replace(/CommandOrControl/g, '⌘ Cmd')
      .replace(/Command/g, '⌘ Cmd')
      .replace(/Alt/g, '⌥ Option')
      .replace(/Ctrl/g, '⌃ Ctrl')
      .replace(/Shift/g, '⇧ Shift')
      .replace(/Super/g, '⌘ Cmd')
      .replace(/\+/g, ' + ')
  }
  return shortcut
    .replace(/CommandOrControl/g, 'Ctrl')
    .replace(/Command/g, 'Win')
    .replace(/Super/g, 'Win')
    .replace(/Alt/g, 'Alt')
    .replace(/Ctrl/g, 'Ctrl')
    .replace(/Shift/g, 'Shift')
    .replace(/\+/g, ' + ')
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
 * 2. 校验快捷键冲突：多个非空快捷键不能设置成相同组合
 * 3. 只有非空且有效的快捷键才调用 registerFn(type, key) 注册
 * 4. 若有任何一个非空快捷键注册失败，则全部回滚到 previousShortcuts
 * 5. 回滚时必须严格校验旧快捷键是否重新注册成功，绝不汇报虚假 active 状态
 * 6. 注册失败绝不持久化；注册成功正常持久化包含空字符串的新配置
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

  // 1. 预先检查重复快捷键冲突
  const seenCombos = new Map()
  for (const [type, rawKey] of keysToRegister) {
    const key = typeof rawKey === 'string' ? rawKey.trim() : ''
    normalizedTargets[type] = key
    if (key !== '') {
      const lower = key.toLowerCase()
      if (seenCombos.has(lower)) {
        attemptResults.failed.push({
          type,
          key,
          reason: `快捷键与 ${seenCombos.get(lower)} 重复，两个功能不能设置为相同组合`
        })
      } else {
        seenCombos.set(lower, type)
      }
    }
  }

  // 2. 如果存在重复冲突或格式错误，直接跳过注册进入回滚
  if (attemptResults.failed.length === 0) {
    for (const [type, rawKey] of keysToRegister) {
      const key = typeof rawKey === 'string' ? rawKey.trim() : ''

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
  }

  // 3. 若存在注册失败或冲突，启动事务回滚到 previousShortcuts
  if (attemptResults.failed.length > 0) {
    if (typeof unregisterAllFn === 'function') {
      unregisterAllFn()
    }

    const rolledBackShortcuts = {}
    for (const [type, rawPrev] of Object.entries(previousShortcuts)) {
      const prevKey = typeof rawPrev === 'string' ? rawPrev.trim() : ''
      if (prevKey === '') {
        rolledBackShortcuts[type] = ''
        continue
      }
      if (isValidShortcutString(prevKey)) {
        let rolledSuccess = false
        try {
          if (typeof registerFn === 'function') {
            rolledSuccess = registerFn(type, prevKey) === true
          }
        } catch (_) {
          rolledSuccess = false
        }
        if (rolledSuccess) {
          rolledBackShortcuts[type] = prevKey
        }
      }
    }

    return {
      success: false,
      failed: attemptResults.failed,
      activeShortcuts: rolledBackShortcuts
    }
  }

  // 4. 全部成功
  return {
    success: true,
    failed: [],
    activeShortcuts: normalizedTargets
  }
}
