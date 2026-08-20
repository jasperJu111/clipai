/**
 * 计算距离绝对截止时间的剩余秒数
 */
export function calculateRemainingSeconds(endsAt, now = Date.now()) {
  if (!endsAt || typeof endsAt !== 'number') return 0
  const diff = endsAt - now
  if (diff <= 0) return 0
  return Math.ceil(diff / 1000)
}

/**
 * 创建绝对截止时间戳
 */
export function createTimerEndsAt(totalSeconds, now = Date.now()) {
  const secs = Math.max(1, Math.floor(Number(totalSeconds) || 1))
  return now + secs * 1000
}

/**
 * 迁移与修复旧版计时器状态（兼容没有 endsAt 的历史 localStorage）
 */
export function normalizeTimerState(timerState, now = Date.now()) {
  if (!timerState || typeof timerState !== 'object') {
    return {
      isRunning: false,
      remainingSeconds: 0,
      totalSeconds: 1800,
      endsAt: null,
      cycleId: null
    }
  }

  const isRunning = Boolean(timerState.isRunning)
  const totalSeconds = Math.max(1, Math.floor(Number(timerState.totalSeconds) || 1800))
  let endsAt = typeof timerState.endsAt === 'number' ? timerState.endsAt : null
  let cycleId = timerState.cycleId || null

  if (isRunning) {
    if (!endsAt) {
      const rem = typeof timerState.remainingSeconds === 'number' ? timerState.remainingSeconds : totalSeconds
      endsAt = now + Math.max(0, rem) * 1000
    }
    if (!cycleId) {
      cycleId = `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`
    }
  }

  const remainingSeconds = isRunning ? calculateRemainingSeconds(endsAt, now) : (timerState.remainingSeconds || 0)

  return {
    ...timerState,
    isRunning: isRunning && remainingSeconds > 0,
    totalSeconds,
    endsAt: isRunning && remainingSeconds > 0 ? endsAt : null,
    remainingSeconds,
    cycleId
  }
}

/**
 * 稍后提醒（Snooze）：重新生成 endsAt、cycleId 与状态
 */
export function snoozeTimer(timerState, snoozeSeconds = 300, now = Date.now()) {
  const secs = Math.max(1, Math.floor(Number(snoozeSeconds) || 300))
  const endsAt = createTimerEndsAt(secs, now)
  const cycleId = `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`

  if (!timerState) {
    return {
      id: `snooze_${now}`,
      title: '⏰ 延后提醒',
      alertMessage: '5 分钟小休结束啦！继续保持活力～',
      totalSeconds: secs,
      remainingSeconds: secs,
      endsAt,
      cycleId,
      isRunning: true,
      isLoop: false,
      soundEnabled: true,
      systemNotifEnabled: true
    }
  }

  return {
    ...timerState,
    totalSeconds: secs,
    remainingSeconds: secs,
    endsAt,
    cycleId,
    isRunning: true
  }
}

/**
 * 重启循环周期（Restart Loop）：生成新周期 endsAt 与 cycleId
 */
export function restartLoopTimer(timerState, now = Date.now()) {
  if (!timerState) return null
  const total = Math.max(1, Number(timerState.totalSeconds) || 1800)
  const endsAt = createTimerEndsAt(total, now)
  const cycleId = `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`

  return {
    ...timerState,
    totalSeconds: total,
    remainingSeconds: total,
    endsAt,
    cycleId,
    isRunning: true
  }
}

/**
 * 增加当前计时时长（+5m 等）：精准调整 endsAt 与 cycleId
 */
export function addTimeToTimer(timerState, additionalSeconds = 300, now = Date.now()) {
  if (!timerState) return null
  const add = Math.max(1, Math.floor(Number(additionalSeconds) || 300))
  const currentRem = timerState.isRunning && timerState.endsAt
    ? calculateRemainingSeconds(timerState.endsAt, now)
    : (timerState.remainingSeconds || 0)
  const nextRem = currentRem + add
  const nextTotal = (timerState.totalSeconds || 0) + add
  const endsAt = createTimerEndsAt(nextRem, now)
  const cycleId = `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`

  return {
    ...timerState,
    totalSeconds: nextTotal,
    remainingSeconds: nextRem,
    endsAt: timerState.isRunning ? endsAt : null,
    cycleId: timerState.isRunning ? cycleId : timerState.cycleId,
    isRunning: Boolean(timerState.isRunning)
  }
}

/**
 * 检测并处理计时周期心跳：
 * - 只有当 isRunning 为 true、已到达或超过 endsAt，且该 cycleId 尚未触发提醒时才触发
 * - 返回 { triggered: boolean, nextState, alertPayload }
 */
export function processTimerTick(timerState, triggeredCycleIds = new Set(), now = Date.now()) {
  if (!timerState || !timerState.isRunning || !timerState.endsAt) {
    return {
      triggered: false,
      nextState: { ...(timerState || {}), isRunning: false, remainingSeconds: 0 }
    }
  }

  const remaining = calculateRemainingSeconds(timerState.endsAt, now)

  // 还在倒计时中
  if (remaining > 0) {
    return {
      triggered: false,
      nextState: {
        ...timerState,
        remainingSeconds: remaining
      }
    }
  }

  // 倒计时已到期
  const cycleId = timerState.cycleId || `cycle_${timerState.endsAt}`
  const alreadyTriggered = triggeredCycleIds.has(cycleId)

  // 循环计时器：重置到下一个周期，生成新的 endsAt 和 cycleId
  if (timerState.isLoop) {
    const nextEndsAt = createTimerEndsAt(timerState.totalSeconds, now)
    const nextCycleId = `cycle_${now}_${Math.random().toString(36).slice(2, 7)}`
    return {
      triggered: !alreadyTriggered,
      cycleIdToRecord: cycleId,
      nextState: {
        ...timerState,
        isRunning: true,
        endsAt: nextEndsAt,
        cycleId: nextCycleId,
        remainingSeconds: timerState.totalSeconds
      }
    }
  }

  // 单次计时器到期结束
  return {
    triggered: !alreadyTriggered,
    cycleIdToRecord: cycleId,
    nextState: {
      ...timerState,
      isRunning: false,
      endsAt: null,
      remainingSeconds: 0
    }
  }
}
