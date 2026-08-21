import React, { useState, useEffect, useRef, useCallback } from 'react'
import { calculatePhysicalCropRect, renderPhysicalAnnotations } from '../../shared/snipperCropUtils.js'

export default function ScreenSnipper() {
  const [screenData, setScreenData] = useState(null)
  const [rect, setRect] = useState(null) // { x, y, w, h }
  const [isSelecting, setIsSelecting] = useState(false)
  const [isMoving, setIsMoving] = useState(false)
  const [resizingHandle, setResizingHandle] = useState(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [colorUnderCursor, setColorUnderCursor] = useState('#000000')

  // 标注工具状态
  const [activeTool, setActiveTool] = useState(null) // 'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'mosaic'
  const [toolColor, setToolColor] = useState('#ef4444') // 默认红色
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [annotations, setAnnotations] = useState([]) // [{ tool, color, width, ... }]
  const [currentAnnotation, setCurrentAnnotation] = useState(null)
  const [textInputs, setTextInputs] = useState([]) // [{ x, y, text, color, size }]
  const [activeText, setActiveText] = useState(null)
  const [errorToast, setErrorToast] = useState(null)

  const canvasRef = useRef(null)
  const imageRef = useRef(null)
  const containerRef = useRef(null)

  // 1. 初始化屏幕画面
  useEffect(() => {
    async function init() {
      try {
        const data = await window.clipai?.getSnipperData?.()
        if (data && data.image) {
          const img = new Image()
          img.onload = () => {
            imageRef.current = img
            setScreenData(data)
          }
          img.src = data.image
        }
      } catch (e) {
        console.error('获取截图数据失败:', e)
      }
    }
    init()
  }, [])

  // 2. 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 如果正在输入文字，不拦截空格键与回车
      if (activeText) {
        if (e.key === 'Escape') {
          setActiveText(null)
        }
        return
      }

      if (e.key === 'Escape') {
        window.clipai?.closeSnipper?.()
      } else if (e.key === ' ' || e.code === 'Space') {
        // 微信同款：按空格键一键全屏 / 切换全屏选区
        e.preventDefault()
        if (!rect) {
          setRect({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight })
        } else if (rect.x === 0 && rect.y === 0 && rect.w === window.innerWidth && rect.h === window.innerHeight) {
          setRect(null)
          setAnnotations([])
          setTextInputs([])
        } else {
          setRect({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight })
        }
      } else if (e.key === 'Enter') {
        handleFinish()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        handleUndo()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        handleSave()
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
        handleFinish()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [rect, annotations, textInputs, activeText])

  // 3. 计算规范化矩形
  const normalizeRect = useCallback((r) => {
    if (!r) return null
    let { x, y, w, h } = r
    if (w < 0) {
      x = x + w
      w = Math.abs(w)
    }
    if (h < 0) {
      y = y + h
      h = Math.abs(h)
    }
    return { x, y, w, h }
  }, [])

  const currentRect = normalizeRect(rect)

  // 4. 重绘 Canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const img = imageRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    const width = window.innerWidth
    const height = window.innerHeight

    canvas.width = width
    canvas.height = height

    // 绘制全屏背景图
    ctx.drawImage(img, 0, 0, width, height)

    // 绘制半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fillRect(0, 0, width, height)

    if (currentRect && currentRect.w > 0 && currentRect.h > 0) {
      // 挖空选区，恢复原图亮度
      ctx.save()
      ctx.beginPath()
      ctx.rect(currentRect.x, currentRect.y, currentRect.w, currentRect.h)
      ctx.clip()
      ctx.drawImage(img, 0, 0, width, height)

      // 绘制所有标注
      const allAnnotations = [...annotations, ...(currentAnnotation ? [currentAnnotation] : [])]
      for (const ann of allAnnotations) {
        ctx.save()
        ctx.strokeStyle = ann.color
        ctx.fillStyle = ann.color
        ctx.lineWidth = ann.width
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        if (ann.tool === 'rect') {
          ctx.strokeRect(ann.x, ann.y, ann.w, ann.h)
        } else if (ann.tool === 'circle') {
          ctx.beginPath()
          ctx.ellipse(
            ann.x + ann.w / 2,
            ann.y + ann.h / 2,
            Math.abs(ann.w / 2),
            Math.abs(ann.h / 2),
            0,
            0,
            2 * Math.PI
          )
          ctx.stroke()
        } else if (ann.tool === 'arrow') {
          drawArrow(ctx, ann.fromX, ann.fromY, ann.toX, ann.toY, ann.width)
        } else if (ann.tool === 'pen' && ann.points?.length > 1) {
          ctx.beginPath()
          ctx.moveTo(ann.points[0].x, ann.points[0].y)
          for (let i = 1; i < ann.points.length; i++) {
            ctx.lineTo(ann.points[i].x, ann.points[i].y)
          }
          ctx.stroke()
        } else if (ann.tool === 'mosaic') {
          drawMosaic(ctx, img, ann.x, ann.y, ann.w, ann.h, width, height)
        }
        ctx.restore()
      }

      // 绘制文字标注
      for (const t of textInputs) {
        ctx.save()
        ctx.fillStyle = t.color
        ctx.font = `bold ${t.size || 18}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
        ctx.textBaseline = 'top'
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur = 4
        ctx.fillText(t.text, t.x, t.y)
        ctx.restore()
      }

      ctx.restore()

      // 绘制选区外边框
      ctx.save()
      ctx.strokeStyle = '#0ea5e9'
      ctx.lineWidth = 2
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h)

      // 绘制 8 个缩放控制点
      drawHandles(ctx, currentRect)
      ctx.restore()
    }
  }, [currentRect, annotations, currentAnnotation, textInputs])

  useEffect(() => {
    redraw()
  }, [redraw])

  // 绘制箭头辅助函数
  const drawArrow = (ctx, fromX, fromY, toX, toY, width) => {
    const headlen = Math.max(12, width * 3.5)
    const angle = Math.atan2(toY - fromY, toX - fromX)
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

  // 马赛克辅助函数
  const drawMosaic = (ctx, img, x, y, w, h, screenW, screenH) => {
    const norm = normalizeRect({ x, y, w, h })
    if (!norm || norm.w <= 0 || norm.h <= 0) return
    const tileSize = 8
    ctx.save()
    ctx.beginPath()
    ctx.rect(norm.x, norm.y, norm.w, norm.h)
    ctx.clip()

    for (let i = norm.x; i < norm.x + norm.w; i += tileSize) {
      for (let j = norm.y; j < norm.y + norm.h; j += tileSize) {
        ctx.fillStyle = `rgba(120, 130, 150, 0.7)`
        ctx.fillRect(i, j, tileSize, tileSize)
      }
    }
    ctx.restore()
  }

  // 绘制 8 个控制点
  const drawHandles = (ctx, r) => {
    const handleSize = 7
    const handles = [
      { x: r.x, y: r.y },
      { x: r.x + r.w / 2, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: r.y + r.h / 2 },
      { x: r.x + r.w, y: r.y + r.h },
      { x: r.x + r.w / 2, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
      { x: r.x, y: r.y + r.h / 2 }
    ]

    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#0ea5e9'
    ctx.lineWidth = 2
    for (const h of handles) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, handleSize / 2, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
    }
  }

  // 鼠标移动事件 (放大镜与拖拽)
  const handleMouseMove = (e) => {
    const x = e.clientX
    const y = e.clientY
    setMousePos({ x, y })

    // 读取当前光标像素颜色
    const canvas = canvasRef.current
    if (canvas) {
      try {
        const ctx = canvas.getContext('2d')
        const p = ctx.getImageData(x, y, 1, 1).data
        const hex = '#' + ((1 << 24) + (p[0] << 16) + (p[1] << 8) + p[2]).toString(16).slice(1).toUpperCase()
        setColorUnderCursor(hex)
      } catch {}
    }

    if (isSelecting) {
      setRect((prev) => ({
        x: dragStart.x,
        y: dragStart.y,
        w: x - dragStart.x,
        h: y - dragStart.y
      }))
    } else if (isMoving && currentRect) {
      const dx = x - dragStart.x
      const dy = y - dragStart.y
      setRect({
        x: dragStart.rectX + dx,
        y: dragStart.rectY + dy,
        w: currentRect.w,
        h: currentRect.h
      })
    } else if (resizingHandle && currentRect) {
      handleResize(x, y)
    } else if (activeTool && currentAnnotation) {
      // 正在标注
      if (activeTool === 'rect' || activeTool === 'circle' || activeTool === 'mosaic') {
        setCurrentAnnotation((prev) => ({
          ...prev,
          w: x - prev.x,
          h: y - prev.y
        }))
      } else if (activeTool === 'arrow') {
        setCurrentAnnotation((prev) => ({
          ...prev,
          toX: x,
          toY: y
        }))
      } else if (activeTool === 'pen') {
        setCurrentAnnotation((prev) => ({
          ...prev,
          points: [...prev.points, { x, y }]
        }))
      }
    }
  }

  // 处理 8 个方向拉伸
  const handleResize = (mx, my) => {
    setRect((prev) => {
      const norm = normalizeRect(prev)
      let { x, y, w, h } = norm
      if (resizingHandle === 'nw') {
        w += x - mx
        h += y - my
        x = mx
        y = my
      } else if (resizingHandle === 'n') {
        h += y - my
        y = my
      } else if (resizingHandle === 'ne') {
        w = mx - x
        h += y - my
        y = my
      } else if (resizingHandle === 'e') {
        w = mx - x
      } else if (resizingHandle === 'se') {
        w = mx - x
        h = my - y
      } else if (resizingHandle === 's') {
        h = my - y
      } else if (resizingHandle === 'sw') {
        w += x - mx
        x = mx
        h = my - y
      } else if (resizingHandle === 'w') {
        w += x - mx
        x = mx
      }
      return { x, y, w, h }
    })
  }

  // 鼠标按下
  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    const x = e.clientX
    const y = e.clientY

    if (activeTool) {
      // 处于标注模式
      if (activeTool === 'text') {
        setActiveText({ x, y, text: '' })
      } else if (activeTool === 'pen') {
        setCurrentAnnotation({
          tool: 'pen',
          color: toolColor,
          width: strokeWidth,
          points: [{ x, y }]
        })
      } else if (activeTool === 'arrow') {
        setCurrentAnnotation({
          tool: 'arrow',
          color: toolColor,
          width: strokeWidth,
          fromX: x,
          fromY: y,
          toX: x,
          toY: y
        })
      } else {
        setCurrentAnnotation({
          tool: activeTool,
          color: toolColor,
          width: strokeWidth,
          x,
          y,
          w: 0,
          h: 0
        })
      }
      return
    }

    // 检查是否点击在 8 个控制点上
    if (currentRect) {
      const handle = getHitHandle(x, y, currentRect)
      if (handle) {
        setResizingHandle(handle)
        setDragStart({ x, y })
        return
      }

      // 检查是否点击在选区内拖拽移动
      if (
        x >= currentRect.x &&
        x <= currentRect.x + currentRect.w &&
        y >= currentRect.y &&
        y <= currentRect.y + currentRect.h
      ) {
        setIsMoving(true)
        setDragStart({ x, y, rectX: currentRect.x, rectY: currentRect.y })
        return
      }
    }

    // 开始新选区
    setIsSelecting(true)
    setDragStart({ x, y })
    setRect({ x, y, w: 0, h: 0 })
    setAnnotations([])
    setTextInputs([])
    setActiveTool(null)
  }

  // 鼠标松开
  const handleMouseUp = () => {
    if (isSelecting) {
      setIsSelecting(false)
      if (rect) {
        const norm = normalizeRect(rect)
        if (norm.w < 5 && norm.h < 5) {
          setRect(null)
        } else {
          setRect(norm)
        }
      }
    }
    if (isMoving) setIsMoving(false)
    if (resizingHandle) setResizingHandle(null)

    if (currentAnnotation) {
      setAnnotations((prev) => [...prev, currentAnnotation])
      setCurrentAnnotation(null)
    }
  }

  // 双击全屏或完成
  const handleDoubleClick = () => {
    if (!currentRect) {
      // 没选区时双击：自动选全屏
      setRect({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight })
    } else {
      // 已有选区双击：立即完成截图
      handleFinish()
    }
  }

  // 判定点击了哪一个控制点
  const getHitHandle = (mx, my, r) => {
    const radius = 10
    const handles = {
      nw: { x: r.x, y: r.y },
      n: { x: r.x + r.w / 2, y: r.y },
      ne: { x: r.x + r.w, y: r.y },
      e: { x: r.x + r.w, y: r.y + r.h / 2 },
      se: { x: r.x + r.w, y: r.y + r.h },
      s: { x: r.x + r.w / 2, y: r.y + r.h },
      sw: { x: r.x, y: r.y + r.h },
      w: { x: r.x, y: r.y + r.h / 2 }
    }
    for (const [key, pos] of Object.entries(handles)) {
      if (Math.hypot(mx - pos.x, my - pos.y) <= radius) {
        return key
      }
    }
    return null
  }

  // 撤销上一步
  const handleUndo = () => {
    if (textInputs.length > 0) {
      setTextInputs((prev) => prev.slice(0, -1))
    } else if (annotations.length > 0) {
      setAnnotations((prev) => prev.slice(0, -1))
    }
  }

  // 确认保存裁切结果（直接从原图以物理像素高保真裁剪与绘制标注，杜绝降采样模糊）
  const getCroppedDataUrl = () => {
    const img = imageRef.current
    if (!currentRect || !img) return null

    const logicalViewport = { width: window.innerWidth, height: window.innerHeight }
    const naturalImageSize = {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    }

    const cropRect = calculatePhysicalCropRect(currentRect, logicalViewport, naturalImageSize)
    if (!cropRect.valid || cropRect.width <= 0 || cropRect.height <= 0) return null

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cropRect.width
    cropCanvas.height = cropRect.height
    const ctx = cropCanvas.getContext('2d')

    // 1. 100% 物理无损从原始截图高清裁切
    ctx.drawImage(
      img,
      cropRect.x,
      cropRect.y,
      cropRect.width,
      cropRect.height,
      0,
      0,
      cropRect.width,
      cropRect.height
    )

    // 2. 将标注与文字按物理比例高精度绘制到裁剪画布上
    renderPhysicalAnnotations({
      ctx,
      cropRect,
      annotations,
      textInputs
    })

    return cropCanvas.toDataURL('image/png')
  }

  // 完成截图（直接复制到剪贴板并沉淀历史）
  const handleFinish = async () => {
    const dataUrl = getCroppedDataUrl()
    if (!dataUrl) {
      window.clipai?.closeSnipper?.()
      return
    }

    try {
      const res = await window.clipai?.finishSnipper?.({ dataUrl, openEditor: false })
      if (!res || !res.success) {
        const msg = res?.error || '保存截图失败'
        setErrorToast(msg)
        setTimeout(() => setErrorToast(null), 3000)
        console.error('finishSnipper failed:', msg)
      }
    } catch (err) {
      setErrorToast(err.message || '保存截图异常')
      setTimeout(() => setErrorToast(null), 3000)
    }
  }

  // 深度编辑（截图后直接呼出 ImageViewer 编辑器窗口）
  const handleEdit = async () => {
    const dataUrl = getCroppedDataUrl()
    if (!dataUrl) {
      window.clipai?.closeSnipper?.()
      return
    }

    try {
      const res = await window.clipai?.finishSnipper?.({ dataUrl, openEditor: true })
      if (!res || !res.success) {
        const msg = res?.error || '打开编辑器失败'
        setErrorToast(msg)
        setTimeout(() => setErrorToast(null), 3000)
        console.error('finishSnipper with openEditor failed:', msg)
      }
    } catch (err) {
      setErrorToast(err.message || '打开编辑器异常')
      setTimeout(() => setErrorToast(null), 3000)
    }
  }

  // 保存图片到本地
  const handleSave = async () => {
    const dataUrl = getCroppedDataUrl()
    if (dataUrl) {
      const res = await window.clipai?.saveSnipperImage?.(dataUrl)
      if (res?.success) {
        window.clipai?.closeSnipper?.()
      }
    }
  }

  // 计算工具栏位置
  const getToolbarStyle = () => {
    if (!currentRect) return { display: 'none' }
    const toolbarHeight = 44
    const margin = 10
    let top = currentRect.y + currentRect.h + margin
    let left = currentRect.x + currentRect.w - 380

    if (top + toolbarHeight > window.innerHeight) {
      top = currentRect.y - toolbarHeight - margin
    }
    if (left < 10) left = 10
    if (left + 380 > window.innerWidth) left = window.innerWidth - 390

    return {
      top: Math.max(10, top),
      left: Math.max(10, left)
    }
  }

  // 颜色选项
  const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ffffff', '#000000']

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        userSelect: 'none',
        overflow: 'hidden',
        cursor: isSelecting || activeTool ? 'crosshair' : isMoving ? 'move' : 'default'
      }}
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (activeText) {
          setActiveText(null)
        } else if (activeTool) {
          // 1. 如果处于标注工具模式 -> 右键退出当前工具回到普通选区
          setActiveTool(null)
        } else if (rect) {
          // 2. 如果已有选区 -> 右键清除选区，恢复初始准星状态
          setRect(null)
          setAnnotations([])
          setTextInputs([])
        } else {
          // 3. 如果在初始暗色全屏无选区 -> 鼠标右键直接退出截图
          window.clipai?.closeSnipper?.()
        }
      }}
    >
      {errorToast && (
        <div
          style={{
            position: 'absolute',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(239, 68, 68, 0.95)',
            color: '#fff',
            padding: '8px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            zIndex: 9999,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6
          }}
        >
          <span>❌</span>
          <span>{errorToast}</span>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* ── 🔍 跟随光标的放大镜 (未选区时显示) ── */}
      {!currentRect && (
        <div
          style={{
            position: 'absolute',
            left: mousePos.x + 20,
            top: mousePos.y + 20,
            width: 140,
            padding: 8,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            borderRadius: 8,
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            color: '#fff',
            fontSize: 11,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                backgroundColor: colorUnderCursor,
                border: '1px solid #fff'
              }}
            />
            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{colorUnderCursor}</span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
            坐标: {mousePos.x}, {mousePos.y}
          </div>
          <div style={{ marginTop: 4, color: '#38bdf8', fontSize: 9.5 }}>
            🖱️ 拖拽框选 · 双击全屏
          </div>
        </div>
      )}

      {/* ── 📏 选区尺寸徽标 ── */}
      {currentRect && (
        <div
          style={{
            position: 'absolute',
            left: currentRect.x,
            top: Math.max(6, currentRect.y - 24),
            padding: '2px 8px',
            backgroundColor: 'rgba(15, 23, 42, 0.85)',
            color: '#fff',
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          {Math.round(currentRect.w)} × {Math.round(currentRect.h)} px
        </div>
      )}

      {/* ── 🛠️ 微信风格浮动标注工具栏 ── */}
      {currentRect && !isSelecting && !isMoving && (
        <div
          style={{
            position: 'absolute',
            ...getToolbarStyle(),
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 8px',
            backgroundColor: 'rgba(23, 25, 35, 0.95)',
            backdropFilter: 'blur(16px)',
            borderRadius: 8,
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
            zIndex: 2000,
            animation: 'fadeIn 0.15s ease'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 工具按钮 */}
          <button
            type="button"
            className={`snipper-tool-btn ${activeTool === 'rect' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'rect' ? null : 'rect')}
            title="矩形框"
          >
            🟦
          </button>
          <button
            type="button"
            className={`snipper-tool-btn ${activeTool === 'circle' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'circle' ? null : 'circle')}
            title="圆形框"
          >
            ⭕
          </button>
          <button
            type="button"
            className={`snipper-tool-btn ${activeTool === 'arrow' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'arrow' ? null : 'arrow')}
            title="箭头标注"
          >
            ➡️
          </button>
          <button
            type="button"
            className={`snipper-tool-btn ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'pen' ? null : 'pen')}
            title="画笔涂鸦"
          >
            ✏️
          </button>
          <button
            type="button"
            className={`snipper-tool-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'text' ? null : 'text')}
            title="文字输入"
          >
            🔤
          </button>
          <button
            type="button"
            className={`snipper-tool-btn ${activeTool === 'mosaic' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'mosaic' ? null : 'mosaic')}
            title="马赛克模糊"
          >
            🔲
          </button>

          <div style={{ width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.2)', margin: '0 2px' }} />

          {/* 调色盘 */}
          {activeTool && (
            <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginRight: 4 }}>
              {COLORS.map((c) => (
                <div
                  key={c}
                  onClick={() => setToolColor(c)}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: toolColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                    transform: toolColor === c ? 'scale(1.2)' : 'none'
                  }}
                />
              ))}
            </div>
          )}

          {/* 撤销 */}
          <button
            type="button"
            className="snipper-tool-btn"
            onClick={handleUndo}
            title={`撤销上一步标注 (${(window.clipai?.platform === 'darwin' || (!window.clipai?.platform && typeof navigator !== 'undefined' && !navigator.userAgent?.includes('Windows'))) ? 'Cmd' : 'Ctrl'}+Z)`}
          >
            ↩️
          </button>

          {/* 保存到本地 */}
          <button
            type="button"
            className="snipper-tool-btn"
            onClick={handleSave}
            title={`保存截图为图片 (${(window.clipai?.platform === 'darwin' || (!window.clipai?.platform && typeof navigator !== 'undefined' && !navigator.userAgent?.includes('Windows'))) ? 'Cmd' : 'Ctrl'}+S)`}
          >
            💾
          </button>

          {/* 取消退出 */}
          <button
            type="button"
            className="snipper-tool-btn"
            onClick={() => window.clipai?.closeSnipper?.()}
            title="取消截图 (ESC / 鼠标右键)"
            style={{ color: '#ef4444' }}
          >
            ❌
          </button>

          {/* 🎨 深度编辑（直接打开大图编辑器） */}
          <button
            type="button"
            className="snipper-tool-btn"
            onClick={handleEdit}
            title="直接打开编辑器进行二次涂鸦与 AI 识别分析"
            style={{
              backgroundColor: '#6366f1',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 6,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 4
            }}
          >
            🎨 编辑
          </button>

          {/* 完成截图 */}
          <button
            type="button"
            className="snipper-tool-btn snipper-finish-btn"
            onClick={handleFinish}
            title="完成截图并复制 (Enter / 双击)"
            style={{
              backgroundColor: '#10b981',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 6,
              fontWeight: 600
            }}
          >
            ✅ 完成
          </button>
        </div>
      )}

      {/* 文字输入框 */}
      {activeText && (
        <input
          autoFocus
          type="text"
          value={activeText.text}
          onChange={(e) => setActiveText({ ...activeText, text: e.target.value })}
          onBlur={() => {
            if (activeText.text.trim()) {
              setTextInputs((prev) => [...prev, { ...activeText, color: toolColor, size: strokeWidth * 6 }])
            }
            setActiveText(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (activeText.text.trim()) {
                setTextInputs((prev) => [...prev, { ...activeText, color: toolColor, size: strokeWidth * 6 }])
              }
              setActiveText(null)
            }
          }}
          style={{
            position: 'absolute',
            left: activeText.x,
            top: activeText.y,
            color: toolColor,
            fontSize: strokeWidth * 6,
            fontWeight: 'bold',
            background: 'rgba(0,0,0,0.6)',
            border: '1px dashed #38bdf8',
            padding: '2px 6px',
            outline: 'none',
            borderRadius: 4,
            zIndex: 3000
          }}
        />
      )}

      <style>{`
        .snipper-tool-btn {
          background: transparent;
          border: none;
          outline: none;
          cursor: pointer;
          font-size: 14px;
          padding: 4px 6px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: 0.15s ease;
        }
        .snipper-tool-btn:hover {
          background: rgba(255, 255, 255, 0.15);
        }
        .snipper-tool-btn.active {
          background: rgba(14, 165, 233, 0.3);
          border: 1px solid #0ea5e9;
        }
        .snipper-finish-btn:hover {
          background: #059669 !important;
          transform: scale(1.04);
        }
      `}</style>
    </div>
  )
}
