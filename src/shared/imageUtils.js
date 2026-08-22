import { extname } from 'path'

export const MAX_IMAGE_FILE_SIZE = 25 * 1024 * 1024 // 单张最大 25MB
export const MAX_IMAGE_HISTORY_DISK_BYTES = 500 * 1024 * 1024 // 磁盘总占用上限 500MB
export const MAX_THUMBNAIL_DIMENSION = 240 // 缩略图长边限制 240px
export const MAX_IMAGE_DIMENSION = 8192 // 单边最大 8192px 防内存爆炸

export const MIME_TO_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp'
}

export const EXT_TO_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
}

/**
 * 校验文件名是否为安全的受控图片文件名（防路径穿越与非法字符）
 */
export function isSafeImageFilename(filename) {
  if (typeof filename !== 'string' || !filename.trim()) return false
  const trimmed = filename.trim()
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return false
  }
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(trimmed)) {
    return false
  }
  const ext = extname(trimmed).toLowerCase()
  return Object.keys(EXT_TO_MIME).includes(ext)
}

/**
 * 解析 Data URL 头部信息
 */
export function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return null
  }
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/)
  if (!match) return null

  const mimeType = match[1].toLowerCase()
  const base64Data = match[2]
  const ext = MIME_TO_EXT[mimeType] || '.png'

  return {
    mimeType,
    base64Data,
    ext
  }
}

/**
 * 校验 finish-snipper 传入的 payload
 * 只接受非数组普通对象 { dataUrl: 'data:image/...' }
 */
export function validateFinishSnipperPayload(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    Object.prototype.toString.call(payload) !== '[object Object]'
  ) {
    return { success: false, error: '无效截图数据: 参数必须为普通对象 { dataUrl } 或 { buffer }' }
  }

  // 1. 优先支持高性能二进制 Buffer / Uint8Array / ArrayBuffer (零 Base64 开销)
  if (payload.buffer) {
    const isBuffer = typeof Buffer !== 'undefined' && Buffer.isBuffer(payload.buffer)
    const isUint8 = payload.buffer instanceof Uint8Array
    const isArrayBuffer = payload.buffer instanceof ArrayBuffer
    if (!isBuffer && !isUint8 && !isArrayBuffer) {
      return { success: false, error: '无效截图数据: buffer 必须为 Buffer、Uint8Array 或 ArrayBuffer' }
    }
    const byteLength = payload.buffer.byteLength || payload.buffer.length || 0
    if (byteLength === 0) {
      return { success: false, error: '无效截图数据: buffer 不能为空' }
    }
    if (byteLength > MAX_IMAGE_FILE_SIZE) {
      return { success: false, error: `截图数据过大 (${Math.round(byteLength / 1024 / 1024)}MB > 25MB)` }
    }
    return {
      success: true,
      buffer: payload.buffer,
      dataUrl: null,
      estimatedBytes: byteLength,
      openEditor: Boolean(payload.openEditor),
      showMain: Boolean(payload.showMain),
      transactionId: payload.transactionId
    }
  }

  const { dataUrl } = payload
  if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
    return { success: false, error: '无效截图数据: dataUrl 或 buffer 必须提供其一' }
  }

  const parsed = parseDataUrl(dataUrl)
  if (!parsed || !parsed.base64Data) {
    return { success: false, error: '无效截图数据: 必须为合法的图片 Data URL' }
  }

  // 校验 base64 字符
  if (!/^[A-Za-z0-9+/=_\-\r\n\s]+$/.test(parsed.base64Data)) {
    return { success: false, error: '无效截图数据: Base64 编码损坏' }
  }

  const cleanBase64 = parsed.base64Data.replace(/[\s\r\n]/g, '')
  const estimatedBytes = Math.floor((cleanBase64.length * 3) / 4)
  if (estimatedBytes > MAX_IMAGE_FILE_SIZE) {
    return { success: false, error: `截图数据过大 (${Math.round(estimatedBytes / 1024 / 1024)}MB > 25MB)` }
  }

  return {
    success: true,
    dataUrl,
    buffer: null,
    parsed,
    estimatedBytes,
    openEditor: Boolean(payload.openEditor),
    showMain: Boolean(payload.showMain),
    transactionId: payload.transactionId
  }
}

/**
 * 计算缩略图保持比例的新尺寸（长边最大限制 maxDimension）
 */
export function calculateThumbnailSize(width, height, maxDimension = MAX_THUMBNAIL_DIMENSION) {
  const w = Math.max(1, Number(width) || 1)
  const h = Math.max(1, Number(height) || 1)

  if (w <= maxDimension && h <= maxDimension) {
    return { width: Math.round(w), height: Math.round(h) }
  }

  if (w >= h) {
    const ratio = maxDimension / w
    return {
      width: maxDimension,
      height: Math.max(1, Math.round(h * ratio))
    }
  } else {
    const ratio = maxDimension / h
    return {
      width: Math.max(1, Math.round(w * ratio)),
      height: maxDimension
    }
  }
}

/**
 * 规范化 clipai-image:// 协议 URL 路径
 */
export function normalizeProtocolPath(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr.startsWith('clipai-image:')) return null
  let pathPart = urlStr.replace(/^clipai-image:\/\//i, '').replace(/^clipai-image:/i, '')
  pathPart = pathPart.split('?')[0].split('#')[0]
  pathPart = pathPart.replace(/^\/+/, '').replace(/\/+$/, '')
  if (pathPart.includes('/')) {
    const parts = pathPart.split('/')
    pathPart = parts[parts.length - 1]
  }
  return isSafeImageFilename(pathPart) ? pathPart : null
}

/**
 * 磁盘配额管理：当总字节数超过上限时，筛选出最旧且未收藏的记录以供清理
 * 永远不自动删除收藏图片；如果收藏图片自身超限，报告状态而不执行删除。
 */
export function planDiskPruning(historyList, maxTotalBytes = MAX_IMAGE_HISTORY_DISK_BYTES) {
  if (!Array.isArray(historyList)) {
    return { prunedIds: [], totalBytes: 0, favoriteBytes: 0, quotaExceededByFavorites: false }
  }

  const imageItems = historyList.filter((item) => item && item.type === 'image' && item.filePath)
  const favoriteImages = imageItems.filter((item) => item.favorite)
  const favoriteBytes = favoriteImages.reduce((sum, item) => sum + (Number(item.byteSize) || 0), 0)
  let totalBytes = imageItems.reduce((sum, item) => sum + (Number(item.byteSize) || 0), 0)

  if (totalBytes <= maxTotalBytes) {
    return { prunedIds: [], totalBytes, favoriteBytes, quotaExceededByFavorites: false }
  }

  const prunedIds = []
  // 从旧到新排序（按时间戳升序）
  const unFavoritedImages = imageItems
    .filter((item) => !item.favorite)
    .sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))

  for (const item of unFavoritedImages) {
    if (totalBytes <= maxTotalBytes) break
    prunedIds.push(item.id)
    totalBytes -= Number(item.byteSize) || 0
  }

  const quotaExceededByFavorites = totalBytes > maxTotalBytes && favoriteBytes >= maxTotalBytes

  return {
    prunedIds,
    totalBytes: Math.max(0, totalBytes),
    favoriteBytes,
    quotaExceededByFavorites
  }
}
