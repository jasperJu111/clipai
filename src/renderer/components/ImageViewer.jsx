import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createTranslator } from '../locales'

export default function ImageViewer() {
  const [lang, setLang] = useState('auto')
  const t = useMemo(() => createTranslator(lang), [lang])

  useEffect(() => {
    window.clipai?.getSettings?.().then((st) => {
      if (st?.language) setLang(st.language)
    }).catch(() => {})
  }, [])

  const [image, setImage] = useState(null)
  const [scale, setScale] = useState(1.0)
  const [rotation, setRotation] = useState(0)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [toast, setToast] = useState(null)
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })

  // ── 🎨 标注编辑状态 ──
  const [isAnnotating, setIsAnnotating] = useState(false)
  const [activeTool, setActiveTool] = useState('text') // 'select' | 'rect' | 'circle' | 'arrow' | 'pen' | 'text' | 'mosaic'
  const [mosaicStyle, setMosaicStyle] = useState('brush') // 'brush' (自由涂抹) | 'rect' (矩形框选)
  const [mosaicDensity, setMosaicDensity] = useState(12) // 6 (细), 12 (中), 20 (粗)
  const [mosaicBrushRadius, setMosaicBrushRadius] = useState(24) // 14 (小), 24 (中), 38 (大)

  const [toolColor, setToolColor] = useState('#ef4444')
  const [fontSize, setFontSize] = useState(24) // 16, 24, 32, 44
  const [strokeWidth, setStrokeWidth] = useState(3) // 2, 4, 7

  const [annotations, setAnnotations] = useState([])
  const [currentAnnotation, setCurrentAnnotation] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(null) // 图形选中下标
  const [selectedTextId, setSelectedTextId] = useState(null) // 文字选中 ID

  // 独立悬浮文字输入弹框状态: { x, y, clientX, clientY, text, color, fontSize, id }
  const [floatingText, setFloatingText] = useState(null)

  const [resizingHandle, setResizingHandle] = useState(null)
  const [isMovingShape, setIsMovingShape] = useState(false)
  const [shapeDragStart, setShapeDragStart] = useState({ x: 0, y: 0, initX: 0, initY: 0 })

  // 文字标注列表: [{ id, x, y, text, color, fontSize }]
  const [textItems, setTextItems] = useState([])
  const [isMovingText, setIsMovingText] = useState(false)
  const [textDragStart, setTextDragStart] = useState({ x: 0, y: 0, initX: 0, initY: 0 })

  // ── ✨ AI 侧边问答栏状态 ──
  const [showAIPanel, setShowAIPanel] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInput, setAiInput] = useState('')
  const [aiHistory, setAiHistory] = useState([])
  const [copiedIndex, setCopiedIndex] = useState(null)

  const containerRef = useRef(null)
  const aiListRef = useRef(null)
  const imgRef = useRef(null)
  const canvasRef = useRef(null)
  const baseCanvasRef = useRef(null)
  const textareaRef = useRef(null)

  const showToast = (msg, icon = '✅') => {
    setToast({ msg, icon })
    setTimeout(() => setToast(null), 2000)
  }

  // 初始化加载图片
  useEffect(() => {
    const init = async () => {
      const img = await window.clipai?.getCurrentViewerImage?.()
      if (img) {
        setImage(img)
        if (img.isScreenshot) setIsAnnotating(true)
      }
    }
    init()

    const unsub = window.clipai?.onLoadViewerImage?.((img) => {
      setImage(img)
      setScale(1.0)
      setRotation(0)
      setPosition({ x: 0, y: 0 })
      setAiHistory([])
      setAnnotations([])
      setTextItems([])
      setSelectedIdx(null)
      setSelectedTextId(null)
      setFloatingText(null)
      if (img?.isScreenshot) setIsAnnotating(true)
    })

    return () => unsub?.()
  }, [])

  // 离屏 Canvas 用于像素取色
  const initBaseCanvas = useCallback(() => {
    if (!imgRef.current || !naturalSize.width) return
    const offCanvas = document.createElement('canvas')
    offCanvas.width = naturalSize.width
    offCanvas.height = naturalSize.height
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(imgRef.current, 0, 0, naturalSize.width, naturalSize.height)
    baseCanvasRef.current = offCanvas
  }, [naturalSize])

  const handleImageLoad = (e) => {
    const w = e.target.naturalWidth
    const h = e.target.naturalHeight
    setNaturalSize({ width: w, height: h })
  }

  useEffect(() => {
    initBaseCanvas()
  }, [initBaseCanvas])

  // 自动聚焦文字输入框
  useEffect(() => {
    if (floatingText && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [floatingText])

  // 滚动至 AI 最新消息
  useEffect(() => {
    if (aiListRef.current) {
      aiListRef.current.scrollTop = aiListRef.current.scrollHeight
    }
  }, [aiHistory, aiLoading])

  // 鼠标滚轮缩放 (全模式随时支持滚轮平滑缩放)
  const handleWheel = useCallback((e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setScale((prev) => {
      const next = Math.min(Math.max(prev + delta, 0.1), 8.0)
      return Math.round(next * 100) / 100
    })
  }, [])

  // 规范化矩形
  const normalizeRect = (r) => {
    if (!r) return { x: 0, y: 0, w: 0, h: 0 }
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
  }

  // 获取标注的包围盒
  const getAnnotationBounds = (ann) => {
    if (!ann) return null
    if (ann.tool === 'rect' || ann.tool === 'circle' || (ann.tool === 'mosaic' && ann.mode === 'rect')) {
      return normalizeRect(ann)
    } else if (ann.tool === 'arrow') {
      const minX = Math.min(ann.fromX, ann.toX)
      const minY = Math.min(ann.fromY, ann.toY)
      const maxX = Math.max(ann.fromX, ann.toX)
      const maxY = Math.max(ann.fromY, ann.toY)
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
    } else if ((ann.tool === 'pen' || (ann.tool === 'mosaic' && ann.mode === 'brush')) && ann.points?.length > 0) {
      let minX = ann.points[0].x, maxX = ann.points[0].x
      let minY = ann.points[0].y, maxY = ann.points[0].y
      for (const p of ann.points) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
        minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
      }
      const pad = ann.radius || 10
      return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 }
    }
    return null
  }

  // 判定是否点中了 8 个控制点
  const getHitHandle = (mx, my, bounds) => {
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return null
    const radius = 12
    const handles = {
      nw: { x: bounds.x, y: bounds.y },
      n: { x: bounds.x + bounds.w / 2, y: bounds.y },
      ne: { x: bounds.x + bounds.w, y: bounds.y },
      e: { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
      se: { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      s: { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
      sw: { x: bounds.x, y: bounds.y + bounds.h },
      w: { x: bounds.x, y: bounds.y + bounds.h / 2 }
    }
    for (const [key, pos] of Object.entries(handles)) {
      if (Math.hypot(mx - pos.x, my - pos.y) <= radius) {
        return key
      }
    }
    return null
  }

  // 判定是否点中了某个已有图形
  const getHitAnnotationIndex = (coords) => {
    for (let i = annotations.length - 1; i >= 0; i--) {
      const b = getAnnotationBounds(annotations[i])
      if (b && coords.x >= b.x - 6 && coords.x <= b.x + b.w + 6 && coords.y >= b.y - 6 && coords.y <= b.y + b.h + 6) {
        return i
      }
    }
    return null
  }

  // 判定是否点中了某个文字 (支持多行包围盒判定)
  const getHitTextItem = (coords) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext('2d')

    for (let i = textItems.length - 1; i >= 0; i--) {
      const t = textItems[i]
      const fSize = t.fontSize || 24
      ctx.font = `bold ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
      const lines = (t.text || '输入文字').split('\n')
      let maxW = 0
      for (const line of lines) {
        const m = ctx.measureText(line)
        if (m.width > maxW) maxW = m.width
      }
      const lineHeight = fSize * 1.35
      const totalH = lines.length * lineHeight
      if (coords.x >= t.x - 8 && coords.x <= t.x + maxW + 16 && coords.y >= t.y - 6 && coords.y <= t.y + totalH + 6) {
        return t
      }
    }
    return null
  }

  // ── 🎨 标注 Canvas 坐标映射 ──
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height)
    }
  }

  // 提交当前正在输入的文字
  const commitFloatingText = () => {
    if (!floatingText) return
    if (floatingText.text.trim()) {
      if (floatingText.id) {
        // 更新已有文字
        setTextItems((prev) =>
          prev.map((t) => (t.id === floatingText.id ? { ...t, text: floatingText.text, color: floatingText.color, fontSize: floatingText.fontSize } : t))
        )
        setSelectedTextId(floatingText.id)
      } else {
        // 新建文字
        const newId = Date.now().toString()
        const newItem = {
          id: newId,
          x: floatingText.x,
          y: floatingText.y,
          text: floatingText.text,
          color: floatingText.color,
          fontSize: floatingText.fontSize
        }
        setTextItems((prev) => [...prev, newItem])
        setSelectedTextId(newId)
      }
      showToast('文字已添加', '🔤')
    } else if (floatingText.id) {
      // 若清空了已有文字，则删除
      setTextItems((prev) => prev.filter((t) => t.id !== floatingText.id))
      setSelectedTextId(null)
    }
    setFloatingText(null)
  }

  // 鼠标按下
  const handleMouseDown = (e) => {
    if (e.button !== 0) return

    // 如果正在输入文字中，点击外部自动保存并提交
    if (floatingText) {
      commitFloatingText()
      return
    }

    if (!isAnnotating) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
      return
    }

    const coords = getCanvasCoords(e)

    // 1. 检查是否点击在已有文字上
    const hitText = getHitTextItem(coords)
    if (hitText) {
      setSelectedTextId(hitText.id)
      setSelectedIdx(null)
      setIsMovingText(true)
      setTextDragStart({ x: coords.x, y: coords.y, initX: hitText.x, initY: hitText.y })
      return
    }

    // 2. 如果处于文字模式且点击了空白区域 -> 呼出原生浮动文字输入框
    if (activeTool === 'text') {
      setSelectedIdx(null)
      setSelectedTextId(null)
      setFloatingText({
        x: coords.x,
        y: coords.y,
        clientX: Math.min(window.innerWidth - 260, Math.max(20, e.clientX - 20)),
        clientY: Math.min(window.innerHeight - 150, Math.max(60, e.clientY - 40)),
        text: '',
        color: toolColor,
        fontSize
      })
      return
    }

    // 3. 检查是否点击在选中图形的 8 个拉伸手柄上
    if (selectedIdx !== null && annotations[selectedIdx]) {
      const bounds = getAnnotationBounds(annotations[selectedIdx])
      const handle = getHitHandle(coords.x, coords.y, bounds)
      if (handle) {
        setResizingHandle(handle)
        setShapeDragStart({ x: coords.x, y: coords.y, initBounds: { ...bounds } })
        return
      }

      // 检查是否点在选中图形内部以平移
      if (coords.x >= bounds.x && coords.x <= bounds.x + bounds.w && coords.y >= bounds.y && coords.y <= bounds.y + bounds.h) {
        setIsMovingShape(true)
        setShapeDragStart({
          x: coords.x,
          y: coords.y,
          initX: annotations[selectedIdx].x ?? bounds.x,
          initY: annotations[selectedIdx].y ?? bounds.y
        })
        return
      }
    }

    // 4. 检查是否点击了其他已有图形以切换选中
    const hitIdx = getHitAnnotationIndex(coords)
    if (hitIdx !== null && (activeTool === 'select' || e.shiftKey)) {
      setSelectedIdx(hitIdx)
      setSelectedTextId(null)
      return
    }

    // 5. 点击空白处，取消选中
    setSelectedIdx(null)
    setSelectedTextId(null)

    if (activeTool === 'mosaic') {
      if (mosaicStyle === 'brush') {
        setCurrentAnnotation({
          tool: 'mosaic',
          mode: 'brush',
          density: mosaicDensity,
          radius: mosaicBrushRadius,
          points: [coords]
        })
      } else {
        setCurrentAnnotation({
          tool: 'mosaic',
          mode: 'rect',
          density: mosaicDensity,
          x: coords.x,
          y: coords.y,
          w: 0,
          h: 0
        })
      }
    } else if (activeTool === 'pen') {
      setCurrentAnnotation({
        tool: 'pen',
        color: toolColor,
        width: strokeWidth * 2,
        points: [coords]
      })
    } else if (activeTool === 'arrow') {
      setCurrentAnnotation({
        tool: 'arrow',
        color: toolColor,
        width: strokeWidth * 2,
        fromX: coords.x,
        fromY: coords.y,
        toX: coords.x,
        toY: coords.y
      })
    } else if (activeTool === 'rect' || activeTool === 'circle') {
      setCurrentAnnotation({
        tool: activeTool,
        color: toolColor,
        width: strokeWidth * 2,
        x: coords.x,
        y: coords.y,
        w: 0,
        h: 0
      })
    }
  }

  // 鼠标移动
  const handleMouseMove = (e) => {
    if (!isAnnotating) {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.x,
          y: e.clientY - dragStart.y
        })
      }
      return
    }

    const coords = getCanvasCoords(e)

    // 1. 拖动文字
    if (isMovingText && selectedTextId) {
      const dx = coords.x - textDragStart.x
      const dy = coords.y - textDragStart.y
      setTextItems((prev) =>
        prev.map((t) => (t.id === selectedTextId ? { ...t, x: textDragStart.initX + dx, y: textDragStart.initY + dy } : t))
      )
      return
    }

    // 2. 8 个控制点拉伸图形
    if (resizingHandle && selectedIdx !== null && annotations[selectedIdx]) {
      const { initBounds } = shapeDragStart
      const dx = coords.x - shapeDragStart.x
      const dy = coords.y - shapeDragStart.y
      let { x, y, w, h } = initBounds

      if (resizingHandle === 'nw') { x += dx; y += dy; w -= dx; h -= dy }
      else if (resizingHandle === 'n') { y += dy; h -= dy }
      else if (resizingHandle === 'ne') { y += dy; w += dx; h -= dy }
      else if (resizingHandle === 'e') { w += dx }
      else if (resizingHandle === 'se') { w += dx; h += dy }
      else if (resizingHandle === 's') { h += dy }
      else if (resizingHandle === 'sw') { x += dx; w -= dx; h += dy }
      else if (resizingHandle === 'w') { x += dx; w -= dx }

      setAnnotations((prev) => {
        const next = [...prev]
        const norm = normalizeRect({ x, y, w, h })
        next[selectedIdx] = { ...next[selectedIdx], ...norm }
        return next
      })
      return
    }

    // 3. 拖拽平移图形
    if (isMovingShape && selectedIdx !== null && annotations[selectedIdx]) {
      const dx = coords.x - shapeDragStart.x
      const dy = coords.y - shapeDragStart.y
      setAnnotations((prev) => {
        const next = [...prev]
        const item = next[selectedIdx]
        if (item.tool === 'rect' || item.tool === 'circle' || (item.tool === 'mosaic' && item.mode === 'rect')) {
          next[selectedIdx] = {
            ...item,
            x: shapeDragStart.initX + dx,
            y: shapeDragStart.initY + dy
          }
        } else if (item.tool === 'arrow') {
          next[selectedIdx] = {
            ...item,
            fromX: item.fromX + (coords.x - shapeDragStart.x),
            fromY: item.fromY + (coords.y - shapeDragStart.y),
            toX: item.toX + (coords.x - shapeDragStart.x),
            toY: item.toY + (coords.y - shapeDragStart.y)
          }
          setShapeDragStart({ ...shapeDragStart, x: coords.x, y: coords.y })
        }
        return next
      })
      return
    }

    // 4. 正在新建绘制
    if (currentAnnotation) {
      if (currentAnnotation.tool === 'mosaic' && currentAnnotation.mode === 'brush') {
        setCurrentAnnotation((prev) => ({
          ...prev,
          points: [...prev.points, coords]
        }))
      } else if (activeTool === 'rect' || activeTool === 'circle' || (activeTool === 'mosaic' && mosaicStyle === 'rect')) {
        setCurrentAnnotation((prev) => ({
          ...prev,
          w: coords.x - prev.x,
          h: coords.y - prev.y
        }))
      } else if (activeTool === 'arrow') {
        setCurrentAnnotation((prev) => ({
          ...prev,
          toX: coords.x,
          toY: coords.y
        }))
      } else if (activeTool === 'pen') {
        setCurrentAnnotation((prev) => ({
          ...prev,
          points: [...prev.points, coords]
        }))
      }
    }
  }

  // 鼠标松开
  const handleMouseUp = () => {
    if (!isAnnotating) {
      setIsDragging(false)
      return
    }

    if (isMovingText) setIsMovingText(false)
    if (resizingHandle) setResizingHandle(null)
    if (isMovingShape) setIsMovingShape(false)

    if (currentAnnotation) {
      let finalAnn = currentAnnotation
      if (currentAnnotation.tool === 'rect' || currentAnnotation.tool === 'circle' || (currentAnnotation.tool === 'mosaic' && currentAnnotation.mode === 'rect')) {
        const norm = normalizeRect(currentAnnotation)
        if (norm.w >= 4 && norm.h >= 4) {
          finalAnn = { ...currentAnnotation, ...norm }
          setAnnotations((prev) => {
            const next = [...prev, finalAnn]
            setSelectedIdx(next.length - 1)
            return next
          })
        }
      } else {
        setAnnotations((prev) => {
          const next = [...prev, finalAnn]
          setSelectedIdx(next.length - 1)
          return next
        })
      }
      setCurrentAnnotation(null)
    }
  }

  // 双击事件：双击已有文字直接进入编辑
  const handleDoubleClick = (e) => {
    if (!isAnnotating) {
      if (scale === 1.0) {
        setScale(1.8)
      } else {
        setScale(1.0)
        setPosition({ x: 0, y: 0 })
      }
      return
    }

    const coords = getCanvasCoords(e)
    const hitText = getHitTextItem(coords)
    if (hitText) {
      setSelectedTextId(hitText.id)
      setFloatingText({
        id: hitText.id,
        x: hitText.x,
        y: hitText.y,
        clientX: Math.min(window.innerWidth - 260, Math.max(20, e.clientX - 20)),
        clientY: Math.min(window.innerHeight - 150, Math.max(60, e.clientY - 40)),
        text: hitText.text,
        color: hitText.color,
        fontSize: hitText.fontSize
      })
    }
  }

  // 绘制 8 个控制点与虚线选中框
  const drawSelectionBox = (ctx, bounds) => {
    if (!bounds || bounds.w <= 0 || bounds.h <= 0) return
    ctx.save()
    ctx.strokeStyle = '#38bdf8'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 4])
    ctx.strokeRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4)
    ctx.setLineDash([])

    const handles = [
      { x: bounds.x, y: bounds.y },
      { x: bounds.x + bounds.w / 2, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
      { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
      { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h },
      { x: bounds.x, y: bounds.y + bounds.h / 2 }
    ]

    for (const h of handles) {
      ctx.beginPath()
      ctx.arc(h.x, h.y, 4.5, 0, 2 * Math.PI)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#0284c7'
      ctx.lineWidth = 2
      ctx.stroke()
    }
    ctx.restore()
  }

  // ── 🔲 真实原图像素采样马赛克核心算法 ──
  const drawRealPixelMosaicRect = (ctx, x, y, w, h, tileSize = 12) => {
    const baseCanvas = baseCanvasRef.current
    if (!baseCanvas) return
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true })

    const norm = normalizeRect({ x, y, w, h })
    if (norm.w <= 0 || norm.h <= 0) return

    const startX = Math.max(0, Math.floor(norm.x))
    const startY = Math.max(0, Math.floor(norm.y))
    const endX = Math.min(baseCanvas.width, Math.ceil(norm.x + norm.w))
    const endY = Math.min(baseCanvas.height, Math.ceil(norm.y + norm.h))
    const width = endX - startX
    const height = endY - startY
    if (width <= 0 || height <= 0) return

    try {
      const imgData = baseCtx.getImageData(startX, startY, width, height)
      const data = imgData.data

      ctx.save()
      ctx.beginPath()
      ctx.rect(startX, startY, width, height)
      ctx.clip()

      for (let py = 0; py < height; py += tileSize) {
        for (let px = 0; px < width; px += tileSize) {
          let r = 0, g = 0, b = 0, count = 0
          for (let dy = 0; dy < tileSize && py + dy < height; dy++) {
            for (let dx = 0; dx < tileSize && px + dx < width; dx++) {
              const idx = ((py + dy) * width + (px + dx)) * 4
              r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; count++
            }
          }
          if (count > 0) {
            ctx.fillStyle = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
            ctx.fillRect(startX + px, startY + py, tileSize, tileSize)
            ctx.strokeStyle = 'rgba(0,0,0,0.04)'
            ctx.strokeRect(startX + px, startY + py, tileSize, tileSize)
          }
        }
      }
      ctx.restore()
    } catch (e) {
      console.warn('马赛克取色异常:', e)
    }
  }

  // ── 🖌️ 自由画笔涂抹马赛克 ──
  const drawRealPixelMosaicBrush = (ctx, points, radius = 24, tileSize = 12) => {
    if (!points || points.length === 0) return
    const baseCanvas = baseCanvasRef.current
    if (!baseCanvas) return
    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true })

    let minX = points[0].x, maxX = points[0].x
    let minY = points[0].y, maxY = points[0].y
    for (const p of points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y)
    }

    const pad = radius + 4
    const startX = Math.max(0, Math.floor(minX - pad))
    const startY = Math.max(0, Math.floor(minY - pad))
    const endX = Math.min(baseCanvas.width, Math.ceil(maxX + pad))
    const endY = Math.min(baseCanvas.height, Math.ceil(maxY + pad))
    const width = endX - startX
    const height = endY - startY
    if (width <= 0 || height <= 0) return

    try {
      const imgData = baseCtx.getImageData(startX, startY, width, height)
      const data = imgData.data

      ctx.save()
      ctx.beginPath()
      for (const p of points) {
        ctx.moveTo(p.x + radius, p.y)
        ctx.arc(p.x, p.y, radius, 0, 2 * Math.PI)
      }
      ctx.clip()

      for (let py = 0; py < height; py += tileSize) {
        for (let px = 0; px < width; px += tileSize) {
          let r = 0, g = 0, b = 0, count = 0
          for (let dy = 0; dy < tileSize && py + dy < height; dy++) {
            for (let dx = 0; dx < tileSize && px + dx < width; dx++) {
              const idx = ((py + dy) * width + (px + dx)) * 4
              r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; count++
            }
          }
          if (count > 0) {
            ctx.fillStyle = `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`
            ctx.fillRect(startX + px, startY + py, tileSize, tileSize)
            ctx.strokeStyle = 'rgba(0,0,0,0.04)'
            ctx.strokeRect(startX + px, startY + py, tileSize, tileSize)
          }
        }
      }
      ctx.restore()
    } catch (e) {
      console.warn('涂抹马赛克取色异常:', e)
    }
  }

  // 绘制箭头辅助函数
  const drawArrow = (ctx, fromX, fromY, toX, toY, width) => {
    const headlen = Math.max(16, width * 3.5)
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

  // ── 🔤 绘制多行排版文字与高对比描边 ──
  const drawMultilineText = (ctx, item, isSelected = false) => {
    if (!item.text?.trim()) return
    const fSize = item.fontSize || 24
    const lines = item.text.split('\n')
    const lineHeight = fSize * 1.35

    ctx.save()
    ctx.font = `bold ${fSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
    ctx.textBaseline = 'top'

    let maxW = 0
    lines.forEach((line, idx) => {
      const curY = item.y + idx * lineHeight
      const m = ctx.measureText(line)
      if (m.width > maxW) maxW = m.width

      // 高对比描边与深色投影
      ctx.shadowColor = 'rgba(0,0,0,0.85)'
      ctx.shadowBlur = 6
      ctx.strokeStyle = item.color === '#ffffff' ? '#000000' : 'rgba(0,0,0,0.65)'
      ctx.lineWidth = Math.max(2.5, fSize * 0.12)
      ctx.strokeText(line, item.x, curY)

      ctx.fillStyle = item.color
      ctx.fillText(line, item.x, curY)
    })

    // 选中状态：精致的定位蓝框与四角小手柄
    if (isSelected) {
      const totalH = lines.length * lineHeight
      ctx.strokeStyle = '#38bdf8'
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 4])
      ctx.strokeRect(item.x - 6, item.y - 4, maxW + 12, totalH + 8)
      ctx.setLineDash([])

      const corners = [
        { x: item.x - 6, y: item.y - 4 },
        { x: item.x + maxW + 6, y: item.y - 4 },
        { x: item.x + maxW + 6, y: item.y + totalH + 4 },
        { x: item.x - 6, y: item.y + totalH + 4 }
      ]
      for (const c of corners) {
        ctx.beginPath()
        ctx.arc(c.x, c.y, 4, 0, 2 * Math.PI)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        ctx.strokeStyle = '#0284c7'
        ctx.lineWidth = 1.5
        ctx.stroke()
      }
    }

    ctx.restore()
  }

  // 重绘 Canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !naturalSize.width) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const all = [...annotations, ...(currentAnnotation ? [currentAnnotation] : [])]
    all.forEach((ann, idx) => {
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
        if (ann.mode === 'brush') {
          drawRealPixelMosaicBrush(ctx, ann.points, ann.radius || mosaicBrushRadius, ann.density || mosaicDensity)
        } else {
          drawRealPixelMosaicRect(ctx, ann.x, ann.y, ann.w, ann.h, ann.density || mosaicDensity)
        }
      }

      if (selectedIdx === idx && !currentAnnotation) {
        const bounds = getAnnotationBounds(ann)
        drawSelectionBox(ctx, bounds)
      }

      ctx.restore()
    })

    // 绘制所有文字标注
    for (const t of textItems) {
      if (floatingText && floatingText.id === t.id) continue // 正在二次编辑的暂不重绘底层
      drawMultilineText(ctx, t, t.id === selectedTextId)
    }
  }, [annotations, currentAnnotation, textItems, naturalSize, selectedIdx, selectedTextId, floatingText, mosaicDensity, mosaicBrushRadius])

  useEffect(() => {
    redrawCanvas()
  }, [redrawCanvas])

  // 撤销上一步
  const handleUndo = () => {
    if (textItems.length > 0 && selectedTextId) {
      setTextItems((prev) => prev.filter((t) => t.id !== selectedTextId))
      setSelectedTextId(null)
      showToast('已删除选中文字', '↩️')
    } else if (annotations.length > 0) {
      setAnnotations((prev) => prev.slice(0, -1))
      setSelectedIdx(null)
      showToast('已撤销上一步标注', '↩️')
    }
  }

  // 获取有效图片显示源
  const getImageSrc = () => {
    if (!image) return ''
    if (typeof image === 'string') return image
    return image.content || (image.filePath ? `clipai-image://${image.filePath}` : image.thumbnail) || ''
  }

  // 合成高清原图与标注
  const getCompositeDataUrl = () => {
    if (!image || !imgRef.current) return getImageSrc()
    if (annotations.length === 0 && textItems.length === 0 && !floatingText) {
      if (image.content) return image.content
      const compCanvas = document.createElement('canvas')
      compCanvas.width = naturalSize.width || imgRef.current.naturalWidth || 800
      compCanvas.height = naturalSize.height || imgRef.current.naturalHeight || 600
      const ctx = compCanvas.getContext('2d')
      ctx.drawImage(imgRef.current, 0, 0, compCanvas.width, compCanvas.height)
      return compCanvas.toDataURL('image/png')
    }

    const compCanvas = document.createElement('canvas')
    compCanvas.width = naturalSize.width
    compCanvas.height = naturalSize.height
    const ctx = compCanvas.getContext('2d')

    ctx.drawImage(imgRef.current, 0, 0, naturalSize.width, naturalSize.height)

    const all = [...annotations]
    for (const ann of all) {
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
        if (ann.mode === 'brush') {
          drawRealPixelMosaicBrush(ctx, ann.points, ann.radius || mosaicBrushRadius, ann.density || mosaicDensity)
        } else {
          drawRealPixelMosaicRect(ctx, ann.x, ann.y, ann.w, ann.h, ann.density || mosaicDensity)
        }
      }
      ctx.restore()
    }

    for (const t of textItems) {
      drawMultilineText(ctx, t, false)
    }

    if (floatingText && floatingText.text?.trim()) {
      drawMultilineText(ctx, floatingText, false)
    }

    return compCanvas.toDataURL('image/png')
  }

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (floatingText) return // 正在弹框输入时不拦截全局快捷键

      if (e.key === 'Escape') {
        if (showAIPanel) {
          setShowAIPanel(false)
        } else {
          window.close()
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTextId) {
          setTextItems((prev) => prev.filter((t) => t.id !== selectedTextId))
          setSelectedTextId(null)
          showToast('已删除文字标注', '🗑️')
        } else if (selectedIdx !== null) {
          setAnnotations((prev) => prev.filter((_, i) => i !== selectedIdx))
          setSelectedIdx(null)
          showToast('已删除选中标注', '🗑️')
        }
      } else if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
        setScale(1.0)
        setPosition({ x: 0, y: 0 })
      } else if ((e.key === '=' || e.key === '+') && (e.metaKey || e.ctrlKey)) {
        setScale((s) => Math.min(s + 0.2, 8.0))
      } else if (e.key === '-' && (e.metaKey || e.ctrlKey)) {
        setScale((s) => Math.max(s - 0.2, 0.1))
      } else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        handleUndo()
      } else if ((e.key === 'c' || e.key === 'C') && (e.metaKey || e.ctrlKey)) {
        copyImage()
      } else if ((e.key === 's' || e.key === 'S') && (e.metaKey || e.ctrlKey)) {
        saveImage()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showAIPanel, annotations, textItems, image, selectedIdx, selectedTextId, floatingText])

  const copyImage = async () => {
    if (!image) return
    const finalDataUrl = getCompositeDataUrl()
    if (!finalDataUrl) {
      showToast('未能生成图片数据', '❌')
      return
    }

    try {
      const res = window.clipai?.copyImageToClipboard
        ? await window.clipai.copyImageToClipboard(finalDataUrl)
        : await window.clipai?.copyToClipboard?.({ type: 'image', content: finalDataUrl })

      if (res && res.success) {
        showToast('图片已复制到剪贴板', '📋')
      } else {
        showToast(res?.error || '复制图片失败', '❌')
      }
    } catch (err) {
      showToast(err.message || '复制图片失败', '❌')
    }
  }

  const saveImage = async () => {
    const finalDataUrl = getCompositeDataUrl()
    if (!finalDataUrl) return
    const res = await window.clipai?.saveImageDialog?.(finalDataUrl)
    if (res?.success) {
      showToast('图片已成功保存到本地', '💾')
    }
  }

  // ── AI 请求逻辑 ──
  const handleAskAI = async (customPrompt) => {
    const promptText = (customPrompt || aiInput).trim()
    if (!promptText || !image || aiLoading) return

    setShowAIPanel(true)
    setAiLoading(true)
    const newEntry = { question: promptText, answer: '', timestamp: Date.now() }
    setAiHistory((prev) => [...prev, newEntry])
    setAiInput('')

    try {
      const settings = (await window.clipai?.getSettings?.()) || {}
      const activeProvider = settings.provider || 'gemini'
      const providerConfig = settings.providerConfigs?.[activeProvider] || {}
      const activeModel = providerConfig.model || (activeProvider === 'gemini' ? settings.geminiModel : (activeProvider === 'openai' ? settings.openaiModel : ''))

      const finalDataUrl = getCompositeDataUrl()
      const res = await window.clipai?.aiRequest?.({
        prompt: promptText,
        content: finalDataUrl,
        type: 'image',
        provider: activeProvider,
        model: activeModel,
        customBaseUrl: providerConfig.customBaseUrl
      })

      if (res?.success) {
        setAiHistory((prev) => {
          const updated = [...prev]
          updated[updated.length - 1].answer = res.result
          return updated
        })
      } else {
        setAiHistory((prev) => {
          const updated = [...prev]
          updated[updated.length - 1].answer = `❌ 请求失败: ${res?.error || '请检查 API Key 设置'}`
          return updated
        })
      }
    } catch (err) {
      setAiHistory((prev) => {
        const updated = [...prev]
        updated[updated.length - 1].answer = `❌ 发生错误: ${err.message}`
        return updated
      })
    } finally {
      setAiLoading(false)
    }
  }

  const copyText = (text, idx) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    showToast('文本已复制', '✅')
    setTimeout(() => setCopiedIndex(null), 1500)
  }

  const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ffffff', '#000000']
  const FONT_SIZES = [
    { label: '小 (16px)', size: 16 },
    { label: '中 (24px)', size: 24 },
    { label: '大 (32px)', size: 32 },
    { label: '特大 (44px)', size: 44 }
  ]
  const STROKE_WIDTHS = [
    { label: '细', val: 2 },
    { label: '中', val: 4 },
    { label: '粗', val: 7 }
  ]
  const DENSITIES = [
    { label: '细密 (6px)', val: 6 },
    { label: '标准 (12px)', val: 12 },
    { label: '强力 (20px)', val: 20 }
  ]
  const BRUSH_SIZES = [
    { label: '小', val: 14 },
    { label: '中', val: 24 },
    { label: '大', val: 38 }
  ]

  if (!image) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12131a', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ width: 24, height: 24, margin: '0 auto 12px' }} />
          <div style={{ fontSize: 13, opacity: 0.7 }}>加载图片中...</div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0b0c12',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* ── 顶部可拖拽原生标题栏 ── */}
      <div
        style={{
          height: 38,
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(18, 20, 32, 0.85)',
          backdropFilter: 'blur(12px)',
          WebkitAppRegion: 'drag',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 100,
          position: 'relative'
        }}
      >
        <div style={{ position: 'absolute', left: 14, display: 'flex', gap: 7, WebkitAppRegion: 'no-drag' }}>
          <div
            onClick={() => window.close()}
            style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ff5f56', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.2)' }}
            title="关闭窗口"
          />
          <div
            onClick={() => {
              if (window.clipai?.minimizeImageViewer) {
                window.clipai.minimizeImageViewer()
              } else {
                window.clipai?.minimizeWindow?.()
              }
            }}
            style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#ffbd2e', cursor: 'pointer', border: '1px solid rgba(0,0,0,0.2)' }}
            title="最小化"
          />
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 500, color: 'rgba(255, 255, 255, 0.85)' }}>
          {image.isScreenshot ? '📸 高清截图查看与标注' : '🖼️ 高清图片查看器'}
          {naturalSize.width > 0 && ` (${naturalSize.width} × ${naturalSize.height})`}
        </span>
      </div>

      {/* ── 顶部悬浮导航工具栏 ── */}
      <div
        style={{
          position: 'absolute',
          top: 48,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(24, 26, 40, 0.92)',
          backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          borderRadius: 24,
          padding: '4px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 10px 36px rgba(0, 0, 0, 0.6)',
          zIndex: 100,
          WebkitAppRegion: 'no-drag'
        }}
      >
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 16, color: '#fff' }}
          onClick={() => setScale((s) => Math.min(s + 0.25, 8.0))}
          title="放大 (⌘+ / 滚轮上滑)"
        >
          🔍+
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 16, color: '#fff' }}
          onClick={() => setScale((s) => Math.max(s - 0.25, 0.1))}
          title="缩小 (⌘- / 滚轮下滑)"
        >
          🔍-
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 16, color: '#fff' }}
          onClick={() => { setScale(1.0); setPosition({ x: 0, y: 0 }) }}
          title="适应窗口 (⌘0)"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 16, color: '#fff' }}
          onClick={() => setRotation((r) => (r + 90) % 360)}
          title="顺时针旋转 90°"
        >
          ↺ 旋转
        </button>

        <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.15)' }} />

        {/* 🎨 标注编辑模式开关 */}
        <button
          className={`btn ${isAnnotating ? 'btn-primary' : 'btn-ghost'}`}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            borderRadius: 16,
            backgroundColor: isAnnotating ? 'var(--accent)' : 'transparent',
            color: '#fff',
            fontWeight: isAnnotating ? 600 : 400
          }}
          onClick={() => {
            setIsAnnotating(!isAnnotating)
          }}
          title="开启/关闭涂鸦标注工具"
        >
          ✏️ 标注模式
        </button>

        <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.15)' }} />

        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 16, color: '#fff' }}
          onClick={copyImage}
          title="复制到剪贴板 (⌘C)"
        >
          📋 复制
        </button>
        <button
          className="btn btn-ghost"
          style={{ padding: '4px 8px', fontSize: 12, borderRadius: 16, color: '#fff' }}
          onClick={saveImage}
          title="保存到本地 (⌘S)"
        >
          💾 保存
        </button>

        <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.15)' }} />

        <button
          className={`btn ${showAIPanel ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '4px 12px', fontSize: 12, borderRadius: 16, fontWeight: 600 }}
          onClick={() => setShowAIPanel(!showAIPanel)}
        >
          ✨ 问 AI
        </button>
      </div>

      {/* ── 🛠️ 微信风格：智能工具微调悬浮条 (位于主栏正上方，间距分明，绝不重叠) ── */}
      {isAnnotating && (
        <>
          {/* 马赛克微调条 */}
          {activeTool === 'mosaic' && (
            <div
              style={{
                position: 'absolute',
                bottom: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.96)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 22,
                padding: '5px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                zIndex: 110,
                animation: 'fadeIn 0.15s ease'
              }}
            >
              <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.06)', padding: '2px 4px', borderRadius: 12 }}>
                <button
                  className={`segmented-btn ${mosaicStyle === 'brush' ? 'active' : ''}`}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setMosaicStyle('brush')}
                  title="鼠标自由涂抹打码"
                >
                  🖌️ 自由涂抹
                </button>
                <button
                  className={`segmented-btn ${mosaicStyle === 'rect' ? 'active' : ''}`}
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={() => setMosaicStyle('rect')}
                  title="矩形框选打码"
                >
                  🔲 矩形框选
                </button>
              </div>

              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />

              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>密度:</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {DENSITIES.map((d) => (
                  <button
                    key={d.val}
                    className={`segmented-btn ${mosaicDensity === d.val ? 'active' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setMosaicDensity(d.val)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>

              {mosaicStyle === 'brush' && (
                <>
                  <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>笔刷:</span>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {BRUSH_SIZES.map((b) => (
                      <button
                        key={b.val}
                        className={`segmented-btn ${mosaicBrushRadius === b.val ? 'active' : ''}`}
                        style={{ fontSize: 11, padding: '2px 8px' }}
                        onClick={() => setMosaicBrushRadius(b.val)}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 矩形/圆形/箭头/画笔微调条 (粗细与调色盘) */}
          {(activeTool === 'rect' || activeTool === 'circle' || activeTool === 'arrow' || activeTool === 'pen') && (
            <div
              style={{
                position: 'absolute',
                bottom: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.96)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 22,
                padding: '5px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                zIndex: 110,
                animation: 'fadeIn 0.15s ease'
              }}
            >
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>线条粗细:</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {STROKE_WIDTHS.map((s) => (
                  <button
                    key={s.val}
                    className={`segmented-btn ${strokeWidth === s.val ? 'active' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => setStrokeWidth(s.val)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />

              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>颜色:</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => {
                      setToolColor(c)
                      if (selectedIdx !== null) {
                        setAnnotations((prev) => prev.map((a, i) => (i === selectedIdx ? { ...a, color: c } : a)))
                      }
                    }}
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      backgroundColor: c,
                      cursor: 'pointer',
                      border: toolColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                      transform: toolColor === c ? 'scale(1.2)' : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 🔤 文字微调条 (字号与调色盘) */}
          {(activeTool === 'text' || selectedTextId || floatingText) && (
            <div
              style={{
                position: 'absolute',
                bottom: 80,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(15, 23, 42, 0.96)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 22,
                padding: '5px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
                zIndex: 110,
                animation: 'fadeIn 0.15s ease'
              }}
            >
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>字号:</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {FONT_SIZES.map((f) => (
                  <button
                    key={f.size}
                    className={`segmented-btn ${(floatingText ? floatingText.fontSize : fontSize) === f.size ? 'active' : ''}`}
                    style={{ fontSize: 11, padding: '2px 8px' }}
                    onClick={() => {
                      setFontSize(f.size)
                      if (floatingText) {
                        setFloatingText((prev) => ({ ...prev, fontSize: f.size }))
                      }
                      if (selectedTextId) {
                        setTextItems((prev) => prev.map((t) => (t.id === selectedTextId ? { ...t, fontSize: f.size } : t)))
                      }
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.2)' }} />

              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>文字颜色:</span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {COLORS.map((c) => (
                  <div
                    key={c}
                    onClick={() => {
                      setToolColor(c)
                      if (floatingText) {
                        setFloatingText((prev) => ({ ...prev, color: c }))
                      }
                      if (selectedTextId) {
                        setTextItems((prev) => prev.map((t) => (t.id === selectedTextId ? { ...t, color: c } : t)))
                      }
                    }}
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      backgroundColor: c,
                      cursor: 'pointer',
                      border: (floatingText ? floatingText.color : toolColor) === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.3)',
                      transform: (floatingText ? floatingText.color : toolColor) === c ? 'scale(1.2)' : 'none'
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 🛠️ 微信风格：置底浮动主标注工具条 (高内聚单条胶囊) ── */}
      {isAnnotating && (
        <div
          style={{
            position: 'absolute',
            bottom: 22,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(18, 20, 32, 0.95)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.22)',
            borderRadius: 24,
            padding: '6px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 14px 44px rgba(0, 0, 0, 0.75)',
            zIndex: 100,
            animation: 'fadeIn 0.15s ease'
          }}
        >
          <button
            className={`tool-icon-btn ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => { if (floatingText) commitFloatingText(); setActiveTool('select') }}
            title={t('imageViewer.select')}
          >
            {t('imageViewer.select')}
          </button>

          <button
            className={`tool-icon-btn ${activeTool === 'rect' ? 'active' : ''}`}
            onClick={() => { if (floatingText) commitFloatingText(); setActiveTool('rect') }}
            title={t('imageViewer.rect')}
          >
            {t('imageViewer.rect')}
          </button>
          <button
            className={`tool-icon-btn ${activeTool === 'circle' ? 'active' : ''}`}
            onClick={() => { if (floatingText) commitFloatingText(); setActiveTool('circle') }}
            title={t('imageViewer.circle')}
          >
            {t('imageViewer.circle')}
          </button>
          <button
            className={`tool-icon-btn ${activeTool === 'arrow' ? 'active' : ''}`}
            onClick={() => { if (floatingText) commitFloatingText(); setActiveTool('arrow') }}
            title={t('imageViewer.arrow')}
          >
            {t('imageViewer.arrow')}
          </button>
          <button
            className={`tool-icon-btn ${activeTool === 'pen' ? 'active' : ''}`}
            onClick={() => { if (floatingText) commitFloatingText(); setActiveTool('pen') }}
            title={t('imageViewer.pen')}
          >
            {t('imageViewer.pen')}
          </button>
          <button
            className={`tool-icon-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool('text')}
            title={t('imageViewer.text')}
          >
            {t('imageViewer.text')}
          </button>
          <button
            className={`tool-icon-btn ${activeTool === 'mosaic' ? 'active' : ''}`}
            onClick={() => { if (floatingText) commitFloatingText(); setActiveTool('mosaic') }}
            title={t('imageViewer.mosaic')}
          >
            {t('imageViewer.mosaic')}
          </button>

          <div style={{ width: 1, height: 16, background: 'rgba(255, 255, 255, 0.2)', margin: '0 4px' }} />

          {/* 撤销与清空 */}
          <button
            className="tool-icon-btn"
            onClick={handleUndo}
            title={t('imageViewer.undo')}
          >
            {t('imageViewer.undo')}
          </button>
          <button
            className="tool-icon-btn"
            onClick={() => {
              setAnnotations([])
              setTextItems([])
              setSelectedIdx(null)
              setSelectedTextId(null)
              setFloatingText(null)
              showToast(t('imageViewer.clear'), '🗑️')
            }}
            title={t('imageViewer.clear')}
            style={{ color: '#ef4444' }}
          >
            {t('imageViewer.clear')}
          </button>
        </div>
      )}

      {/* ── 核心内容区：图片画布与 AI 侧边栏 ── */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
        {/* 图片与标注层展示区 */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isAnnotating
              ? (resizingHandle ? 'crosshair' : activeTool === 'select' ? 'pointer' : activeTool === 'text' ? 'text' : activeTool === 'mosaic' ? (mosaicStyle === 'brush' ? 'cell' : 'crosshair') : 'crosshair')
              : (isDragging ? 'grabbing' : 'grab'),
            position: 'relative',
            overflow: 'hidden'
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <div
            style={{
              position: 'relative',
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: isDragging || isAnnotating ? 'none' : 'transform 0.12s ease-out',
              display: 'inline-block'
            }}
          >
            <img
              ref={imgRef}
              src={getImageSrc()}
              alt="viewer target"
              onLoad={handleImageLoad}
              style={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                objectFit: 'contain',
                borderRadius: 4,
                boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
                display: 'block',
                pointerEvents: 'none'
              }}
            />

            {/* 标注绘制 Canvas */}
            {naturalSize.width > 0 && (
              <canvas
                ref={canvasRef}
                width={naturalSize.width}
                height={naturalSize.height}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none'
                }}
              />
            )}
          </div>
        </div>

        {/* ── 🔤 零延迟直接弹窗原生文字输入器 (绝不丢失焦点与点击) ── */}
        {floatingText && (
          <div
            style={{
              position: 'fixed',
              left: floatingText.clientX,
              top: floatingText.clientY,
              zIndex: 9999,
              background: 'rgba(15, 23, 42, 0.95)',
              backdropFilter: 'blur(20px)',
              border: '1.5px solid #38bdf8',
              borderRadius: 8,
              padding: '8px 10px',
              boxShadow: '0 12px 36px rgba(0,0,0,0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              minWidth: 220,
              maxWidth: 360,
              animation: 'fadeIn 0.12s ease'
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#38bdf8', fontWeight: 600 }}>🔤 {t('imageViewer.text')}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 10.5, padding: '1px 6px', color: 'rgba(255,255,255,0.6)' }}
                  onClick={() => setFloatingText(null)}
                >
                  ✕ {t('actions.cancel')}
                </button>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 10.5, padding: '1px 8px', borderRadius: 10, background: '#10b981', borderColor: '#10b981' }}
                  onClick={commitFloatingText}
                >
                  ✓ {t('imageViewer.done')} (Enter)
                </button>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              value={floatingText.text}
              placeholder={t('imageViewer.textInput')}
              rows={Math.max(2, (floatingText.text || '').split('\n').length)}
              onChange={(e) => setFloatingText({ ...floatingText, text: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  commitFloatingText()
                } else if (e.key === 'Escape') {
                  setFloatingText(null)
                }
              }}
              style={{
                width: '100%',
                color: floatingText.color,
                fontSize: `${Math.min(26, Math.max(15, floatingText.fontSize))}px`,
                fontWeight: 'bold',
                lineHeight: 1.35,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 4,
                padding: '6px 8px',
                outline: 'none',
                resize: 'none',
                display: 'block'
              }}
            />
          </div>
        )}

        {/* ── ✨ AI 智能助手侧边抽屉 ── */}
        {showAIPanel && (
          <div
            style={{
              width: 360,
              height: '100%',
              background: 'rgba(18, 20, 32, 0.95)',
              backdropFilter: 'blur(24px)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 150,
              boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
              animation: 'slideLeft 0.2s ease-out'
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 13, color: '#fff' }}>
                <span>✨</span>
                <span>{t('imageViewer.aiAssistant')}</span>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '2px 6px', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}
                onClick={() => setShowAIPanel(false)}
              >
                ✕
              </button>
            </div>

            {/* 快速 AI 指令胶囊 */}
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12 }}
                onClick={() => handleAskAI('Extract all text (OCR) accurately from this image:')}
              >
                {t('imageViewer.extractText')}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12 }}
                onClick={() => handleAskAI('Summarize the key information of this image concisely:')}
              >
                {t('imageViewer.summarizeImage')}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12 }}
                onClick={() => handleAskAI('Translate the text inside this image:')}
              >
                {t('imageViewer.translateImage')}
              </button>
              <button
                className="btn btn-secondary"
                style={{ fontSize: 11, padding: '4px 8px', borderRadius: 12 }}
                onClick={() => handleAskAI('Solve the problem/question presented in this image step-by-step:')}
              >
                {t('imageViewer.solveProblem')}
              </button>
            </div>

            {/* 问答对话流 */}
            <div
              ref={aiListRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12
              }}
            >
              {aiHistory.length === 0 ? (
                <div style={{ margin: 'auto', textAlign: 'center', opacity: 0.6, fontSize: 12 }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>💡</div>
                  <div>{t('aiPanel.emptyHistory')}</div>
                  <div>{t('aiPanel.emptyHistoryDesc')}</div>
                </div>
              ) : (
                aiHistory.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div
                      style={{
                        alignSelf: 'flex-end',
                        background: 'var(--accent)',
                        color: '#fff',
                        padding: '6px 10px',
                        borderRadius: '12px 12px 2px 12px',
                        fontSize: 12,
                        maxWidth: '85%'
                      }}
                    >
                      {item.question}
                    </div>

                    <div
                      style={{
                        alignSelf: 'flex-start',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: 'rgba(255, 255, 255, 0.92)',
                        padding: '8px 10px',
                        borderRadius: '12px 12px 12px 2px',
                        fontSize: 12,
                        lineHeight: 1.5,
                        maxWidth: '95%',
                        position: 'relative'
                      }}
                    >
                      {item.answer ? (
                        <>
                          <div style={{ whiteSpace: 'pre-wrap' }}>{item.answer}</div>
                          <button
                            className="btn btn-ghost"
                            style={{
                              marginTop: 6,
                              padding: '2px 6px',
                              fontSize: 10,
                              color: copiedIndex === idx ? 'var(--success)' : 'rgba(255,255,255,0.6)'
                            }}
                            onClick={() => copyText(item.answer, idx)}
                          >
                            {copiedIndex === idx ? `✓ ${t('actions.copied')}` : `📋 ${t('actions.copy')}`}
                          </button>
                        </>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div className="spinner" style={{ width: 14, height: 14 }} />
                          <span>{t('aiPanel.generating')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 输入栏 */}
            <div style={{ padding: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1, fontSize: 12, padding: '6px 10px', borderRadius: 16 }}
                  placeholder={t('aiPanel.inputPlaceholder')}
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
                  disabled={aiLoading}
                />
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 12px', fontSize: 12, borderRadius: 16 }}
                  onClick={() => handleAskAI()}
                  disabled={aiLoading || !aiInput.trim()}
                >
                  {t('aiPanel.sendBtn')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Toast 浮动提示 ── */}
      {toast && (
        <div
          style={{
            position: 'absolute',
            bottom: isAnnotating ? 80 : 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(10px)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 1000,
            animation: 'fadeIn 0.2s ease'
          }}
        >
          <span>{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}

      <style>{`
        .tool-icon-btn {
          background: transparent;
          border: none;
          outline: none;
          cursor: pointer;
          font-size: 12.5px;
          padding: 5px 10px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 4px;
          justify-content: center;
          color: rgba(255, 255, 255, 0.85);
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .tool-icon-btn:hover {
          background: rgba(255, 255, 255, 0.12);
        }
        .tool-icon-btn.active {
          background: rgba(99, 102, 241, 0.35);
          border: 1px solid var(--accent);
          color: #fff;
          font-weight: 600;
        }
        .segmented-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.7);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }
        .segmented-btn:hover {
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
        }
        .segmented-btn.active {
          background: rgba(56, 189, 248, 0.3);
          border: 1px solid #38bdf8;
          color: #fff;
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
