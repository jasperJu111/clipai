import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createTranslator } from '../locales'

export default function ScreenSnipper() {
  const [lang, setLang] = useState('auto')
  const t = useMemo(() => createTranslator(lang), [lang])

  useEffect(() => {
    window.clipai?.getSettings?.().then((st) => {
      if (st?.language) setLang(st.language)
    }).catch(() => {})

    const unsub = window.clipai?.onSettingsChanged?.((st) => {
      if (st?.language) setLang(st.language)
    })
    return () => unsub?.()
  }, [])

  const canvasRef = useRef(null)
  const bgImageRef = useRef(null)
  const [snapshotData, setSnapshotData] = useState(null)
  const [selection, setSelection] = useState(null) // { x, y, w, h }
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const selectionRef = useRef(null)

  // 更新当前选区并驱动重绘
  const updateSelection = useCallback((sel) => {
    selectionRef.current = sel
    setSelection(sel)
    draw()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const img = bgImageRef.current
    if (!ctx || !img) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // 1. 绘制背景截屏
    ctx.drawImage(img, 0, 0, width, height)

    // 2. 绘制半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)'
    ctx.fillRect(0, 0, width, height)

    const sel = selectionRef.current
    if (sel && sel.w > 0 && sel.h > 0) {
      // 3. 挖空高亮选区，显示清晰背景
      ctx.save()
      ctx.beginPath()
      ctx.rect(sel.x, sel.y, sel.w, sel.h)
      ctx.clip()
      ctx.drawImage(img, 0, 0, width, height)
      ctx.restore()

      // 4. 绘制选区亮色边框 (Mac / WeChat 风格蓝色边框)
      ctx.strokeStyle = '#007aff'
      ctx.lineWidth = 2
      ctx.strokeRect(sel.x, sel.y, sel.w, sel.h)

      // 5. 绘制 8 个角控制点小方块
      const points = [
        { x: sel.x, y: sel.y },
        { x: sel.x + sel.w / 2, y: sel.y },
        { x: sel.x + sel.w, y: sel.y },
        { x: sel.x + sel.w, y: sel.y + sel.h / 2 },
        { x: sel.x + sel.w, y: sel.y + sel.h },
        { x: sel.x + sel.w / 2, y: sel.y + sel.h },
        { x: sel.x, y: sel.y + sel.h },
        { x: sel.x, y: sel.y + sel.h / 2 }
      ]
      ctx.fillStyle = '#007aff'
      for (const p of points) {
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6)
      }
    }
  }, [])

  // 加载图像数据
  const loadSnapshot = useCallback((data) => {
    if (!data) return
    setSnapshotData(data)
    selectionRef.current = null
    setSelection(null)

    let src = ''
    if (data.image) {
      src = data.image
    } else if (data.buffer) {
      const blob = new Blob([data.buffer], { type: 'image/png' })
      src = URL.createObjectURL(blob)
    }

    if (!src) return

    const img = new Image()
    img.onload = () => {
      bgImageRef.current = img
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        draw()
      }
      if (window.clipai?.sendSnipperReady) {
        window.clipai.sendSnipperReady({ transactionId: data.transactionId })
      }
    }
    img.src = src
  }, [draw])

  useEffect(() => {
    // 监听主进程下发的截图数据
    if (window.clipai?.onSnipperRefresh) {
      const unbind = window.clipai.onSnipperRefresh((data) => {
        loadSnapshot(data)
      })
      const unbindBuf = window.clipai.onSnipperRefreshBuffer ? window.clipai.onSnipperRefreshBuffer((data) => {
        loadSnapshot(data)
      }) : () => {}

      window.clipai.getSnipperData?.().then((data) => {
        if (data) loadSnapshot(data)
      })

      return () => {
        unbind()
        unbindBuf()
      }
    }
  }, [loadSnapshot])

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        draw()
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [draw])

  // 完成截图提交
  const handleFinish = useCallback(async (openEditor = false) => {
    const sel = selectionRef.current
    const img = bgImageRef.current
    if (!img) return

    let cropX = 0
    let cropY = 0
    let cropW = img.width
    let cropH = img.height

    if (sel && sel.w > 5 && sel.h > 5) {
      const scaleX = img.width / window.innerWidth
      const scaleY = img.height / window.innerHeight
      cropX = Math.round(sel.x * scaleX)
      cropY = Math.round(sel.y * scaleY)
      cropW = Math.round(sel.w * scaleX)
      cropH = Math.round(sel.h * scaleY)
    }

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cropW
    cropCanvas.height = cropH
    const ctx = cropCanvas.getContext('2d')
    ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    const dataUrl = cropCanvas.toDataURL('image/png')
    if (window.clipai?.finishSnipper) {
      await window.clipai.finishSnipper({ dataUrl, openEditor })
    }
  }, [])

  // 取消截图
  const handleCancel = useCallback(() => {
    if (window.clipai?.closeSnipper) {
      window.clipai.closeSnipper()
    }
  }, [])

  // 快捷键监听
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleFinish(false)
      } else if (e.code === 'Space' && !selectionRef.current) {
        e.preventDefault()
        // 空格全屏选区
        updateSelection({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleCancel, handleFinish, updateSelection])

  // 鼠标交互
  const handleMouseDown = (e) => {
    if (e.button === 2) {
      // 右键取消
      handleCancel()
      return
    }
    if (e.button !== 0) return

    isDraggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    selectionRef.current = null
    setSelection(null)
  }

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) return
    const startX = dragStartRef.current.x
    const startY = dragStartRef.current.y
    const currentX = e.clientX
    const currentY = e.clientY

    const x = Math.min(startX, currentX)
    const y = Math.min(startY, currentY)
    const w = Math.abs(currentX - startX)
    const h = Math.abs(currentY - startY)

    selectionRef.current = { x, y, w, h }
    draw()
  }

  const handleMouseUp = () => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    const sel = selectionRef.current
    if (sel && (sel.w < 5 || sel.h < 5)) {
      selectionRef.current = null
      setSelection(null)
      draw()
    } else {
      setSelection(sel ? { ...sel } : null)
    }
  }

  const handleDoubleClick = () => {
    if (selectionRef.current && selectionRef.current.w > 5 && selectionRef.current.h > 5) {
      handleFinish(false)
    }
  }

  // 工具栏位置计算
  let toolbarStyle = null
  let badgeStyle = null
  if (selection && selection.w > 10 && selection.h > 10) {
    const margin = 8
    const toolbarHeight = 36
    const toolbarWidth = 240
    let top = selection.y + selection.h + margin
    if (top + toolbarHeight > window.innerHeight - 10) {
      top = Math.max(10, selection.y - toolbarHeight - margin)
    }
    let left = Math.max(10, selection.x + selection.w - toolbarWidth)
    if (left + toolbarWidth > window.innerWidth - 10) {
      left = window.innerWidth - toolbarWidth - 10
    }
    toolbarStyle = { top: `${top}px`, left: `${left}px` }

    let badgeTop = selection.y - 28
    if (badgeTop < 10) badgeTop = selection.y + 8
    badgeStyle = { top: `${badgeTop}px`, left: `${selection.x}px` }
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        overflow: 'hidden',
        userSelect: 'none',
        cursor: 'crosshair',
        background: 'transparent'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => { e.preventDefault(); handleCancel() }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* 尺寸徽标 */}
      {selection && badgeStyle && (
        <div
          style={{
            position: 'absolute',
            ...badgeStyle,
            background: 'rgba(0, 0, 0, 0.75)',
            color: '#ffffff',
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            pointerEvents: 'none',
            zIndex: 100
          }}
        >
          {Math.round(selection.w)} × {Math.round(selection.h)}
        </div>
      )}

      {/* 浮动操作条 */}
      {selection && toolbarStyle && !isDraggingRef.current && (
        <div
          style={{
            position: 'absolute',
            ...toolbarStyle,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.1)',
            padding: '4px 8px',
            borderRadius: '8px',
            zIndex: 100
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleCancel}
            title={t('snipper.cancelTip') || '取消截图 (Esc)'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              border: 'none',
              borderRadius: '6px',
              background: '#f1f3f5',
              color: '#495057',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            ✕
          </button>
          <button
            onClick={() => handleFinish(true)}
            title={t('snipper.editAndAnnotateTip') || '标注与编辑 (进入编辑查看器)'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0 10px',
              height: '28px',
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              background: '#ffffff',
              color: '#343a40',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500
            }}
          >
            {t('snipper.editAndAnnotate') || '✏️ 标注编辑'}
          </button>
          <button
            onClick={() => handleFinish(false)}
            title={t('snipper.copyTip') || '完成并直接复制 (Enter)'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '0 12px',
              height: '28px',
              border: 'none',
              borderRadius: '6px',
              background: '#007aff',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 500
            }}
          >
            {t('snipper.copy') || '✓ 复制'}
          </button>
        </div>
      )}
    </div>
  )
}
