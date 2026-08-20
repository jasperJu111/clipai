
function formatMiniTime(sec) {
  if (!sec || sec <= 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ClipboardList from './components/ClipboardList'
import AIPanel from './components/AIPanel'
import PromptManager from './components/PromptManager'
import Settings from './components/Settings'
import HealthTimerModal from './components/HealthTimerModal'
import HealthAlertModal from './components/HealthAlertModal'
import { playChimeSound } from './utils/sound'
import { createTranslator } from './locales'
import { normalizeTimerState, processTimerTick, snoozeTimer, restartLoopTimer } from '../shared/timerUtils.js'

// 安全调用 clipai API
const api = {
  call: (fn, fallback) => {
    try {
      if (window.clipai && typeof window.clipai[fn] === 'function') {
        return window.clipai[fn]
      }
      return fallback || (() => {})
    } catch {
      return fallback || (() => {})
    }
  }
}

export default function App() {
  const [history, setHistory] = useState([])
  const [settings, setSettings] = useState({})
  const [prompts, setPrompts] = useState([])
  const [activeTab, setActiveTab] = useState('history')
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'text' | 'image' | 'favorite'
  const [toast, setToast] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [previewImage, setPreviewImage] = useState(null)
  const [activePromptPreset, setActivePromptPreset] = useState(null)

  // 缩放与紧凑模式
  const [zoomFactor, setZoomFactor] = useState(1.0)
  const [zoomBadge, setZoomBadge] = useState('')
  const [isCompact, setIsCompact] = useState(false)

  // 国际化语言翻译函数
  const t = useMemo(() => createTranslator(settings.language), [settings.language])

  // 健康作息定时器
  const [showHealthTimer, setShowHealthTimer] = useState(false)
  const [timerAlert, setTimerAlert] = useState(null)
  const triggeredCycleIdsRef = useRef(new Set())

  const [timerState, setTimerState] = useState(() => {
    try {
      const saved = localStorage.getItem('clipai_active_timer')
      if (saved) return normalizeTimerState(JSON.parse(saved))
    } catch {}
    return null
  })

  // 同步 timerState 到持久化存储
  useEffect(() => {
    try {
      if (timerState) {
        localStorage.setItem('clipai_active_timer', JSON.stringify(timerState))
      } else {
        localStorage.removeItem('clipai_active_timer')
      }
    } catch {}
  }, [timerState])

  // ── 健康定时器倒计时心跳（绝对时间校准 + 休眠防偏差 + 周期去重）──────
  useEffect(() => {
    if (!timerState || !timerState.isRunning) return

    const checkTimerTick = () => {
      setTimerState((prev) => {
        if (!prev || !prev.isRunning) return prev
        const now = Date.now()
        const { triggered, cycleIdToRecord, nextState } = processTimerTick(prev, triggeredCycleIdsRef.current, now)

        if (cycleIdToRecord) {
          triggeredCycleIdsRef.current.add(cycleIdToRecord)
        }

        if (triggered) {
          if (prev.soundEnabled !== false) {
            playChimeSound()
          }
          if (prev.systemNotifEnabled !== false && window.clipai?.showNotification) {
            window.clipai.showNotification({
              title: 'ClipAI 健康提醒',
              body: prev.alertMessage || '时间到啦！'
            })
          }

          // 记录今日健康统计
          try {
            const raw = localStorage.getItem('clipai_health_stats')
            const s = raw ? JSON.parse(raw) : { pomodoroCount: 0, waterCount: 0, moveCount: 0 }
            if (prev.presetId === 'water') s.waterCount = (s.waterCount || 0) + 1
            else if (prev.presetId === 'move') s.moveCount = (s.moveCount || 0) + 1
            else if (prev.presetId === 'pomodoro') s.pomodoroCount = (s.pomodoroCount || 0) + 1
            localStorage.setItem('clipai_health_stats', JSON.stringify(s))
          } catch {}

          const emojiMap = { water: '💧', move: '🚶', pomodoro: '🍅', meal: '🍱', eye: '👀', custom: '⏰' }
          setTimerAlert({
            title: prev.title,
            message: prev.alertMessage,
            isLoop: prev.isLoop,
            presetId: prev.presetId,
            emoji: emojiMap[prev.presetId] || '⏰',
            totalSeconds: prev.totalSeconds
          })
        }

        return nextState
      })
    }

    const interval = setInterval(checkTimerTick, 1000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTimerTick()
      }
    }
    window.addEventListener('focus', checkTimerTick)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', checkTimerTick)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [timerState?.isRunning])




  // ── 缩放控制函数 ───────────────────────────────────────────────
  const applyZoom = useCallback((factor, showBadge = true) => {
    const clamped = Math.min(Math.max(factor, 0.7), 1.8)
    const rounded = Math.round(clamped * 100) / 100
    setZoomFactor(rounded)
    if (window.clipai?.setZoomFactor) {
      window.clipai.setZoomFactor(rounded)
    }
    if (showBadge) {
      setZoomBadge(`${Math.round(rounded * 100)}%`)
    }
    // 保存到设置
    window.clipai?.setSettings({ zoomLevel: Math.round(rounded * 100) })
  }, [])

  // ── 初始化 ──────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [h, s, p] = await Promise.all([
        window.clipai.getHistory(),
        window.clipai.getSettings(),
        window.clipai.getPrompts()
      ])
      setHistory(h || [])
      setSettings(s || {})
      setPrompts(p || [])

      if (s?.zoomLevel) {
        const factor = s.zoomLevel / 100
        setZoomFactor(factor)
        window.clipai?.setZoomFactor(factor)
      }
      if (s?.compactMode) {
        setIsCompact(true)
      }
    }
    init()

    // 监听剪贴板更新
    const unsub = window.clipai.onHistoryUpdated((newHistory) => {
      setHistory(newHistory)
    })

    return () => unsub?.()
  }, [])

  // ── 全局键盘快捷键 (⌘+ / ⌘- / ⌘0) & 触控板捏合缩放 ───────────
  useEffect(() => {
    let badgeTimer = null
    const handleKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          setZoomFactor(prev => {
            const next = Math.min(prev + 0.1, 1.8)
            applyZoom(next)
            return next
          })
        } else if (e.key === '-') {
          e.preventDefault()
          setZoomFactor(prev => {
            const next = Math.max(prev - 0.1, 0.7)
            applyZoom(next)
            return next
          })
        } else if (e.key === '0') {
          e.preventDefault()
          applyZoom(1.0)
        }
      }
    }

    // 触控板捏合手势监听 (wheel event with ctrlKey)
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const delta = e.deltaY * -0.01
        setZoomFactor(prev => {
          const next = Math.min(Math.max(prev + delta, 0.7), 1.8)
          const rounded = Math.round(next * 100) / 100
          if (window.clipai?.setZoomFactor) {
            window.clipai.setZoomFactor(rounded)
          }
          setZoomBadge(`${Math.round(rounded * 100)}%`)
          return rounded
        })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [applyZoom])

  // 缩放角标自动淡出
  useEffect(() => {
    if (!zoomBadge) return
    const timer = setTimeout(() => setZoomBadge(null), 1400)
    return () => clearTimeout(timer)
  }, [zoomBadge])

  // ── 紧凑模式切换 ─────────────────────────────────────────────
  const toggleCompact = async () => {
    const next = !isCompact
    setIsCompact(next)
    await window.clipai?.setCompactMode(next)
    showToast(next ? t('header.compactMode') : t('header.normalMode'), next ? '🗗' : '🗖')
  }

  // ── Toast 提示 ───────────────────────────────────────────────
  const showToast = useCallback((msg, icon = '✅') => {
    setToast({ msg, icon })
    setTimeout(() => setToast(null), 2000)
  }, [])

  const tabs = useMemo(() => [
    { id: 'history', label: t('tabs.history'), icon: '📋' },
    { id: 'ai', label: t('tabs.ai'), icon: '✨' },
    { id: 'settings', label: t('tabs.settings'), icon: '⚙️' }
  ], [t])

  // ── 截图 ─────────────────────────────────────────────────────
  const handleScreenshot = async () => {
    const result = await window.clipai.takeScreenshot()
    if (result && !result.cancelled) {
      showToast(t('clipboard.screenshotSuccess'), '📸')
    }
  }

  useEffect(() => {
    const unsub = window.clipai?.onScreenshotSuccess?.(() => {
      showToast(t('clipboard.screenshotSuccess'), '📸')
    })
    return () => unsub?.()
  }, [showToast, t])


  // ── 清空历史 ─────────────────────────────────────────────────
  const handleClearHistory = async () => {
    if (confirm(t('clipboard.confirmClear'))) {
      try {
        const res = await window.clipai.clearHistory()
        if (res && res.success && Array.isArray(res.history)) {
          setHistory(res.history)
          showToast(t('actions.clearAll'), '🗑️')
        } else if (Array.isArray(res)) {
          setHistory(res)
          showToast(t('actions.clearAll'), '🗑️')
        } else {
          if (res && Array.isArray(res.history)) {
            setHistory(res.history)
          }
          showToast(res?.error || t('actions.clearFailed') || '清空失败', '❌')
        }
      } catch (err) {
        showToast(err.message || t('actions.clearFailed') || '清空失败', '❌')
      }
    }
  }

  // ── 过滤历史 ─────────────────────────────────────────────────
  const filteredHistory = history.filter((item) => {
    if (!search) return true
    if (item.type === 'text') {
      return item.content.toLowerCase().includes(search.toLowerCase())
    }
    return item.label?.includes(search) || item.isScreenshot
  })

  const favCount = history.filter((i) => i.favorite).length
  const density = settings.density || 'standard'
  const theme = settings.theme || 'linear'


  const appStyle = theme === 'custom' && settings.customBgImage
    ? {
        backgroundImage: `linear-gradient(rgba(8, 10, 18, ${(settings.customBgDim ?? 50) / 100}), rgba(8, 10, 18, ${(settings.customBgDim ?? 50) / 100})), url("${settings.customBgImage}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }
    : {}

  return (
    <div
      className={`app theme-${theme} density-${density} ${isCompact ? 'compact-mode' : ''}`}
      style={appStyle}
    >
      {/* ── 缩放悬浮提示 ── */}
      {zoomBadge && (
        <div className="zoom-badge">
          <span>🔍</span> {zoomBadge}
        </div>
      )}


      {/* ── 标题栏 ── */}
      <div className="title-bar" style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* macOS 原生三色红黄绿控制按钮 */}
          <div className="mac-traffic-lights" style={{ display: 'flex', gap: 7, alignItems: 'center', WebkitAppRegion: 'no-drag' }}>
            <div
              className="traffic-dot close-dot"
              onClick={() => window.clipai?.hideWindow?.()}
              title={`${t('header.close')} (Esc)`}
            />
            <div
              className="traffic-dot min-dot"
              onClick={() => window.clipai?.minimizeWindow?.()}
              title={t('header.minimize')}
            />
            <div
              className="traffic-dot max-dot"
              onClick={toggleCompact}
              title={isCompact ? t('header.normalMode') : t('header.compactMode')}
            />
          </div>

          <div className="title-bar-logo">
            <span style={{ fontSize: '18px' }}>📋</span>
            <span className="title-bar-name">ClipAI</span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 2 }}>v0.1</span>
          </div>
        </div>

        <div className="title-bar-actions">
          <button
            className={`title-bar-btn header-timer-btn ${timerState?.isRunning ? 'running' : ''}`}
            onClick={() => setShowHealthTimer(true)}
            title={t('timer.title') || '健康作息与专注定时器'}
          >
            <span>⏱️</span>
            {timerState && (
              <span style={{ fontSize: '10.5px', fontWeight: 600, letterSpacing: 0.5 }}>
                {formatMiniTime(timerState.remainingSeconds)}
              </span>
            )}
          </button>

          <button
            className="title-bar-btn"
            onClick={handleScreenshot}
            title={`${t('actions.screenshot')} (Alt+S)`}
          >
            📸
          </button>
          <button
            className="title-bar-btn"
            onClick={toggleCompact}
            title={isCompact ? t('header.normalMode') : t('header.compactMode')}
          >
            {isCompact ? '🗖' : '🗗'}
          </button>
        </div>
      </div>


      {/* ── 搜索栏（仅在历史页显示） ── */}
      {activeTab === 'history' && (
        <div className="search-wrap">
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              className="search-input"
              placeholder={t('actions.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')}>
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 标签页 ── */}
      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {tab.id === 'history' && history.length > 0 && (
              <span className="tab-badge">{history.length}</span>
            )}
          </button>
        ))}
      </div>

      <div className="divider" />

      {/* ── 内容区 ── */}
      <div className="content">
        <div style={{ display: activeTab === 'history' ? 'contents' : 'none' }}>
          <ClipboardList
            history={filteredHistory}
            search={search}
            selectedItem={selectedItem}
            onSelect={setSelectedItem}
            onPreviewImage={(item) => {
              if (window.clipai?.openImageViewer) {
                window.clipai.openImageViewer(item)
              } else {
                setPreviewImage(item)
              }
            }}
            onUseInAI={(item) => {
              setSelectedItem(item)
              setActiveTab('ai')
            }}
            onUpdate={(newHistory) => setHistory(newHistory)}
            showToast={showToast}
            t={t}
          />

        </div>
        <div style={{ display: activeTab === 'ai' ? 'contents' : 'none' }}>
          <AIPanel
            settings={settings}
            selectedItem={selectedItem}
            prompts={prompts}
            onUpdatePrompts={(p) => {
              setPrompts(p)
              window.clipai.savePrompts(p)
            }}
            activePromptPreset={activePromptPreset}
            onClearActivePromptPreset={() => setActivePromptPreset(null)}
            onNavigateTab={setActiveTab}
            showToast={showToast}
            t={t}
          />
        </div>
        <div style={{ display: activeTab === 'settings' ? 'contents' : 'none' }}>
          <Settings
            settings={settings}
            zoomFactor={zoomFactor}
            onSetZoom={applyZoom}
            isCompact={isCompact}
            onToggleCompact={toggleCompact}
            onUpdate={async (s) => {
              setSettings((prev) => ({ ...prev, ...s }))
              // 剔除任何可能混入的 API Key 字段，普通设置更新绝不携带 API Key
              const safeS = { ...s }
              delete safeS.apiKey
              if (safeS.providerConfigs) {
                const safeConfigs = {}
                for (const [p, cfg] of Object.entries(safeS.providerConfigs)) {
                  safeConfigs[p] = { ...cfg }
                  delete safeConfigs[p].apiKey
                }
                safeS.providerConfigs = safeConfigs
              }
              const res = await window.clipai?.setSettings(safeS)
              if (res?.shortcutResult && !res.shortcutResult.success) {
                const failedInfo = res.shortcutResult.failed.map((f) => `${f.type === 'screenshotShortcut' ? '截图快捷键' : '唤醒快捷键'}: ${f.key}`).join(', ')
                showToast(`快捷键设置失败 (${failedInfo}): 已自动回滚`, '⚠️')
                if (res.activeShortcuts) {
                  setSettings((prev) => ({ ...prev, ...res.activeShortcuts }))
                }
              }
            }}
            onClearHistory={handleClearHistory}
            showToast={showToast}
            t={t}
          />
        </div>
      </div>

      {/* ── 底部状态栏（仅在历史记录页展示） ── */}
      {activeTab === 'history' && (
        <div className="footer-bar">
          <div className="footer-left">
            <span className="footer-count">
              {t('header.totalItems', { count: history.length })}
              {favCount > 0 && ` · ⭐ ${favCount}`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              onClick={handleClearHistory}
              title={t('actions.clearAll')}
            >
              🗑️ {t('actions.clearAll')}
            </button>
            <button
              className="btn btn-ghost"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              onClick={handleScreenshot}
              title={t('actions.screenshot')}
            >
              📸 {t('actions.screenshot')}
            </button>
          </div>
        </div>
      )}

      {/* ── 🖼️ 高清图片 / 截图大图预览弹窗 ── */}
      {previewImage && (
        <div className="image-lightbox-backdrop" onClick={() => setPreviewImage(null)}>
          <div className="image-lightbox-container" onClick={(e) => e.stopPropagation()}>
            <div className="image-lightbox-header">
              <div className="image-lightbox-title">
                <span>{previewImage.isScreenshot ? `📸 ${t('actions.screenshot')}` : `🖼️ ${t('actions.filterImage')}`}</span>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '2px 8px', fontSize: '13px' }}
                onClick={() => setPreviewImage(null)}
                title={`${t('actions.cancel')} (ESC)`}
              >
                ✕
              </button>
            </div>

            <div className="image-lightbox-body">
              <img
                src={previewImage.content || (previewImage.filePath ? `clipai-image://${previewImage.filePath}` : previewImage.thumbnail)}
                className="image-lightbox-img"
                alt="Full preview"
              />
            </div>

            <div className="image-lightbox-footer">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                🕒 {new Date(previewImage.timestamp).toLocaleTimeString()}
              </span>
              <div className="image-lightbox-actions">
                <button
                  className="btn btn-primary"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={async () => {
                    await window.clipai.copyToClipboard(previewImage)
                    showToast(t('actions.copied'), '📋')
                  }}
                >
                  📋 {t('actions.copy')}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                  onClick={() => {
                    setSelectedItem(previewImage)
                    setActiveTab('ai')
                    setPreviewImage(null)
                    showToast('已载入 AI 助手', '✨')
                  }}
                >
                  ✨ 问 AI
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: 12, padding: '4px 8px' }}
                  onClick={() => setPreviewImage(null)}
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ⏱️ 健康作息与专注定时器弹窗 ── */}
      <HealthTimerModal
        isOpen={showHealthTimer}
        onClose={() => setShowHealthTimer(false)}
        timerState={timerState}
        setTimerState={setTimerState}
        t={t}
      />

      {/* ── 🔔 定时到达强提醒弹窗 ── */}
      <HealthAlertModal
        alertData={timerAlert}
        onAcknowledge={() => setTimerAlert(null)}
        onSnooze={() => {
          setTimerAlert(null)
          const now = Date.now()
          setTimerState((prev) => snoozeTimer(prev, 300, now))
        }}
        onRestartLoop={() => {
          setTimerAlert(null)
          const now = Date.now()
          setTimerState((prev) => restartLoopTimer(prev, now))
        }}
        t={t}
      />

      {/* ── Toast 通知 ── */}
      {toast && (
        <div className="toast">
          <span>{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

