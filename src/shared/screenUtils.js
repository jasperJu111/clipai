/**
 * 精准选取指定目标显示器 (targetDisplay) 对应的 DesktopCapturerSource 采集源
 * 
 * 规则：
 * 1. 优先严格全等匹配 display_id (String(source.display_id) === String(targetDisplay.id))
 * 2. 其次匹配 source.id 冒号分词 (source.id.split(':')[1] === String(targetDisplay.id))
 * 3. 严禁使用 includes 进行短 ID 模糊匹配（防止 '1' 误匹配 '10' 或 '12'）
 * 4. 单显示器时直接返回唯一屏幕源
 * 5. 未匹配时记录明确降级原因，提供安全可用的首个可用屏幕源
 * 
 * @param {Array<{ id: string, name?: string, display_id?: string, thumbnail: any }>} sources
 * @param {{ id: string|number, bounds?: { x: number, y: number, width: number, height: number } }} targetDisplay
 * @returns {{ source: object|null, matched: boolean, reason?: string }}
 */
export function selectDesktopCapturerSource(sources, targetDisplay) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return { source: null, matched: false, reason: '采集源列表为空' }
  }

  if (!targetDisplay || targetDisplay.id === undefined || targetDisplay.id === null) {
    return { source: sources[0], matched: false, reason: '目标显示器信息未提供' }
  }

  const targetIdStr = String(targetDisplay.id).trim()

  // 1. 严格精确匹配 display_id
  for (const s of sources) {
    if (s && s.display_id !== undefined && s.display_id !== null && String(s.display_id).trim() === targetIdStr) {
      return { source: s, matched: true }
    }
  }

  // 2. 严格按 source.id token 冒号分词匹配 (形如 "screen:277909845:0")
  for (const s of sources) {
    if (s && typeof s.id === 'string' && s.id.startsWith('screen:')) {
      const parts = s.id.split(':')
      if (parts[1] && parts[1] === targetIdStr) {
        return { source: s, matched: true }
      }
    }
  }

  // 3. 唯一屏幕源处理
  const screenSources = sources.filter((s) => s && typeof s.id === 'string' && s.id.startsWith('screen:'))
  if (screenSources.length === 1) {
    return { source: screenSources[0], matched: true, reason: '单显示器唯一屏幕源' }
  }

  // 4. 无法精准匹配
  return {
    source: screenSources[0] || sources[0],
    matched: false,
    reason: `未能精准匹配目标显示器 (ID: ${targetIdStr})，已降级选择首个可用屏幕源`
  }
}
