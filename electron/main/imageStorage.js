import { app, protocol, nativeImage, net } from 'electron'
import { join, basename, resolve } from 'path'
import { pathToFileURL } from 'url'
import fs from 'fs/promises'
import fsSync from 'fs'
import crypto from 'crypto'
import {
  isSafeImageFilename,
  parseDataUrl,
  calculateThumbnailSize,
  normalizeProtocolPath,
  EXT_TO_MIME,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGE_DIMENSION,
  planDiskPruning
} from '../../src/shared/imageUtils.js'
import { maskApiKey } from '../../src/shared/apiKeyUtils.js'

let imagesDir = null

export function getImagesDir() {
  if (!imagesDir) {
    const userData = app.getPath('userData')
    imagesDir = join(userData, 'clipboard-images')
    if (!fsSync.existsSync(imagesDir)) {
      fsSync.mkdirSync(imagesDir, { recursive: true })
    }
  }
  return imagesDir
}

/**
 * 安全备份 config.json（脱敏 API Key 并自动清理旧备份，最多保留 3 份）
 */
export async function backupUserData() {
  try {
    const userData = app.getPath('userData')
    const configFile = join(userData, 'config.json')
    if (fsSync.existsSync(configFile)) {
      // 1. 清理多余旧备份文件，保留最多 3 份
      const allFiles = await fs.readdir(userData)
      const backupFiles = allFiles
        .filter((f) => f.startsWith('config.backup.') && f.endsWith('.json'))
        .sort()
      
      if (backupFiles.length >= 3) {
        for (let i = 0; i <= backupFiles.length - 3; i++) {
          try {
            await fs.unlink(join(userData, backupFiles[i]))
          } catch (_) {}
        }
      }

      // 2. 脱敏配置内容并写入新备份
      const rawContent = await fs.readFile(configFile, 'utf-8')
      let sanitizedContent = rawContent
      try {
        const parsed = JSON.parse(rawContent)
        if (parsed.apiKey) parsed.apiKey = maskApiKey(parsed.apiKey)
        if (parsed.providerConfigs && typeof parsed.providerConfigs === 'object') {
          for (const cfg of Object.values(parsed.providerConfigs)) {
            if (cfg && cfg.apiKey) cfg.apiKey = maskApiKey(cfg.apiKey)
          }
        }
        sanitizedContent = JSON.stringify(parsed, null, 2)
      } catch (_) {}

      const backupFile = join(userData, `config.backup.${Date.now()}.json`)
      await fs.writeFile(backupFile, sanitizedContent, 'utf-8')
      console.log('✅ 用户数据已自动安全脱敏备份至:', backupFile)
      return { success: true, backupFile }
    }
  } catch (err) {
    console.warn('⚠️ 自动备份用户数据异常:', err.message)
  }
  return { success: false }
}

/**
 * 注册 clipai-image:// 受控自定义协议
 * 只能读取 clipboard-images 目录内已登记的受控文件，严格防止路径穿越
 */
export function registerImageProtocol() {
  protocol.handle('clipai-image', async (request) => {
    try {
      const safeFilename = normalizeProtocolPath(request.url)
      if (!safeFilename) {
        return new Response('Forbidden or Invalid Image Path', { status: 403 })
      }

      const dir = getImagesDir()
      const targetPath = resolve(dir, safeFilename)

      // 严格防御路径穿越：解析出的绝对路径必须位于 imagesDir 内部
      if (!targetPath.startsWith(dir) || !fsSync.existsSync(targetPath)) {
        return new Response('Not Found', { status: 404 })
      }

      return net.fetch(pathToFileURL(targetPath).toString())
    } catch (err) {
      console.error('clipai-image protocol error:', err)
      return new Response('Internal Server Error', { status: 500 })
    }
  })
}

/**
 * 原子化写入图片文件
 */
async function atomicWriteFile(targetPath, buffer) {
  const tmpPath = `${targetPath}.${crypto.randomUUID()}.tmp`
  await fs.writeFile(tmpPath, buffer)
  await fs.rename(tmpPath, targetPath)
}

/**
 * 将 nativeImage 保存为结构化磁盘文件，并生成缩略图与元数据
 */
export async function saveImageToStorage(img, options = {}) {
  if (!img || img.isEmpty()) {
    throw new Error('Image is empty or invalid')
  }

  const { width, height } = img.getSize()
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`图片尺寸过大 (${width}x${height} > ${MAX_IMAGE_DIMENSION}px)，已拦截防内存爆炸`)
  }

  const dir = getImagesDir()
  const pngBuffer = img.toPNG()
  const byteSize = pngBuffer.length

  if (byteSize > MAX_IMAGE_FILE_SIZE) {
    throw new Error(`图片文件超出大小限制 (${Math.round(byteSize / 1024 / 1024)}MB > 25MB)`)
  }

  const fileId = `img_${crypto.randomUUID()}`
  const filename = `${fileId}.png`
  const targetPath = join(dir, filename)

  // 原子化写入磁盘
  await atomicWriteFile(targetPath, pngBuffer)

  // 生成长边不超过 240px 的压缩缩略图
  const thumbSize = calculateThumbnailSize(width, height, 240)
  const thumbImg = img.resize(thumbSize)
  const thumbnail = thumbImg.toJPEG(75)
  const thumbDataUrl = `data:image/jpeg;base64,${thumbnail.toString('base64')}`

  return {
    id: options.id || Date.now(),
    type: 'image',
    filePath: filename,
    thumbnail: thumbDataUrl,
    mimeType: 'image/png',
    width,
    height,
    byteSize,
    timestamp: options.timestamp || new Date().toISOString(),
    favorite: Boolean(options.favorite),
    isScreenshot: Boolean(options.isScreenshot),
    label: options.label || (options.isScreenshot ? '截图' : '图片')
  }
}

/**
 * 将 Data URL 保存为结构化磁盘文件
 */
export async function saveDataUrlToStorage(dataUrl, options = {}) {
  const parsed = parseDataUrl(dataUrl)
  if (!parsed) {
    throw new Error('Invalid data:image URL')
  }

  const buffer = Buffer.from(parsed.base64Data, 'base64')
  if (buffer.length > MAX_IMAGE_FILE_SIZE) {
    throw new Error(`图片超出大小限制 (${Math.round(buffer.length / 1024 / 1024)}MB > 25MB)`)
  }

  const img = nativeImage.createFromBuffer(buffer)
  if (img.isEmpty()) {
    throw new Error('Decoded image buffer is invalid or corrupt')
  }

  const { width, height } = img.getSize()
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new Error(`图片尺寸过大 (${width}x${height} > ${MAX_IMAGE_DIMENSION}px)，已拦截防内存爆炸`)
  }

  const dir = getImagesDir()
  const fileId = `img_${crypto.randomUUID()}`
  const filename = `${fileId}${parsed.ext}`
  const targetPath = join(dir, filename)

  await atomicWriteFile(targetPath, buffer)

  const thumbSize = calculateThumbnailSize(width, height, 240)
  const thumbImg = img.resize(thumbSize)
  const thumbDataUrl = `data:image/jpeg;base64,${thumbImg.toJPEG(75).toString('base64')}`

  return {
    id: options.id || Date.now(),
    type: 'image',
    filePath: filename,
    thumbnail: thumbDataUrl,
    mimeType: parsed.mimeType,
    width,
    height,
    byteSize: buffer.length,
    timestamp: options.timestamp || new Date().toISOString(),
    favorite: Boolean(options.favorite),
    isScreenshot: Boolean(options.isScreenshot),
    label: options.label || (options.isScreenshot ? '截图' : '图片')
  }
}

/**
 * 读取已存储图片为 nativeImage
 */
export async function loadImageFromStorage(filePathOrFilename) {
  if (!filePathOrFilename) return null
  const filename = basename(filePathOrFilename)
  if (!isSafeImageFilename(filename)) return null

  const dir = getImagesDir()
  const fullPath = join(dir, filename)
  if (!fsSync.existsSync(fullPath)) return null

  const buffer = await fs.readFile(fullPath)
  return nativeImage.createFromBuffer(buffer)
}

/**
 * 读取已存储图片为完整的 Base64 Data URL (供 AI 或外部查看器使用)
 */
export async function loadImageAsDataUrl(filePathOrFilename) {
  if (!filePathOrFilename) return null
  const filename = basename(filePathOrFilename)
  if (!isSafeImageFilename(filename)) return null

  const dir = getImagesDir()
  const fullPath = join(dir, filename)
  if (!fsSync.existsSync(fullPath)) return null

  const ext = `.${filename.split('.').pop().toLowerCase()}`
  const mime = EXT_TO_MIME[ext] || 'image/png'
  const buffer = await fs.readFile(fullPath)
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * 安全删除指定图片文件
 */
export async function deleteImageFile(filePathOrFilename) {
  try {
    if (!filePathOrFilename) return
    const filename = basename(filePathOrFilename)
    if (!isSafeImageFilename(filename)) return

    const dir = getImagesDir()
    const fullPath = join(dir, filename)
    if (fsSync.existsSync(fullPath)) {
      await fs.unlink(fullPath)
      console.log(`🗑️ 已删除图片文件: ${filename}`)
    }
  } catch (err) {
    console.warn(`删除图片文件异常 (${filePathOrFilename}):`, err.message)
  }
}

/**
 * 清理孤立的临时文件和无主图片
 */
export async function cleanupOrphanFiles(referencedFiles = []) {
  try {
    const dir = getImagesDir()
    const files = await fs.readdir(dir)
    const referencedSet = new Set(referencedFiles.map((f) => basename(f)))

    const now = Date.now()
    for (const file of files) {
      const fullPath = join(dir, file)
      const stat = await fs.stat(fullPath)

      // 1. 自动清理超过 5 分钟未重命名的 .tmp 临时文件
      if (file.endsWith('.tmp')) {
        if (now - stat.mtimeMs > 5 * 60 * 1000) {
          try { await fs.unlink(fullPath) } catch (_) {}
        }
        continue
      }

      // 2. 清理历史记录中无引用的孤立图片（只清理创建时间超过 10 分钟的文件，避免并发写入误删）
      if (isSafeImageFilename(file) && !referencedSet.has(file)) {
        if (now - stat.mtimeMs > 10 * 60 * 1000) {
          try { await fs.unlink(fullPath) } catch (_) {}
        }
      }
    }
  } catch (err) {
    console.warn('清理孤立图片文件异常:', err.message)
  }
}

/**
 * 迁移旧 Base64 图片为结构化磁盘文件（阶段 2）
 */
export async function migrateLegacyBase64History(historyList) {
  if (!Array.isArray(historyList)) return []

  let modified = false
  const updatedList = []

  for (const item of historyList) {
    if (!item) continue

    // 识别旧 Base64 图片：type === 'image' 且包含以 data:image/ 开头的 content
    if (item.type === 'image' && typeof item.content === 'string' && item.content.startsWith('data:image/')) {
      try {
        const migrated = await saveDataUrlToStorage(item.content, {
          id: item.id,
          timestamp: item.timestamp,
          favorite: item.favorite,
          isScreenshot: item.isScreenshot,
          label: item.label
        })
        updatedList.push(migrated)
        modified = true
      } catch (err) {
        console.warn(`迁移旧图片 (id: ${item.id}) 失败，保留原数据:`, err.message)
        updatedList.push(item)
      }
    } else {
      updatedList.push(item)
    }
  }

  return {
    migratedHistory: updatedList,
    modified
  }
}
