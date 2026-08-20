import { useState, useRef, useEffect } from 'react'

export default function AimakeXPanel({ pendingText, onClearPendingText, showToast, t = (k) => k }) {
  const webviewRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [zoomFactor, setZoomFactor] = useState(() => {
    try {
      return parseFloat(localStorage.getItem('clipai_aimakex_zoom') || '0.92')
    } catch {
      return 0.92
    }
  })

  const TARGET_URL = 'https://chat.aimakex.com/'

  // 监听 webview 事件并设置最佳缩放比例
  useEffect(() => {
    const webview = webviewRef.current
    if (!webview) return

    const applyZoom = () => {
      try {
        if (webview.setZoomFactor) {
          webview.setZoomFactor(zoomFactor)
        }
      } catch {}
    }

    const injectEnhancements = () => {
      applyZoom()
      try {
        // 针对性放大智造喵顶部栏文字、模型选择器、图标尺寸
        webview.executeJavaScript(`
          (function() {
            let style = document.getElementById('clipai-aimakex-custom-style');
            if (!style) {
              style = document.createElement('style');
              style.id = 'clipai-aimakex-custom-style';
              document.head.appendChild(style);
            }
            style.innerHTML = \`
              /* 🌟 显著放大顶部标题栏、模型下拉、更多操作、图标 */
              header, .n-layout-header, [class*="header"], [class*="Header"], nav {
                min-height: 46px !important;
                padding: 6px 12px !important;
              }
              header *, .n-layout-header *, [class*="header"] * {
                font-size: 14.5px !important;
                line-height: 1.4 !important;
              }
              /* 智造喵 Logo 旁的标题文字 */
              header [class*="title"], header span, .n-layout-header span {
                font-size: 15px !important;
                font-weight: 600 !important;
              }
              /* 模型下拉框 GPT-5.6 */
              [class*="model"], [class*="Model"], [class*="dropdown"], [class*="select"], .n-base-selection, [class*="selector"] {
                font-size: 14px !important;
                font-weight: 600 !important;
                padding: 4px 10px !important;
                border-radius: 6px !important;
              }
              /* 顶部图标（月亮、铃铛等）与头像 */
              header svg, .n-layout-header svg, [class*="header"] svg {
                width: 19px !important;
                height: 19px !important;
                transform: scale(1.15) !important;
              }
              header img, .n-layout-header img {
                width: 30px !important;
                height: 30px !important;
              }
            \`;
          })()
        `).catch(() => {})
      } catch {}
    }

    const handleStartLoading = () => setLoading(true)
    const handleStopLoading = () => {
      setLoading(false)
      injectEnhancements()
      try {
        setCanGoBack(webview.canGoBack?.() || false)
        setCanGoForward(webview.canGoForward?.() || false)
      } catch {}
    }

    webview.addEventListener('did-start-loading', handleStartLoading)
    webview.addEventListener('did-stop-loading', handleStopLoading)
    webview.addEventListener('did-finish-load', handleStopLoading)
    webview.addEventListener('dom-ready', injectEnhancements)

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading)
      webview.removeEventListener('did-stop-loading', handleStopLoading)
      webview.removeEventListener('did-finish-load', handleStopLoading)
      webview.removeEventListener('dom-ready', injectEnhancements)
    }
  }, [zoomFactor])

  const changeZoom = (delta) => {
    const newZoom = +(Math.max(0.75, Math.min(1.25, zoomFactor + delta))).toFixed(2)
    setZoomFactor(newZoom)
    try {
      localStorage.setItem('clipai_aimakex_zoom', newZoom.toString())
      if (webviewRef.current?.setZoomFactor) {
        webviewRef.current.setZoomFactor(newZoom)
      }
    } catch {}
    showToast(`缩放已调整为 ${Math.round(newZoom * 100)}%`, '🔍')
  }

  const resetZoom = () => {
    setZoomFactor(0.92)
    try {
      localStorage.setItem('clipai_aimakex_zoom', '0.92')
      if (webviewRef.current?.setZoomFactor) {
        webviewRef.current.setZoomFactor(0.92)
      }
    } catch {}
    showToast('缩放已恢复为 92%', '🔍')
  }

  // 注入文字到智造喵输入框
  const injectTextToChat = (text) => {
    if (!text || !webviewRef.current) return
    const escapedText = JSON.stringify(text)
    const script = `
      (function() {
        const textToInject = ${escapedText};
        // 查找常见的聊天输入框
        const el = document.querySelector('textarea, div[contenteditable="true"], .n-input__textarea-el, input[type="text"]');
        if (el) {
          if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
            el.value = (el.value ? el.value + '\\n' : '') + textToInject;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (el.isContentEditable) {
            el.innerText = (el.innerText ? el.innerText + '\\n' : '') + textToInject;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          el.focus();
          return true;
        }
        return false;
      })();
    `
    try {
      webviewRef.current.executeJavaScript(script).then((success) => {
        if (success) {
          showToast(t('aimakex.injectedToast') || '已将内容填入智造喵输入框', '🐱')
        }
      }).catch(() => {})
    } catch {}
  }

  // 响应外部传入的待发送文字
  useEffect(() => {
    if (pendingText) {
      // 稍等 webview 准备好
      setTimeout(() => {
        injectTextToChat(pendingText)
        onClearPendingText?.()
      }, 500)
    }
  }, [pendingText, onClearPendingText])

  const handleGoBack = () => {
    try {
      if (webviewRef.current?.canGoBack?.()) {
        webviewRef.current.goBack()
      }
    } catch {}
  }

  const handleGoForward = () => {
    try {
      if (webviewRef.current?.canGoForward?.()) {
        webviewRef.current.goForward()
      }
    } catch {}
  }

  const handleReload = () => {
    try {
      webviewRef.current?.reload?.()
      showToast(t('aimakex.reloading') || '正在刷新智造喵...', '🔄')
    } catch {}
  }

  const handleGoHome = () => {
    try {
      if (webviewRef.current) {
        webviewRef.current.src = TARGET_URL
      }
    } catch {}
  }

  const handleOpenExternal = () => {
    if (window.clipai?.openExternal) {
      window.clipai.openExternal(TARGET_URL)
    } else {
      window.open(TARGET_URL, '_blank')
    }
  }

  const handlePasteClipboard = async () => {
    try {
      const history = (await window.clipai?.getHistory?.()) || []
      const latestText = history.find((i) => i.type === 'text')?.content
      if (latestText) {
        injectTextToChat(latestText)
      } else {
        showToast(t('clipboard.emptyTitle') || '剪贴板暂无可用文本', '⚠️')
      }
    } catch (e) {
      showToast('获取剪贴板失败: ' + e.message, '❌')
    }
  }

  return (
    <div className="aimakex-panel-wrapper">
      {/* ── 顶部网页导航控制微栏（分层 2 行设计，窄窗口 100% 绝不溢出遮挡） ── */}
      <div className="aimakex-toolbar-container">
        {/* 第 1 行：网页导航 ── 标题 ── 官网直达 */}
        <div className="aimakex-toolbar-row">
          <div className="aimakex-toolbar-left">
            <button
              className="btn btn-ghost aimakex-tool-btn"
              onClick={handleGoBack}
              disabled={!canGoBack}
              title={t('aimakex.goBack') || '后退'}
            >
              ‹
            </button>
            <button
              className="btn btn-ghost aimakex-tool-btn"
              onClick={handleGoForward}
              disabled={!canGoForward}
              title={t('aimakex.goForward') || '前进'}
            >
              ›
            </button>
            <button
              className="btn btn-ghost aimakex-tool-btn"
              onClick={handleReload}
              title={t('aimakex.reload') || '刷新'}
            >
              🔄
            </button>
            <button
              className="btn btn-ghost aimakex-tool-btn"
              onClick={handleGoHome}
              title={t('aimakex.home') || '回到首页'}
            >
              🏠
            </button>
          </div>

          <div className="aimakex-title-badge">
            <span>🐱</span>
            <span>{t('aiPanel.subTabAimakeX') || '智造喵'}</span>
            {loading && <span className="aimakex-loading-dot">...</span>}
          </div>

          <button
            className="btn btn-ghost aimakex-action-btn"
            style={{ color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px' }}
            onClick={handleOpenExternal}
            title="在系统默认浏览器中直达打开 智造喵 官方网站 (https://chat.aimakex.com)"
          >
            <span>🌐 官网 ↗</span>
          </button>
        </div>

        {/* 第 2 行：缩放调节 ── 填入剪贴板 */}
        <div className="aimakex-toolbar-row">
          <div className="aimakex-zoom-capsule">
            <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 4 }}>🔍 缩放</span>
            <button
              className="aimakex-zoom-step-btn"
              onClick={() => changeZoom(-0.05)}
              title="缩小网页与字号 (-5%)"
            >
              -
            </button>
            <span
              className="aimakex-zoom-label"
              onClick={resetZoom}
              title="点击恢复默认 92%"
            >
              {Math.round(zoomFactor * 100)}%
            </span>
            <button
              className="aimakex-zoom-step-btn"
              onClick={() => changeZoom(0.05)}
              title="放大网页与字号 (+5%)"
            >
              +
            </button>
          </div>

          <button
            className="btn btn-secondary aimakex-action-btn"
            style={{ flex: 1, maxWidth: 170, justifyContent: 'center' }}
            onClick={handlePasteClipboard}
            title={t('aimakex.pasteClipboardTip') || '将剪贴板最新内容自动填入智造喵'}
          >
            📋 填入剪贴板
          </button>
        </div>
      </div>

      {/* ── Webview 容器（隔离持久化分区存储） ── */}
      <div className="aimakex-webview-container">
        {loading && (
          <div className="aimakex-loading-overlay">
            <div className="empty-icon" style={{ animation: 'pulse 1.5s infinite' }}>🐱</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {t('aimakex.loadingText') || '正在安全加载 智造喵 (chat.aimakex.com)...'}
            </div>
          </div>
        )}
        <webview
          ref={webviewRef}
          src={TARGET_URL}
          partition="persist:aimakex"
          autosize="true"
          className="aimakex-webview"
        />
      </div>
    </div>
  )
}
