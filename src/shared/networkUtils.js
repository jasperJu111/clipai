import { fileURLToPath } from 'url'
import { resolve, relative, isAbsolute, sep } from 'path'

export async function fetchWithTimeout(url, options = {}, timeoutMs = 60000, fetchImpl = fetch) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetchImpl(url, {
      ...options,
      signal: controller.signal
    })
    return res
  } catch (err) {
    if (err.name === 'AbortError' || err.code === 20 || controller.signal.aborted) {
      throw new Error(`请求超时 (已等待 ${Math.round(timeoutMs / 1000)} 秒未响应，请检查网络或模型服务状态)`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function parseResponseSafe(res, providerName = 'AI') {
  if (!res) throw new Error(`${providerName} 返回空响应`)

  const contentType = (res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-type') : '') || ''
  const isJson = contentType.includes('application/json')

  if (!res.ok) {
    let errorDetail = ''
    try {
      if (isJson) {
        const errJson = await res.json()
        errorDetail = errJson.error?.message || errJson.error || errJson.message || JSON.stringify(errJson)
      } else {
        const text = await res.text()
        errorDetail = text.slice(0, 300)
      }
    } catch {
      errorDetail = `HTTP 状态码: ${res.status}`
    }
    throw new Error(`${providerName} 接口返回错误 (${res.status}): ${errorDetail || res.statusText || ''}`)
  }

  if (isJson) {
    return await res.json()
  }
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${providerName} 返回非标准数据 (${res.status}): ${text.slice(0, 150)}`)
  }
}

// ─── 生产级 URL 与导航安全策略 ─────────────────────────────────
export const ALLOWED_AIMAKEX_HOSTS = new Set(['chat.aimakex.com', 'aimakex.com', 'api.aimakex.com'])

export function isAllowedAimakeXUrl(rawUrl) {
  try {
    if (typeof rawUrl !== 'string') return false
    const parsed = new URL(rawUrl)
    // 严格限制仅允许 HTTPS 协议
    if (parsed.protocol !== 'https:') return false
    return ALLOWED_AIMAKEX_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

export function isSafeExternalUrl(rawUrl) {
  try {
    if (typeof rawUrl !== 'string') return false
    const parsed = new URL(rawUrl)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 校验开发环境 URL 是否精确匹配 devServerOrigin (例如 http://localhost:5173)
 */
export function isExactDevOriginUrl(rawUrl, devServerUrl) {
  try {
    if (!rawUrl || !devServerUrl) return false
    const parsedTarget = new URL(rawUrl)
    const parsedDev = new URL(devServerUrl)
    return parsedTarget.origin === parsedDev.origin
  } catch {
    return false
  }
}

/**
 * 校验 file:// URL 是否严格指向应用内置 renderer 目录中的受控文件
 * 使用 Node 标准库 resolve / relative / isAbsolute / fileURLToPath
 * 严格拒绝同级前缀目录 (/app/dist/renderer-evil 等) 及路径穿越
 */
export function isAllowedAppFileUrl(rawUrl, appRendererDir) {
  try {
    if (
      typeof rawUrl !== 'string' ||
      !rawUrl.startsWith('file:') ||
      !appRendererDir ||
      typeof appRendererDir !== 'string' ||
      !appRendererDir.trim()
    ) {
      return false
    }

    const parsedUrl = new URL(rawUrl)
    if (parsedUrl.protocol !== 'file:') return false

    const targetPath = resolve(fileURLToPath(parsedUrl))
    const rendererRoot = resolve(appRendererDir)
    const rel = relative(rendererRoot, targetPath)

    const insideRoot =
      rel === '' ||
      (!rel.startsWith(`..${sep}`) &&
       rel !== '..' &&
       !isAbsolute(rel))

    return insideRoot
  } catch {
    return false
  }
}

/**
 * 评估 WebContents 的导航/窗口打开动作策略
 * @returns {'allow-internal' | 'open-external' | 'deny'}
 */
export function evaluateNavigationPolicy({
  url,
  contentsType = 'window',
  devServerUrl = null,
  appRendererDir = null,
  isDev = false
}) {
  if (typeof url !== 'string' || !url.trim()) return 'deny'

  // 1. WebView 内容
  if (contentsType === 'webview') {
    if (isAllowedAimakeXUrl(url)) {
      return 'allow-internal'
    }
    if (isSafeExternalUrl(url)) {
      return 'open-external'
    }
    return 'deny'
  }

  // 2. 非 WebView (主窗口、Viewer、Snipper 等特权窗口)
  // 开发环境：仅允许精确匹配 devServer 的 origin 内部导航
  if (isDev && devServerUrl && isExactDevOriginUrl(url, devServerUrl)) {
    return 'allow-internal'
  }

  // 生产环境：仅允许应用受控 file:// 页面内部导航（严格限定在 rendererRoot 目录树内部）
  if (url.startsWith('file:')) {
    if (isAllowedAppFileUrl(url, appRendererDir)) {
      return 'allow-internal'
    }
    return 'deny'
  }

  // 任何外部 HTTP/HTTPS 链接（包括 AimakeX 白名单）在非 WebView 窗口中均不能内部 loadURL，只能交给系统默认浏览器
  if (isSafeExternalUrl(url)) {
    return 'open-external'
  }

  // 其他任何危险协议（javascript:, data:, 自定义协议等）直接拒绝
  return 'deny'
}
