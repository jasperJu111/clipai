import { validateFinishSnipperPayload } from './imageUtils.js'

/**
 * 执行 finish-snipper 截图保存完整事务
 * 严格区分：
 * 阶段 A: 参数校验
 * 阶段 B: 创建图片文件
 * 阶段 C: 持久化历史记录 (提交点)
 * 阶段 D: 非关键副作用 (广播通知、写剪贴板、关闭截图窗口、唤醒主窗口)
 *
 * @param {any} payload - 截图入参 { dataUrl: '...' }
 * @param {object} deps - 依赖注入对象
 * @returns {Promise<{ success: boolean, item?: object, error?: string }>}
 */
export async function executeFinishSnipperTransaction(payload, deps = {}) {
  const {
    validatePayload = validateFinishSnipperPayload,
    saveDataUrl,
    addToHistory,
    deleteImageFile,
    writeClipboardImage,
    sendScreenshotSuccess,
    closeSnipperWindow,
    showMainWindow,
    openImageViewer,
    logWarning = console.warn
  } = deps

  // 阶段 A: 参数校验
  const validation = validatePayload(payload)
  if (!validation || !validation.success) {
    return { success: false, error: validation?.error || '无效截图数据' }
  }

  const { dataUrl } = validation
  let createdItem = null
  let historyCommitted = false

  try {
    // 阶段 B: 创建图片文件
    if (typeof saveDataUrl !== 'function') {
      throw new Error('缺少 saveDataUrl 实现')
    }
    createdItem = await saveDataUrl(dataUrl, {
      id: Date.now(),
      label: '截图',
      isScreenshot: true,
      favorite: false
    })

    if (!createdItem || !createdItem.id) {
      throw new Error('创建图片文件未返回有效记录')
    }

    // 阶段 C: 持久化历史记录
    if (typeof addToHistory !== 'function') {
      throw new Error('缺少 addToHistory 实现')
    }
    await addToHistory(createdItem)
    historyCommitted = true
  } catch (err) {
    // 只有在历史持久化尚未成功 (historyCommitted === false) 时才允许清理新建文件
    if (!historyCommitted && createdItem && createdItem.filePath && typeof deleteImageFile === 'function') {
      try {
        await deleteImageFile(createdItem.filePath)
      } catch (delErr) {
        logWarning(`清理未提交图片失败: ${delErr.message}`)
      }
    }
    return {
      success: false,
      error: err.message || '保存截图发生异常'
    }
  }

  // 阶段 D: 非关键副作用（历史已提交，任何副作用异常均不得删除图片或返回失败）
  if (typeof sendScreenshotSuccess === 'function') {
    try {
      sendScreenshotSuccess(createdItem)
    } catch (e) {
      logWarning(`发送截图成功事件失败 (非致命): ${e.message}`)
    }
  }

  if (typeof writeClipboardImage === 'function') {
    try {
      await writeClipboardImage(dataUrl, createdItem)
    } catch (clipErr) {
      logWarning(`写入剪贴板失败 (非致命): ${clipErr.message}`)
    }
  }

  if (typeof closeSnipperWindow === 'function') {
    try {
      closeSnipperWindow()
    } catch (winErr) {
      logWarning(`关闭截图窗口失败 (非致命): ${winErr.message}`)
    }
  }

  if (typeof showMainWindow === 'function') {
    try {
      showMainWindow()
    } catch (mainWinErr) {
      logWarning(`唤醒主窗口失败 (非致命): ${mainWinErr.message}`)
    }
  }

  if (typeof openImageViewer === 'function') {
    try {
      openImageViewer(createdItem)
    } catch (viewErr) {
      logWarning(`打开图片编辑器失败 (非致命): ${viewErr.message}`)
    }
  }

  return {
    success: true,
    item: createdItem
  }
}
