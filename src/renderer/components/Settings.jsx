import { useState, useEffect } from 'react'
import { LANGUAGES } from '../locales'
import { AI_PROVIDERS, AI_GROUPS } from '../constants/aiProviders'
import { parseShortcutFromEvent, resolveStoredShortcut } from '../../shared/shortcutUtils.js'

function Toggle({ checked, onChange }) {
  return (
    <div
      className={`toggle ${checked ? 'active' : ''}`}
      onClick={() => onChange(!checked)}
    />
  )
}

const AVAILABLE_KEYS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  'Space', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  'Enter', 'Tab', 'Escape'
]

function ShortcutSelector({ value = '', onChange, presets = [], t = (k) => k }) {
  const [recording, setRecording] = useState(false)

  // 友好展示快捷键
  const formatDisplay = (val) => {
    if (!val) return ''
    return val
      .replace(/Command/g, '⌘ Cmd')
      .replace(/Alt/g, '⌥ Option')
      .replace(/Ctrl/g, '⌃ Ctrl')
      .replace(/Shift/g, '⇧ Shift')
      .replace(/\+/g, ' + ')
  }

  // 解析当前快捷键
  const parts = value ? value.split('+') : []
  const hasAlt = parts.includes('Alt')
  const hasCmd = parts.includes('Command')
  const hasShift = parts.includes('Shift')
  const hasCtrl = parts.includes('Ctrl')
  const currentKey = parts.find((p) => !['Alt', 'Command', 'Shift', 'Ctrl'].includes(p)) || ''

  const toggleModifier = (mod) => {
    const currentMods = []
    if (mod === 'Alt' ? !hasAlt : hasAlt) currentMods.push('Alt')
    if (mod === 'Command' ? !hasCmd : hasCmd) currentMods.push('Command')
    if (mod === 'Shift' ? !hasShift : hasShift) currentMods.push('Shift')
    if (mod === 'Ctrl' ? !hasCtrl : hasCtrl) currentMods.push('Ctrl')

    const keyPart = currentKey || 'A'
    const combo = currentMods.length > 0 ? [...currentMods, keyPart].join('+') : keyPart
    onChange(combo)
  }

  const setKey = (newKey) => {
    const currentMods = []
    if (hasAlt) currentMods.push('Alt')
    if (hasCmd) currentMods.push('Command')
    if (hasShift) currentMods.push('Shift')
    if (hasCtrl) currentMods.push('Ctrl')
    const combo = currentMods.length > 0 ? [...currentMods, newKey].join('+') : newKey
    onChange(combo)
  }

  // 自动识别键盘按键
  const handleKeyDown = (e) => {
    e.preventDefault()
    e.stopPropagation()

    // 按退格键 / Delete 删空
    if (e.key === 'Backspace' || e.key === 'Delete') {
      onChange('')
      setRecording(false)
      return
    }

    if (e.key === 'Escape') {
      setRecording(false)
      return
    }

    const combo = parseShortcutFromEvent(e)
    if (combo) {
      onChange(combo)
      setRecording(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* 自动识别按键录制框 */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          className="settings-input"
          style={{
            flex: 1,
            cursor: 'pointer',
            borderColor: recording ? 'var(--accent)' : undefined,
            boxShadow: recording ? '0 0 0 3px var(--accent-dim)' : undefined,
            fontWeight: '600',
            fontSize: '13px',
            color: recording ? 'var(--accent)' : (value ? 'var(--text-primary)' : 'var(--text-muted)'),
            letterSpacing: '0.5px'
          }}
          placeholder={t('settings.shortcutDisabled') || '（已禁用）'}
          value={recording ? '⌨️ ...' : (value ? formatDisplay(value) : (t('settings.shortcutDisabled') || '（已禁用）'))}
          onFocus={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={handleKeyDown}
          readOnly
        />
        {value ? (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '11.5px', padding: '4px 10px', whiteSpace: 'nowrap' }}
            onClick={() => {
              onChange('')
              setRecording(false)
            }}
          >
            🗑️ {t('actions.delete') || 'Clear'}
          </button>
        ) : null}
      </div>

      {/* 自由点选修饰键 + 字母键 */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 5 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 2 }}>{t('settings.shortcutLabel')}:</span>
        
        {/* 修饰键按钮 */}
        <button
          type="button"
          className={`btn ${hasAlt ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '11px', padding: '3px 8px', height: 26 }}
          onClick={() => toggleModifier('Alt')}
        >
          ⌥ Option
        </button>
        <button
          type="button"
          className={`btn ${hasCmd ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '11px', padding: '3px 8px', height: 26 }}
          onClick={() => toggleModifier('Command')}
        >
          ⌘ Cmd
        </button>
        <button
          type="button"
          className={`btn ${hasShift ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '11px', padding: '3px 8px', height: 26 }}
          onClick={() => toggleModifier('Shift')}
        >
          ⇧ Shift
        </button>
        <button
          type="button"
          className={`btn ${hasCtrl ? 'btn-primary' : 'btn-secondary'}`}
          style={{ fontSize: '11px', padding: '3px 8px', height: 26 }}
          onClick={() => toggleModifier('Ctrl')}
        >
          ⌃ Ctrl
        </button>

        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>+</span>

        {/* 字母/主键下拉选择 */}
        <select
          className="settings-select"
          style={{ width: 'auto', minWidth: 70, height: 26, padding: '2px 8px', fontSize: 11.5, fontWeight: '600' }}
          value={currentKey || 'A'}
          onChange={(e) => setKey(e.target.value)}
        >
          {AVAILABLE_KEYS.map((k) => (
            <option key={k} value={k}>
              {k === 'Space' ? 'Space' : k}
            </option>
          ))}
        </select>
      </div>

      {/* 常用预设快捷键 */}
      {presets && presets.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>常用推荐：</span>
          {presets.map((p, idx) => (
            <button
              key={`${p.label}_${idx}`}
              type="button"
              className="btn btn-ghost"
              style={{
                fontSize: '10.5px',
                padding: '2px 6px',
                height: 22,
                background: value === p.val ? 'var(--accent-dim)' : 'rgba(255,255,255,0.04)',
                borderColor: value === p.val ? 'var(--accent)' : 'transparent',
                color: value === p.val ? 'var(--accent)' : 'var(--text-secondary)'
              }}
              onClick={() => onChange(p.val)}
            >
              {p.label}
            </button>
          ))}

        </div>
      )}
    </div>
  )
}




const DEFAULT_POPULAR_MODELS = [
  { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash (速度快 · 推荐)' },
  { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro (深度推理 · 强力)' },
  { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash (极速响应)' },
  { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
  { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' }
]


const THEMES = [
  // 📱 iOS 悬浮灵动系列
  {
    id: 'ios',
    name: 'iOS 灵动晶透',
    category: 'dark',
    icon: '📱',
    desc: 'iOS 灵动岛 · 悬浮亚克力晶透贴片',
    bg: 'rgba(16,17,24,0.65)',
    accent: '#0a84ff'
  },
  // 旗舰暗色系
  {
    id: 'linear',
    name: 'Linear 钛金深空',
    category: 'dark',
    icon: '💎',
    desc: '星芒紫辉 · 极客 Obsidian',
    bg: '#090a0f',
    accent: '#6366f1'
  },

  {
    id: 'raycast',
    name: 'Raycast 极客红芒',
    category: 'dark',
    icon: '⚡',
    desc: '深邃暗夜 · 活力微光赤红',
    bg: '#0c0a09',
    accent: '#ff4757'
  },
  {
    id: 'arc',
    name: 'Arc 极光琉璃',
    category: 'dark',
    icon: '🌈',
    desc: '多彩流体 · 霓虹幻彩晕染',
    bg: '#0a0c16',
    accent: '#06b6d4'
  },
  {
    id: 'sequoia',
    name: 'Sequoia 晶透冰川',
    category: 'dark',
    icon: '🧊',
    desc: 'macOS 冰蓝 · 澄澈通透质感',
    bg: '#080f17',
    accent: '#38bdf8'
  },
  {
    id: 'aurora',
    name: '极光翡翠',
    category: 'dark',
    icon: '🌲',
    desc: '墨绿深林 · 极光翠绿护眼',
    bg: '#06110c',
    accent: '#10b981'
  },
  {
    id: 'sunset',
    name: '日落琥珀金',
    category: 'dark',
    icon: '🌅',
    desc: '温暖夕阳 · 复古琥珀流金',
    bg: '#140d08',
    accent: '#f97316'
  },
  {
    id: 'matrix',
    name: '黑客矩阵',
    category: 'dark',
    icon: '👾',
    desc: '极客纯黑 · 荧光绿码终端',
    bg: '#030803',
    accent: '#22c55e'
  },
  // 旗舰浅色与柔和系
  {
    id: 'light',
    name: 'Apple 极简白昼',
    category: 'light',
    icon: '🏙️',
    desc: 'Apple 陶瓷白 · 清爽纯粹',
    bg: '#f1f3f7',
    accent: '#0071e3'
  },
  {
    id: 'latte',
    name: '暖阳奶咖',
    category: 'light',
    icon: '☕',
    desc: '温润奶白 · 柔和丝绸护眼',
    bg: '#f6f2eb',
    accent: '#c26d2e'
  },
  {
    id: 'mist',
    name: '雾霾冷黛',
    category: 'light',
    icon: '🌫️',
    desc: '山峦冷黛 · 现代极简灰蓝',
    bg: '#eef2f6',
    accent: '#4f46e5'
  },
  // 12. 🖼️ 自定义图片壁纸
  {
    id: 'custom',
    name: '自定义图片壁纸',
    category: 'custom',
    icon: '🖼️',
    desc: '点击上传本地高清壁纸 / 照片',
    bg: '#181a26',
    accent: '#818cf8'
  }
]



export default function Settings({
  settings,
  zoomFactor = 1.0,
  onSetZoom,
  isCompact = false,
  onToggleCompact,
  onUpdate,
  onClearHistory,
  showToast,
  t
}) {
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [detectedModels, setDetectedModels] = useState(settings.cachedModels || [])
  const [detecting, setDetecting] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [showCustomModelInput, setShowCustomModelInput] = useState(false)
  const [themeFilter, setThemeFilter] = useState('all') // 'all' | 'dark' | 'light'
  const [apiKeyDrafts, setApiKeyDrafts] = useState({})

  // 同步 settings.cachedModels 到 detectedModels
  useEffect(() => {
    if (settings.cachedModels && settings.cachedModels.length > 0) {
      setDetectedModels(settings.cachedModels)
    } else if (settings.apiKey && (!detectedModels || detectedModels.length === 0)) {
      // 若已有 API Key 且无缓存，静默拉取可用模型
      window.clipai.listGeminiModels(settings.apiKey).then((res) => {
        if (res.success && res.models?.length > 0) {
          setDetectedModels(res.models)
          onUpdate({ cachedModels: res.models })
        }
      }).catch(() => {})
    }
  }, [settings.apiKey, settings.cachedModels])

  const handleChange = (key, value) => {
    onUpdate({ [key]: value })
  }

  const handleSave = async () => {
    try {
      const activeProviderId = settings.provider || 'gemini'
      const providerConfigs = settings.providerConfigs || {}
      const currentConfig = providerConfigs[activeProviderId] || {}
      const savedApiKey = currentConfig.apiKey !== undefined ? currentConfig.apiKey : (activeProviderId === 'gemini' ? (settings.apiKey || '') : '')
      const draftKey = apiKeyDrafts[activeProviderId]

      if (draftKey !== undefined && typeof draftKey === 'string') {
        const trimmed = draftKey.trim()
        if (!trimmed.includes('••••') && trimmed !== savedApiKey) {
          const keyRes = await window.clipai?.saveApiKey?.(activeProviderId, trimmed)
          if (!keyRes || !keyRes.success || !keyRes.secure) {
            showToast(keyRes?.error || 'API Key 安全加密保存失败 (硬件加密不可用)', '❌')
            return
          }
        }
      }

      // 剔除任何 apiKey 字段以防明文写入 store
      const cleanSettings = { ...settings }
      delete cleanSettings.apiKey
      if (cleanSettings.providerConfigs) {
        const cleanConfigs = {}
        for (const [p, cfg] of Object.entries(cleanSettings.providerConfigs)) {
          cleanConfigs[p] = { ...cfg }
          delete cleanConfigs[p].apiKey
        }
        cleanSettings.providerConfigs = cleanConfigs
      }

      const res = await window.clipai?.setSettings?.(cleanSettings)
      if (res && res.success) {
        setSaved(true)
        showToast(t('settings.title') || '设置已保存', '✅')
        setTimeout(() => setSaved(false), 2000)
        const fresh = await window.clipai?.getSettings?.()
        if (fresh) {
          onUpdate(fresh)
          setApiKeyDrafts({})
        }
      } else {
        showToast(res?.error || '保存设置失败', '❌')
        const fresh = await window.clipai?.getSettings?.()
        if (fresh) onUpdate(fresh)
      }
    } catch (e) {
      showToast(e.message || '保存设置异常', '❌')
    }
  }

  const handleDetectModels = async () => {
    if (!settings.apiKey) {
      showToast(t('aiPanel.noApiKeyWarning'), '⚠️')
      return
    }
    setDetecting(true)
    try {
      const result = await window.clipai.listGeminiModels(settings.apiKey)
      if (result.success && result.models.length > 0) {
        setDetectedModels(result.models)
        const currentExists = result.models.some((m) => m.name === settings.geminiModel)
        const newModel = (currentExists && settings.geminiModel) ? settings.geminiModel : result.models[0].name
        onUpdate({ geminiModel: newModel, cachedModels: result.models })
        showToast(`${t('settings.detectModelsBtn')} (${result.models.length})`, '✅')
      } else {
        showToast(result.error || '未检测到可用模型', '❌')
      }
    } catch (e) {
      showToast('Error: ' + e.message, '❌')
    }
    setDetecting(false)
  }


  const openAuthorGitHub = () => {
    window.clipai?.openExternal?.('https://github.com/jasperJu111')
  }

  const openGitHub = () => {
    window.clipai?.openExternal?.('https://github.com/jasperJu111/clipai')
  }

  const currentZoomPercent = Math.round(zoomFactor * 100)
  const currentDensity = settings.density || 'standard'
  const currentTheme = settings.theme || 'linear'
  const currentOpacity = settings.windowOpacity ?? 95
  const currentLang = settings.language || 'auto'

  const displayedThemes = THEMES.filter((t) => {
    if (themeFilter === 'dark') return t.category === 'dark'
    if (themeFilter === 'light') return t.category === 'light'
    return true
  })


  const handlePickCustomImage = async () => {
    try {
      const res = await window.clipai?.selectImageDialog?.()
      if (res?.success && res.dataUrl) {
        onUpdate({
          theme: 'custom',
          customBgImage: res.dataUrl,
          customBgBlur: settings.customBgBlur ?? 10,
          customBgDim: settings.customBgDim ?? 50
        })
        showToast('自定义壁纸已载入', '🖼️')
      }
    } catch (e) {
      showToast('选取失败: ' + e.message, '❌')
    }
  }

  const handlePasteFromClipboard = async () => {
    try {
      const history = (await window.clipai?.getHistory?.()) || []
      const latestImage = history.find((i) => i.type === 'image')
      if (latestImage && latestImage.content) {
        onUpdate({
          theme: 'custom',
          customBgImage: latestImage.content,
          customBgBlur: settings.customBgBlur ?? 10,
          customBgDim: settings.customBgDim ?? 50
        })
        showToast('已应用剪贴板最新图片为壁纸', '✨')
      } else {
        showToast('剪贴板历史中暂无图片', '⚠️')
      }
    } catch (e) {
      showToast('操作失败: ' + e.message, '❌')
    }
  }

  const handleRemoveCustomBg = () => {
    onUpdate({
      theme: 'linear',
      customBgImage: null
    })
    showToast('已移除自定义壁纸', '🗑️')
  }

  return (
    <div className="settings-panel">
      {/* ── 🌐 语言设置 (Language) ── */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settings.languageSection')}</div>
        <div className="panel-label" style={{ marginBottom: 8 }}>{t('settings.languageLabel')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 6 }}>
          {LANGUAGES.map((lang) => {
            const isSelected = currentLang === lang.id
            const displayName = lang.id === 'auto' ? t('settings.languageAuto') : lang.name
            return (
              <button
                key={lang.id}
                type="button"
                className={`segmented-btn ${isSelected ? 'active' : ''}`}
                style={{
                  padding: '8px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  fontSize: 11.5,
                  fontWeight: isSelected ? 600 : 400,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden'
                }}
                onClick={() => {
                  handleChange('language', lang.id)
                  showToast(`${lang.flag} ${displayName}`, '🌐')
                }}
                title={displayName}
              >
                <span style={{ flexShrink: 0 }}>{lang.flag}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── 🎨 主题外观 ── */}
      <div className="settings-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="settings-section-title" style={{ margin: 0 }}>{t('settings.themeSection')}</div>
          <div className="segmented-control" style={{ padding: 2 }}>
            <button
              type="button"
              className={`segmented-btn ${themeFilter === 'all' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 10.5 }}
              onClick={() => setThemeFilter('all')}
            >
              {t('settings.themeFilterAll', { count: THEMES.length })}
            </button>
            <button
              type="button"
              className={`segmented-btn ${themeFilter === 'dark' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 10.5 }}
              onClick={() => setThemeFilter('dark')}
            >
              {t('settings.themeFilterDark')}
            </button>
            <button
              type="button"
              className={`segmented-btn ${themeFilter === 'light' ? 'active' : ''}`}
              style={{ padding: '3px 8px', fontSize: 10.5 }}
              onClick={() => setThemeFilter('light')}
            >
              {t('settings.themeFilterLight')}
            </button>
          </div>
        </div>

        <div className="theme-grid">
          {displayedThemes.map((themeItem) => {
            const isActive = currentTheme === themeItem.id
            const localizedName = t(`settings.themes.${themeItem.id}.name`) || themeItem.name
            const localizedDesc = t(`settings.themes.${themeItem.id}.desc`) || themeItem.desc
            const localizedCategory = t(`settings.category${themeItem.category === 'dark' ? 'Dark' : 'Light'}`) || (themeItem.id === 'custom' ? '自定义' : '')

            if (themeItem.id === 'custom') {
              const hasCustomBg = !!settings.customBgImage
              return (
                <div
                  key={themeItem.id}
                  className={`theme-card ${isActive ? 'active' : ''}`}
                  style={{
                    borderStyle: hasCustomBg ? 'solid' : 'dashed',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                  onClick={async () => {
                    if (!hasCustomBg) {
                      await handlePickCustomImage()
                    } else {
                      handleChange('theme', 'custom')
                      showToast('已切换至自定义壁纸', '🖼️')
                    }
                  }}
                >
                  {isActive && <div className="theme-active-check">✓</div>}
                  <div className="theme-card-header">
                    {hasCustomBg ? (
                      <img
                        src={settings.customBgImage}
                        style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }}
                        alt="custom preview"
                      />
                    ) : (
                      <div className="theme-card-dots">
                        <div className="theme-dot" style={{ background: '#6366f1' }} />
                        <div className="theme-dot" style={{ background: '#a855f7' }} />
                      </div>
                    )}
                    <span className="theme-card-badge" style={{ background: 'rgba(99, 102, 241, 0.25)', color: '#818cf8', fontWeight: 600 }}>
                      {hasCustomBg ? (t('settings.customWallpaper.appliedBadge') || '已设壁纸') : (t('settings.categoryDark') || '自定义')}
                    </span>
                  </div>
                  <div className="theme-card-title">
                    <span>🖼️</span>
                    <span>{t('settings.customWallpaper.name') || '自定义壁纸'}</span>
                  </div>
                  <div className="theme-card-desc">
                    {hasCustomBg ? (t('settings.customWallpaper.desc') || '点击更换或微调壁纸') : (t('settings.customWallpaper.desc') || '点击选择本地图片')}
                  </div>
                </div>
              )
            }

            return (
              <div
                key={themeItem.id}
                className={`theme-card ${isActive ? 'active' : ''}`}
                onClick={() => {
                  handleChange('theme', themeItem.id)
                  showToast(localizedName, themeItem.icon)
                }}
              >
                {isActive && <div className="theme-active-check">✓</div>}
                <div className="theme-card-header">
                  <div className="theme-card-dots">
                    <div className="theme-dot" style={{ background: themeItem.bg }} />
                    <div className="theme-dot" style={{ background: themeItem.accent }} />
                  </div>
                  <span className="theme-card-badge">
                    {localizedCategory}
                  </span>
                </div>
                <div className="theme-card-title">
                  <span>{themeItem.icon}</span>
                  <span>{localizedName}</span>
                </div>
                <div className="theme-card-desc">{localizedDesc}</div>
              </div>
            )
          })}
        </div>

        {/* 🖼️ 自定义壁纸专属调节控制台 */}
        {(currentTheme === 'custom' || settings.customBgImage) && (
          <div
            style={{
              marginTop: 12,
              padding: '12px 14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12.5 }}>
                <span>🖼️</span>
                <span>{t('settings.customWallpaper.tweakTitle') || '自定义壁纸微调'}</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={handlePickCustomImage}
                >
                  🔄 {t('settings.customWallpaper.changeImage') || '更换图片'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '3px 8px' }}
                  onClick={handlePasteFromClipboard}
                  title="应用剪贴板里的最新截图/照片"
                >
                  📋 {t('settings.customWallpaper.pasteClipboard') || '粘贴剪贴板图'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: '3px 8px', color: 'var(--danger)' }}
                  onClick={handleRemoveCustomBg}
                >
                  🗑️ {t('settings.customWallpaper.remove') || '移除'}
                </button>
              </div>
            </div>

            {/* 模糊度调节 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4, color: 'var(--text-secondary)' }}>
                <span>🌫️ {t('settings.customWallpaper.blurLabel') || '背景毛玻璃模糊度 (Blur)'}</span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{settings.customBgBlur ?? 10}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                step="1"
                value={settings.customBgBlur ?? 10}
                onChange={(e) => handleChange('customBgBlur', parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>

            {/* 暗度遮罩调节 */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 4, color: 'var(--text-secondary)' }}>
                <span>🌓 {t('settings.customWallpaper.dimLabel') || '画面暗度深浅遮罩 (Overlay)'}</span>
                <span style={{ fontWeight: 600, color: 'var(--accent)' }}>{settings.customBgDim ?? 50}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="85"
                step="1"
                value={settings.customBgDim ?? 50}
                onChange={(e) => handleChange('customBgDim', parseInt(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            </div>
          </div>
        )}



        {/* 窗口透明度调节 */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="panel-label">{t('settings.opacityTitle')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                {currentOpacity}%
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => {
                  handleChange('windowOpacity', 95)
                  window.clipai?.setWindowOpacity(0.95)
                }}
                title={t('actions.default')}
              >
                {t('actions.default')}
              </button>
            </div>
          </div>

          <input
            type="range"
            min="45"
            max="100"
            step="1"
            value={currentOpacity}
            onChange={(e) => {
              const val = parseInt(e.target.value)
              handleChange('windowOpacity', val)
              window.clipai?.setWindowOpacity(val / 100)
            }}
            style={{
              width: '100%',
              accentColor: 'var(--accent)',
              cursor: 'pointer',
              marginBottom: 8
            }}
          />

          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { label: t('settings.opacityPresets.p65'), val: 65 },
              { label: t('settings.opacityPresets.p80'), val: 80 },
              { label: t('settings.opacityPresets.p90'), val: 90 },
              { label: t('settings.opacityPresets.p95'), val: 95 },
              { label: t('settings.opacityPresets.p100'), val: 100 }
            ].map((p) => (
              <button
                key={p.val}
                type="button"
                className={`segmented-btn ${currentOpacity === p.val ? 'active' : ''}`}
                style={{ flex: 1, padding: '4px 2px', fontSize: 11 }}
                onClick={() => {
                  handleChange('windowOpacity', p.val)
                  window.clipai?.setWindowOpacity(p.val / 100)
                  showToast(`${p.label}`, '🪟')
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            {t('settings.opacityDesc')}
          </div>
        </div>
      </div>


      {/* ── 🖥️ 显示与缩放 ── */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settings.displaySection')}</div>

        {/* 缩放滑块与快速预设 */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="panel-label">{t('settings.zoomLabel')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                {currentZoomPercent}%
              </span>
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '2px 6px' }}
                onClick={() => onSetZoom?.(1.0)}
                title={t('actions.reset')}
              >
                {t('actions.reset')}
              </button>
            </div>
          </div>

          <input
            type="range"
            min="70"
            max="180"
            step="5"
            value={currentZoomPercent}
            onChange={(e) => onSetZoom?.(parseInt(e.target.value) / 100)}
            style={{
              width: '100%',
              accentColor: 'var(--accent)',
              cursor: 'pointer',
              marginBottom: 8
            }}
          />

          {/* 预设档位按钮 */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
            {[75, 90, 100, 110, 125, 150].map((pct) => (
              <button
                key={pct}
                type="button"
                className={`segmented-btn ${currentZoomPercent === pct ? 'active' : ''}`}
                style={{ flex: 1, padding: '4px 2px', fontSize: 11 }}
                onClick={() => onSetZoom?.(pct / 100)}
              >
                {pct}%
              </button>
            ))}
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
            {t('settings.zoomDesc')}
          </div>
        </div>

        {/* 排版与字体密度 */}
        <div style={{ marginTop: 12 }}>
          <div className="panel-label" style={{ marginBottom: 6 }}>{t('settings.densityLabel')}</div>
          <div className="segmented-control">
            <button
              type="button"
              className={`segmented-btn ${currentDensity === 'compact' ? 'active' : ''}`}
              onClick={() => {
                handleChange('density', 'compact')
                showToast(t('settings.densityCompact'), '⚡')
              }}
            >
              {t('settings.densityCompact')}
            </button>
            <button
              type="button"
              className={`segmented-btn ${currentDensity === 'standard' ? 'active' : ''}`}
              onClick={() => {
                handleChange('density', 'standard')
                showToast(t('settings.densityStandard'), '⚖️')
              }}
            >
              {t('settings.densityStandard')}
            </button>
            <button
              type="button"
              className={`segmented-btn ${currentDensity === 'comfortable' ? 'active' : ''}`}
              onClick={() => {
                handleChange('density', 'comfortable')
                showToast(t('settings.densityComfortable'), '🛋️')
              }}
            >
              {t('settings.densityComfortable')}
            </button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {currentDensity === 'compact' && t('settings.densityCompactDesc')}
            {currentDensity === 'standard' && t('settings.densityStandardDesc')}
            {currentDensity === 'comfortable' && t('settings.densityComfortableDesc')}
          </div>
        </div>

        {/* 迷你小窗模式 */}
        <div className="settings-row" style={{ marginTop: 10 }}>
          <div className="settings-row-info">
            <div className="settings-row-label">{t('header.compactMode')}</div>
            <div className="settings-row-desc">{t('header.compactMode')}</div>
          </div>
          <Toggle
            checked={isCompact}
            onChange={() => onToggleCompact?.()}
          />
        </div>
      </div>

      {/* AI 大模型配置 */}
      <div className="settings-section">
        <div className="settings-section-title">
          <span>{t('settings.aiProvider.sectionTitle') || '🤖 AI 大模型提供商配置'}</span>
        </div>

        {(() => {
          const activeProviderId = settings.provider || 'gemini'
          const activeProvider = AI_PROVIDERS.find((p) => p.id === activeProviderId) || AI_PROVIDERS[0]
          const providerConfigs = settings.providerConfigs || {}
          const currentConfig = providerConfigs[activeProviderId] || {}

          const savedApiKey = currentConfig.apiKey !== undefined ? currentConfig.apiKey : (activeProviderId === 'gemini' ? (settings.apiKey || '') : '')
          const currentApiKey = apiKeyDrafts[activeProviderId] !== undefined ? apiKeyDrafts[activeProviderId] : savedApiKey

          const currentModel = currentConfig.model || (activeProviderId === 'gemini' ? settings.geminiModel : (activeProviderId === 'openai' ? settings.openaiModel : '')) || activeProvider.defaultModel || ''
          const currentBaseUrl = currentConfig.customBaseUrl !== undefined ? currentConfig.customBaseUrl : (activeProvider.defaultBaseUrl || '')
          const isLocal = activeProvider.group === 'local'

          const handleSaveApiKey = async (rawKey) => {
            if (typeof rawKey !== 'string') return
            const trimmed = rawKey.trim()
            if (trimmed.includes('••••')) return
            if (trimmed === savedApiKey) return

            if (!trimmed) {
              await window.clipai?.saveApiKey?.(activeProviderId, '')
              const fresh = await window.clipai?.getSettings?.()
              if (fresh) {
                onUpdate(fresh)
                setApiKeyDrafts((prev) => {
                  const next = { ...prev }
                  delete next[activeProviderId]
                  return next
                })
              }
              return
            }

            try {
              const res = await window.clipai?.saveApiKey?.(activeProviderId, trimmed)
              if (res && res.success && res.secure) {
                showToast('API Key 已安全加密存储', '🔒')
                const fresh = await window.clipai?.getSettings?.()
                if (fresh) {
                  onUpdate(fresh)
                  setApiKeyDrafts((prev) => {
                    const next = { ...prev }
                    delete next[activeProviderId]
                    return next
                  })
                }
              } else {
                const errMsg = res?.error || '硬件加密不可用，API Key 未能保存'
                showToast(errMsg, '❌')
              }
            } catch (e) {
              showToast(`保存失败: ${e.message}`, '❌')
            }
          }

          const handleUpdateProviderConfig = (key, val) => {
            const updated = {
              ...providerConfigs,
              [activeProviderId]: {
                ...currentConfig,
                [key]: val
              }
            }
            const extra = { providerConfigs: updated }
            if (activeProviderId === 'gemini') {
              if (key === 'model') extra.geminiModel = val
            } else if (activeProviderId === 'openai') {
              if (key === 'model') extra.openaiModel = val
            }
            onUpdate(extra)
            setTestResult(null)
          }

          const handleTestConnection = async () => {
            const draftKey = apiKeyDrafts[activeProviderId]
            if (draftKey !== undefined && typeof draftKey === 'string' && !draftKey.includes('••••') && draftKey.trim() && draftKey.trim() !== savedApiKey) {
              try {
                const saveRes = await window.clipai?.saveApiKey?.(activeProviderId, draftKey.trim())
                if (!saveRes || !saveRes.success || !saveRes.secure) {
                  showToast(saveRes?.error || 'API Key 安全加密保存失败，终止测试连接', '❌')
                  return
                }
                const fresh = await window.clipai?.getSettings?.()
                if (fresh) {
                  onUpdate(fresh)
                  setApiKeyDrafts((prev) => {
                    const next = { ...prev }
                    delete next[activeProviderId]
                    return next
                  })
                }
              } catch (err) {
                showToast(`保存 API Key 异常: ${err.message}`, '❌')
                return
              }
            }

            setTestingConnection(true)
            setTestResult(null)
            try {
              const res = await window.clipai.testAIConnection({
                provider: activeProviderId,
                model: currentModel,
                customBaseUrl: currentBaseUrl
              })
              if (res.success) {
                const msg = t('settings.aiProvider.testSuccess', { latency: res.latency }) || `连接成功 (延迟: ${res.latency || 120}ms)`
                setTestResult({ success: true, msg })
                showToast(msg, '⚡')
              } else {
                const msg = res.error || (t('settings.aiProvider.testFailed') || '连接失败')
                setTestResult({ success: false, msg })
                showToast(msg, '❌')
              }
            } catch (e) {
              setTestResult({ success: false, msg: e.message })
            } finally {
              setTestingConnection(false)
            }
          }

          const handleDetectModels = async () => {
            if (!isLocal && !currentApiKey && activeProviderId !== 'custom') {
              showToast(t('aiPanel.noApiKeyWarning') || '请先填写 API Key', '⚠️')
              return
            }
            setDetecting(true)
            try {
              const result = window.clipai?.listModels
                ? await window.clipai.listModels({
                    provider: activeProviderId,
                    apiKey: effectiveKey,
                    customBaseUrl: currentBaseUrl
                  })
                : (window.clipai?.listGeminiModels
                    ? await window.clipai.listGeminiModels(effectiveKey)
                    : { success: false, error: '接口未就绪，请重启应用' })

              if (result.success && result.models?.length > 0) {
                setDetectedModels(result.models)
                const updatedDetected = {
                  ...(settings.providerDetectedModels || {}),
                  [activeProviderId]: result.models
                }
                onUpdate({ providerDetectedModels: updatedDetected, cachedModels: result.models })
                showToast(`检测到 ${result.models.length} 个可用模型`, '✅')
              } else {
                showToast(result.error || (t('settings.aiProvider.testFailed') || '未检测到可用模型'), '❌')
              }
            } catch (e) {
              showToast('检测失败: ' + e.message, '❌')
            } finally {
              setDetecting(false)
            }
          }

          const providerDetected = (settings.providerDetectedModels?.[activeProviderId]) || (activeProviderId === 'gemini' ? (detectedModels?.length > 0 ? detectedModels : settings.cachedModels) : null) || []

          const modelMap = new Map()
          providerDetected.forEach((m) => {
            const name = typeof m === 'string' ? m : m.name
            const displayName = typeof m === 'string' ? m : (m.displayName || m.name)
            modelMap.set(name, { name, displayName })
          })

          activeProvider.models.forEach((m) => {
            if (!modelMap.has(m.name)) {
              modelMap.set(m.name, m)
            }
          })

          if (currentModel && !modelMap.has(currentModel)) {
            modelMap.set(currentModel, { name: currentModel, displayName: `${currentModel}` })
          }

          const modelOptions = Array.from(modelMap.values())

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* 厂商下拉选择器 (按分组整理) */}
              <div>
                <div className="panel-label" style={{ marginBottom: 6 }}>{t('settings.aiProvider.selectPlatform') || '选择 AI 提供商 / 平台'}</div>
                <select
                  className="settings-select"
                  value={activeProviderId}
                  onChange={(e) => {
                    handleChange('provider', e.target.value)
                    setTestResult(null)
                  }}
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {AI_GROUPS.map((group) => {
                    const providersInGroup = AI_PROVIDERS.filter((p) => p.group === group.id)
                    if (providersInGroup.length === 0) return null
                    return (
                      <optgroup key={group.id} label={group.label}>
                        {providersInGroup.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.icon} {p.name}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </select>
              </div>

              {/* 厂商卡片信息与官网直达链接 */}
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20 }}>{activeProvider.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {activeProvider.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {activeProvider.supportVision ? (t('settings.aiProvider.visionSupported') || '✨ 支持纯文本与多模态图片视觉解析') : (t('settings.aiProvider.textOnly') || '📝 支持文本分析与代码/翻译')}
                      </div>
                    </div>
                  </div>

                  {activeProvider.websiteUrl && (
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: 11, padding: '3px 8px', color: 'var(--accent)', borderColor: 'var(--accent-dim)' }}
                      onClick={() => window.clipai.openExternal(activeProvider.websiteUrl)}
                      title={activeProvider.keyTip}
                    >
                      {t('settings.aiProvider.getKey') || '🔑 获取 Key ↗'}
                    </button>
                  )}
                </div>

                {/* API Key 输入框 */}
                {!isLocal && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                      <div className="panel-label" style={{ fontSize: 11.5 }}>
                        {activeProvider.name} API Key
                      </div>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                        {activeProvider.keyTip}
                      </span>
                    </div>
                    <div style={{ position: 'relative' }}>
                      <input
                        className={`settings-input ${!showKey && currentApiKey ? 'password' : ''}`}
                        type={showKey ? 'text' : 'password'}
                        placeholder={activeProvider.id === 'zhipu' ? '输入智谱 API Key (如 xxx.xxx)' : '输入 API Key (如 sk-...)'}
                        value={currentApiKey}
                        onChange={(e) => {
                          const val = e.target.value
                          setApiKeyDrafts((prev) => ({
                            ...prev,
                            [activeProviderId]: val
                          }))
                        }}
                        onBlur={(e) => handleSaveApiKey(e.target.value)}
                        style={{ paddingRight: 40, fontSize: 12.5 }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        style={{
                          position: 'absolute',
                          right: 10,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 14,
                          color: 'var(--text-muted)'
                        }}
                      >
                        {showKey ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 模型选择与检测按钮 */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <div className="panel-label" style={{ fontSize: 11.5 }}>
                      {t('settings.aiProvider.modelSelect') || '选用模型 (Model)'}
                      {modelOptions.length > 0 && (
                        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>
                          {t('settings.aiProvider.modelCount', { count: modelOptions.length }) || `(${modelOptions.length} 个)`}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* 🔍 检测可用模型 */}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{
                          fontSize: 10.5,
                          padding: '2px 8px',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background: 'var(--accent-dim)',
                          color: 'var(--accent)',
                          borderColor: 'var(--accent)'
                        }}
                        onClick={handleDetectModels}
                        disabled={detecting}
                        title="在线检测该 API Key 支持的所有可用模型"
                      >
                        {detecting ? (
                          <>
                            <div className="spinner" style={{ width: 10, height: 10 }} />
                            <span>{t('settings.aiProvider.detecting') || '检测中...'}</span>
                          </>
                        ) : (
                          <>
                            <span>🔍</span>
                            <span>{t('settings.aiProvider.detectModels') || '检测可用模型'}</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ fontSize: 10.5, padding: '2px 6px', color: showCustomModelInput ? 'var(--accent)' : 'var(--text-muted)' }}
                        onClick={() => setShowCustomModelInput(!showCustomModelInput)}
                      >
                        {showCustomModelInput ? (t('settings.aiProvider.selectPreset') || '📋 选择列表') : (t('settings.aiProvider.manualInput') || '✏️ 手动输入')}
                      </button>
                    </div>
                  </div>

                  {showCustomModelInput ? (
                    <input
                      className="settings-input"
                      type="text"
                      placeholder={t('settings.aiProvider.customModelPlaceholder') || '输入任意模型 ID (例如: deepseek-chat, gpt-4o...)'}
                      value={currentModel}
                      onChange={(e) => handleUpdateProviderConfig('model', e.target.value)}
                      style={{ fontSize: 12.5 }}
                    />
                  ) : (
                    <select
                      className="settings-select"
                      value={currentModel}
                      onChange={(e) => handleUpdateProviderConfig('model', e.target.value)}
                      style={{ fontSize: 12.5 }}
                    >
                      {modelOptions.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.displayName || m.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* API 端点 Base URL (适用于自定义接口、本地模型或中转反代) */}
                {(activeProvider.id === 'custom' || isLocal || currentConfig.customBaseUrl) && (
                  <div>
                    <div className="panel-label" style={{ fontSize: 11.5, marginBottom: 5 }}>
                      {t('settings.aiProvider.customBaseUrl') || '自定义接口地址 (Base URL)'}
                    </div>
                    <input
                      className="settings-input"
                      type="text"
                      placeholder={activeProvider.defaultBaseUrl || 'https://your-api-proxy.com/v1'}
                      value={currentBaseUrl}
                      onChange={(e) => handleUpdateProviderConfig('customBaseUrl', e.target.value)}
                      style={{ fontSize: 12 }}
                    />
                  </div>
                )}

                {/* 测试连接按钮与反馈 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ fontSize: 11.5, padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={handleTestConnection}
                    disabled={testingConnection || (!isLocal && !currentApiKey && activeProvider.id !== 'custom')}
                  >
                    {testingConnection ? (
                      <>
                        <div className="spinner" style={{ width: 12, height: 12 }} />
                        <span>{t('settings.aiProvider.testingConnection') || '正在测速连接中...'}</span>
                      </>
                    ) : (
                      <>
                        <span>⚡</span>
                        <span>{t('settings.aiProvider.testConnection') || '测试连通性 (Test Connection)'}</span>
                      </>
                    )}
                  </button>

                  {testResult && (
                    <div
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: testResult.success ? '#10b981' : '#ef4444',
                        maxWidth: '60%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={testResult.msg}
                    >
                      {testResult.success ? `✅ ${testResult.msg}` : `❌ ${testResult.msg}`}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* 通用设置与快捷键 */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settings.systemSection')}</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">{t('settings.alwaysOnTopLabel')}</div>
            <div className="settings-row-desc">{t('settings.alwaysOnTopLabel')}</div>
          </div>
          <Toggle
            checked={settings.alwaysOnTop !== false}
            onChange={(v) => handleChange('alwaysOnTop', v)}
          />
        </div>

        <div>
          <div className="panel-label" style={{ marginBottom: 6 }}>{t('settings.shortcutLabel')}</div>
          <ShortcutSelector
            value={resolveStoredShortcut(settings.shortcut, 'Alt+Space')}
            onChange={(val) => handleChange('shortcut', val)}
            t={t}
            presets={[
              { label: '🍏 ⌥ Option + Space', val: 'Alt+Space' },
              { label: '🍏 ⌘ Cmd + ⇧ Shift + V', val: 'Command+Shift+V' },
              { label: '🍏 ⌃ Ctrl + Space', val: 'Ctrl+Space' },
              { label: '🪟 Alt + Space', val: 'Alt+Space' },
              { label: '🪟 Ctrl + Shift + V', val: 'Ctrl+Shift+V' },
              { label: '🪟 Ctrl + Alt + V', val: 'Ctrl+Alt+V' }
            ]}
          />
        </div>

        <div>
          <div className="panel-label" style={{ marginBottom: 6 }}>📸 {t('settings.screenshotShortcutLabel') || '截图快捷键'}</div>
          <ShortcutSelector
            value={resolveStoredShortcut(settings.screenshotShortcut, 'Alt+A')}
            onChange={(val) => handleChange('screenshotShortcut', val)}
            t={t}
            presets={[
              { label: '🍏 ⌥ Option + A', val: 'Alt+A' },
              { label: '🍏 ⌘ Cmd + ⇧ Shift + A', val: 'Command+Shift+A' },
              { label: '🍏 ⌘ Cmd + ⇧ Shift + 4', val: 'Command+Shift+4' },
              { label: '🪟 Alt + A', val: 'Alt+A' },
              { label: '🪟 Ctrl + Alt + A', val: 'Ctrl+Alt+A' },
              { label: '🪟 Ctrl + Shift + A', val: 'Ctrl+Shift+A' },
              { label: '⚡ F1', val: 'F1' }
            ]}
          />
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('settings.screenshotShortcutTip') || '💡 全局快捷键：在任何页面按下此键，即可划选截图并自动存入剪贴板与历史记录'}
          </div>
        </div>

        <div>
          <div className="panel-label" style={{ marginBottom: 6 }}>{t('settings.maxHistoryLabel')}</div>

          <select
            className="settings-select"
            value={settings.maxHistory || 200}
            onChange={(e) => handleChange('maxHistory', parseInt(e.target.value))}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </div>
      </div>

      {/* 数据管理 */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settings.historySection')}</div>

        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">{t('actions.clearAll')}</div>
            <div className="settings-row-desc">{t('clipboard.confirmClear')}</div>
          </div>
          <button
            className="btn btn-danger"
            onClick={onClearHistory}
            style={{ fontSize: '12px', padding: '5px 10px' }}
          >
            🗑️ {t('actions.clearAll')}
          </button>
        </div>
      </div>

      {/* 保存按钮 */}
      <button className="btn btn-primary w-full" onClick={handleSave}>
        {saved ? `✅ ${t('actions.savedSuccess') || 'Saved'}` : `💾 ${t('actions.save') || 'Save'}`}
      </button>

      {/* 关于 */}
      <div className="settings-section">
        <div className="settings-section-title">{t('settings.aboutSection')}</div>
        <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
            {t('settings.openSourceDesc')}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Version</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>v0.1.0 (MVP)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>License</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>MIT License</span>
          </div>
        </div>

        {/* 👨‍💻 专属作者认证标签卡片（点击直达 GitHub 主页） */}
        <div
          style={{
            margin: '8px 0 10px',
            padding: '10px 12px',
            borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.14), rgba(168, 85, 247, 0.14))',
            border: '1px solid rgba(129, 140, 248, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)'
          }}
          className="author-badge-card"
          onClick={openAuthorGitHub}
          title="点击访问作者 GitHub 主页 (https://github.com/jasperJu111)"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366f1, #a855f7)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                fontWeight: 700,
                boxShadow: '0 2px 10px rgba(99,102,241,0.35)'
              }}
            >
              👨‍💻
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)' }}>jasperJu111</span>
                <span
                  style={{
                    fontSize: 9.5,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: 'rgba(99, 102, 241, 0.25)',
                    color: '#818cf8',
                    fontWeight: 600
                  }}
                >
                  {t('settings.authorBadge') || '⚡ 原创作者认证'}
                </span>
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span>github.com/jasperJu111</span>
                <span style={{ fontSize: 11 }}>↗</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 14 }}>👑</span>
          </div>
        </div>

        <button
          className="btn btn-secondary w-full"
          onClick={openGitHub}
        >
          ⭐ GitHub Repository
        </button>

        {/* 彻底退出应用 */}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{t('settings.quitTitle') || '退出 ClipAI'}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{t('settings.quitDesc') || '快捷键 ⌘Q 彻底结束进程并退出 Dock'}</div>
            </div>
            <button
              type="button"
              className="btn"
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                padding: '5px 12px',
                fontSize: 11.5,
                fontWeight: 600,
                borderRadius: 6
              }}
              onClick={() => window.clipai?.quitApp?.()}
            >
              {t('settings.quitBtn') || '🚪 彻底退出'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

