/**
 * 物理分辨率裁剪与坐标变换工具模块
 * 确保在 Windows 100%、125%、150%、200% 等高 DPI 缩放及多显示器下截图 100% 清晰不失真
 */

/**
 * 将逻辑选区转换为原始图片的物理像素裁剪区域
 * 
 * @param {{ x: number, y: number, w: number, h: number }} selectionRect 逻辑选区
 * @param {{ width: number, height: number }} logicalViewport 逻辑视口宽高 (如 window.innerWidth, window.innerHeight)
 * @param {{ width: number, height: number }} naturalImageSize 原始图片物理宽高 (如 image.naturalWidth, image.naturalHeight)
 * @returns {{ x: number, y: number, width: number, height: number, scaleX: number, scaleY: number, valid: boolean }}
 */
export function calculatePhysicalCropRect(selectionRect, logicalViewport, naturalImageSize) {
  if (!selectionRect || !logicalViewport || !naturalImageSize) {
    return { x: 0, y: 0, width: 0, height: 0, scaleX: 1, scaleY: 1, valid: false }
  }

  const vWidth = Math.max(1, Number(logicalViewport.width) || 1)
  const vHeight = Math.max(1, Number(logicalViewport.height) || 1)
  const imgWidth = Math.max(1, Number(naturalImageSize.width) || 1)
  const imgHeight = Math.max(1, Number(naturalImageSize.height) || 1)

  // 严禁假设 scaleX === scaleY 或等于 scaleFactor，必须分别基于实际物理像素与逻辑视口计算
  const scaleX = imgWidth / vWidth
  const scaleY = imgHeight / vHeight

  // 1. 规范化逻辑选区（处理负宽高逆向拖拽）
  let normX = selectionRect.w < 0 ? selectionRect.x + selectionRect.w : selectionRect.x
  let normY = selectionRect.h < 0 ? selectionRect.y + selectionRect.h : selectionRect.y
  let normW = Math.abs(selectionRect.w || 0)
  let normH = Math.abs(selectionRect.h || 0)

  // 2. 映射到物理像素空间
  const rawPhysX = normX * scaleX
  const rawPhysY = normY * scaleY
  const rawPhysW = normW * scaleX
  const rawPhysH = normH * scaleY

  // 3. 严格边界截断（防止越界或产生空画布）
  const clampedLeft = Math.max(0, Math.min(rawPhysX, imgWidth))
  const clampedTop = Math.max(0, Math.min(rawPhysY, imgHeight))
  const clampedRight = Math.max(0, Math.min(rawPhysX + rawPhysW, imgWidth))
  const clampedBottom = Math.max(0, Math.min(rawPhysY + rawPhysH, imgHeight))

  const physWidth = Math.max(0, clampedRight - clampedLeft)
  const physHeight = Math.max(0, clampedBottom - clampedTop)

  const finalX = Math.round(clampedLeft)
  const finalY = Math.round(clampedTop)
  const finalW = Math.round(physWidth)
  const finalH = Math.round(physHeight)

  return {
    x: finalX,
    y: finalY,
    width: finalW,
    height: finalH,
    scaleX,
    scaleY,
    valid: finalW > 0 && finalH > 0
  }
}

/**
 * 绘制箭头辅助函数
 */
function drawPhysicalArrow(ctx, fromX, fromY, toX, toY, color, lineWidth, scaleFactor) {
  const headlen = Math.max(12, lineWidth * 3.5)
  const angle = Math.atan2(toY - fromY, toX - fromX)
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  ctx.moveTo(fromX, fromY)
  ctx.lineTo(toX, toY)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(toX, toY)
  ctx.lineTo(toX - headlen * Math.cos(angle - Math.PI / 6), toY - headlen * Math.sin(angle - Math.PI / 6))
  ctx.lineTo(toX - headlen * Math.cos(angle + Math.PI / 6), toY - headlen * Math.sin(angle + Math.PI / 6))
  ctx.closePath()
  ctx.fill()
}

/**
 * 在物理画布上渲染标注
 * 
 * 生产数据契约：
 * 标注对象使用 ann.tool (工具类型) 与 ann.width (线宽)
 * 文字对象使用 txt.size (文字字号)
 * 为保证健壮性，兼容安全读取 ann.type 与 txt.fontSize
 * 
 * @param {object} params
 * @param {CanvasRenderingContext2D} params.ctx 目标物理 Canvas 上下文
 * @param {{ x: number, y: number, width: number, height: number, scaleX: number, scaleY: number }} params.cropRect 物理裁剪区域
 * @param {Array<{ tool?: string, type?: string, color?: string, width?: number, size?: number, x?: number, y?: number, w?: number, h?: number, fromX?: number, fromY?: number, toX?: number, toY?: number, points?: Array<{x: number, y: number}> }>} params.annotations 标注列表
 * @param {Array<{ x: number, y: number, text: string, color?: string, size?: number, fontSize?: number }>} params.textInputs 文字标注列表
 */
export function renderPhysicalAnnotations({
  ctx,
  cropRect,
  annotations = [],
  textInputs = []
}) {
  if (!ctx || !cropRect || cropRect.width <= 0 || cropRect.height <= 0) return

  const { x: cropX, y: cropY, scaleX, scaleY } = cropRect
  const scaleFactor = (scaleX + scaleY) / 2

  // 坐标变换函数：逻辑像素 -> 物理裁剪画布坐标
  const toPhysX = (lx) => (Number(lx) || 0) * scaleX - cropX
  const toPhysY = (ly) => (Number(ly) || 0) * scaleY - cropY

  ctx.save()

  // 建立与物理裁剪画布一致的限制区域，确保标注不出界
  ctx.beginPath()
  ctx.rect(0, 0, cropRect.width, cropRect.height)
  ctx.clip()

  for (const ann of annotations) {
    if (!ann) continue
    const tool = ann.tool || ann.type
    if (!tool) continue

    const color = ann.color || '#ef4444'
    const logicalLineWidth = ann.width ?? ann.size ?? 3
    const lineWidth = Math.max(1, Math.round(logicalLineWidth * scaleFactor))

    if (tool === 'rect') {
      let rx = ann.x || 0
      let ry = ann.y || 0
      let rw = ann.w || 0
      let rh = ann.h || 0
      if (rw < 0) { rx += rw; rw = Math.abs(rw); }
      if (rh < 0) { ry += rh; rh = Math.abs(rh); }

      const prx = toPhysX(rx)
      const pry = toPhysY(ry)
      const prw = rw * scaleX
      const prh = rh * scaleY

      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeRect(prx, pry, prw, prh)
      ctx.restore()
    } else if (tool === 'circle') {
      let cx = ann.x || 0
      let cy = ann.y || 0
      let cw = ann.w || 0
      let ch = ann.h || 0
      if (cw < 0) { cx += cw; cw = Math.abs(cw); }
      if (ch < 0) { cy += ch; ch = Math.abs(ch); }

      const centerX = toPhysX(cx + cw / 2)
      const centerY = toPhysY(cy + ch / 2)
      const radiusX = Math.abs((cw * scaleX) / 2)
      const radiusY = Math.abs((ch * scaleY) / 2)

      if (radiusX > 0 && radiusY > 0) {
        ctx.save()
        ctx.strokeStyle = color
        ctx.lineWidth = lineWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI)
        ctx.stroke()
        ctx.restore()
      }
    } else if (tool === 'arrow') {
      const fx = toPhysX(ann.fromX)
      const fy = toPhysY(ann.fromY)
      const tx = toPhysX(ann.toX)
      const ty = toPhysY(ann.toY)

      ctx.save()
      drawPhysicalArrow(ctx, fx, fy, tx, ty, color, lineWidth, scaleFactor)
      ctx.restore()
    } else if (tool === 'pen' && Array.isArray(ann.points) && ann.points.length > 0) {
      ctx.save()
      ctx.strokeStyle = color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      if (ann.points.length === 1) {
        // 单个点绘制实心小圆点
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(toPhysX(ann.points[0].x), toPhysY(ann.points[0].y), Math.max(1, lineWidth / 2), 0, 2 * Math.PI)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.moveTo(toPhysX(ann.points[0].x), toPhysY(ann.points[0].y))
        for (let i = 1; i < ann.points.length; i++) {
          ctx.lineTo(toPhysX(ann.points[i].x), toPhysY(ann.points[i].y))
        }
        ctx.stroke()
      }
      ctx.restore()
    } else if (tool === 'mosaic') {
      let mx = ann.x || 0
      let my = ann.y || 0
      let mw = ann.w || 0
      let mh = ann.h || 0
      if (mw < 0) { mx += mw; mw = Math.abs(mw); }
      if (mh < 0) { my += mh; mh = Math.abs(mh); }

      const pmx = toPhysX(mx)
      const pmy = toPhysY(my)
      const pmw = mw * scaleX
      const pmh = mh * scaleY
      const tileSize = Math.max(6, Math.round(8 * scaleFactor))

      if (pmw > 0 && pmh > 0) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(pmx, pmy, pmw, pmh)
        ctx.clip()

        for (let px = pmx; px < pmx + pmw; px += tileSize) {
          for (let py = pmy; py < pmy + pmh; py += tileSize) {
            ctx.fillStyle = 'rgba(120, 130, 150, 0.75)'
            ctx.fillRect(px, py, tileSize, tileSize)
          }
        }
        ctx.restore()
      }
    }
  }

  // 渲染文字标注
  for (const txt of textInputs) {
    if (!txt || !txt.text) continue
    const tx = toPhysX(txt.x)
    const ty = toPhysY(txt.y)
    const logicalFontSize = txt.size ?? txt.fontSize ?? 18
    const fontSize = Math.max(12, Math.round(logicalFontSize * scaleFactor))

    ctx.save()
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.fillStyle = txt.color || '#ef4444'
    ctx.textBaseline = 'top'
    ctx.shadowColor = 'rgba(0,0,0,0.8)'
    ctx.shadowBlur = Math.round(4 * scaleFactor)
    ctx.fillText(txt.text, tx, ty)
    ctx.restore()
  }

  ctx.restore()
}
