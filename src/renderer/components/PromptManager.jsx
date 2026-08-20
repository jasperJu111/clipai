import { useState, useMemo, useEffect, useRef } from 'react'
import { PRESET_PROMPTS_CHAT, PROMPTS_CATEGORIES, getLocalizedPrompt } from '../constants/promptsChatData'

const DEFAULT_EMOJIS = ['🚀', '💡', '🔥', '⚡', '🎯', '🌟', '🛠️', '📊', '🔐', '🎨', '📦', '🤖', '🐧', '🐍', '⚛️', '📕', '🎓', '💼', '📧', '🧠', '✈️', '🥗', '🧙‍♂️', '🎬', '✍️']

function PromptModal({ prompt, isClone = false, onSave, onClose, t = (k) => k }) {
  const PRESET_CATS = ['dev', 'writing', 'career', 'study', 'life']
  const initialCategory = prompt?.category || 'writing'
  const isInitialCustom = initialCategory && !PRESET_CATS.includes(initialCategory)

  const [form, setForm] = useState(
    prompt
      ? {
          emoji: prompt.emoji || '💡',
          name: isClone ? `${prompt.name || prompt.nameEn} (副本)` : (prompt.name || prompt.nameEn || ''),
          category: initialCategory,
          desc: prompt.desc || '',
          prompt: prompt.prompt || ''
        }
      : { emoji: '💡', name: '', category: 'writing', desc: '', prompt: '' }
  )
  const [isCustomCategory, setIsCustomCategory] = useState(isInitialCustom)
  const [error, setError] = useState('')

  const handleSave = () => {
    if (!form.name?.trim()) {
      setError(t('prompts.nameRequired') || '请输入提示词名称')
      return
    }
    if (!form.prompt?.trim()) {
      setError(t('prompts.contentRequired') || '请输入提示词内容')
      return
    }
    onSave({
      ...form,
      category: form.category?.trim() || 'writing',
      id: isClone || !prompt?.id ? `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : prompt.id
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460, width: '92%' }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>{isClone ? (t('prompts.cloneTitle') || '⎘ 克隆并定制提示词') : (prompt ? (t('prompts.editTitle') || '✏️ 编辑提示词') : (t('prompts.addBtn') || '➕ 新建私有提示词'))}</span>
        </div>

        {/* Emoji 图标选择 */}
        <div style={{ marginBottom: 12 }}>
          <div className="panel-label" style={{ marginBottom: 6 }}>{t('prompts.iconLabel') || '图标'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 76, overflowY: 'auto', padding: 2 }}>
            {DEFAULT_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setForm((f) => ({ ...f, emoji: e }))}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 6,
                  border: `1px solid ${form.emoji === e ? 'var(--accent)' : 'var(--border)'}`,
                  background: form.emoji === e ? 'var(--accent-dim)' : 'var(--bg-card)',
                  cursor: 'pointer',
                  fontSize: 15,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* 名称与分类 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="panel-label" style={{ marginBottom: 6 }}>{t('prompts.nameLabel') || '名称'}</div>
            <input
              className="settings-input"
              placeholder={t('prompts.namePlaceholder') || '例如：周报润色大师'}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div style={{ width: isCustomCategory ? 150 : 124 }}>
            <div className="panel-label" style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t('prompts.categoryLabel') || '分类'}</span>
              {isCustomCategory && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomCategory(false)
                    setForm((f) => ({ ...f, category: 'writing' }))
                  }}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 10.5, padding: 0 }}
                  title="切换回预设分类"
                >
                  {t('prompts.selectPreset') || '‹ 选预设'}
                </button>
              )}
            </div>
            {isCustomCategory ? (
              <input
                className="settings-input"
                style={{ fontSize: 11.5, padding: '5px 6px' }}
                placeholder={t('prompts.customCategoryPlaceholder') || '输入自定义分类名'}
                value={form.category || ''}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                autoFocus
              />
            ) : (
              <select
                className="settings-select"
                style={{ fontSize: 11.5 }}
                value={form.category || 'writing'}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomCategory(true)
                    setForm((f) => ({ ...f, category: '' }))
                  } else {
                    setForm((f) => ({ ...f, category: e.target.value }))
                  }
                }}
              >
                <option value="writing">✍️ {t('prompts.catWriting') || '文案'}</option>
                <option value="dev">💻 {t('prompts.catDev') || '编程'}</option>
                <option value="career">💼 {t('prompts.catCareer') || '职场'}</option>
                <option value="study">🎓 {t('prompts.catStudy') || '科研'}</option>
                <option value="life">🎨 {t('prompts.catLife') || '生活'}</option>
                <option value="__custom__">{t('prompts.customCategoryOption') || '✏️ 自定义输入分类...'}</option>
              </select>
            )}
          </div>
        </div>

        {/* 简介描述 */}
        <div style={{ marginBottom: 10 }}>
          <div className="panel-label" style={{ marginBottom: 6 }}>{t('prompts.descLabel') || '简要描述 (可选)'}</div>
          <input
            className="settings-input"
            placeholder={t ? t('prompts.descPlaceholder') : '例如：将中文构思转化为专业的 Midjourney 英文提示词'}
            value={form.desc || ''}
            onChange={(e) => setForm((f) => ({ ...f, desc: e.target.value }))}
          />
        </div>

        {/* 提示词内容 */}
        <div style={{ marginBottom: 12 }}>
          <div className="panel-label" style={{ marginBottom: 6 }}>{t ? t('prompts.contentLabel') : '提示词设定模板 (System Prompt)'}</div>
          <textarea
            className="ai-textarea"
            placeholder={t ? t('prompts.contentPlaceholder') : '输入具体的 System Prompt、角色设定或指令模板...'}
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            style={{ minHeight: 120, fontSize: 12 }}
          />
        </div>

        {error && (
          <div className="ai-error" style={{ marginBottom: 10 }}>⚠️ {error}</div>
        )}

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>{t ? t('actions.cancel') : '取消'}</button>
          <button className="btn btn-primary" onClick={handleSave}>{t ? t('actions.save') : '保存到我的私有库'}</button>
        </div>
      </div>
    </div>
  )
}


function detectCurrentLang(t) {
  if (!t) return 'zh-CN';
  const catAll = t('prompts.catAll');
  const catDev = t('prompts.catDev');
  if (catAll === 'すべて') return 'ja-JP';
  if (catAll === '전체') return 'ko-KR';
  if (catAll === 'All') return 'en-US';
  if (catAll === 'Todo') return 'es-ES';
  if (catAll === 'Alle') return 'de-DE';
  if (catAll === 'Tout') return 'fr-FR';
  if (catDev === '程式') return 'zh-TW';
  return 'zh-CN';
}

export default function PromptManager({ prompts = [], onUpdate, onUseInAI, showToast, t = (k) => k }) {
  const currentLang = detectCurrentLang(t);
  // 当前激活库标签: 'community' (精选200) | 'custom' (私有库) | 'favorites' (我的收藏) | 'recent' (最近使用)
  const [activeTab, setActiveTab] = useState('community')
  const [activeCategory, setActiveCategory] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingPrompt, setEditingPrompt] = useState(null)
  const [isCloneMode, setIsCloneMode] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(25)
  const fileInputRef = useRef(null)

  // ⭐ 我的收藏列表（持久化保存 IDs）
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('clipai_prompt_favorites') || '[]')
    } catch {
      return []
    }
  })

  // 🕒 最近使用的提示词列表（持久化保存 IDs）
  const [recentIds, setRecentIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('clipai_prompt_recents') || '[]')
    } catch {
      return []
    }
  })

  // 🌐 社区 200 条缓存数据
  const [onlinePrompts, setOnlinePrompts] = useState(() => {
    try {
      const cached = localStorage.getItem('clipai_cached_prompts_chat')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed) && parsed.length > 0 && parsed.length <= 250) {
          return parsed
        } else {
          localStorage.removeItem('clipai_cached_prompts_chat')
        }
      }
    } catch {}
    return []
  })

  // 保存收藏
  useEffect(() => {
    try {
      localStorage.setItem('clipai_prompt_favorites', JSON.stringify(favorites))
    } catch {}
  }, [favorites])

  // 保存最近使用
  useEffect(() => {
    try {
      localStorage.setItem('clipai_prompt_recents', JSON.stringify(recentIds))
    } catch {}
  }, [recentIds])

  // 当切换分类、标签或搜索时，重置分页显示限制
  useEffect(() => {
    setDisplayLimit(25)
  }, [activeCategory, searchQuery, activeTab])

  // 综合社区精选库数据
  const communityList = useMemo(() => {
    return onlinePrompts.length > 0 ? onlinePrompts : PRESET_PROMPTS_CHAT
  }, [onlinePrompts])

  // 全量提示词查找字典
  const allPromptsMap = useMemo(() => {
    const map = new Map()
    communityList.forEach((p) => map.set(p.id || p.name, p))
    prompts.forEach((p) => map.set(p.id || p.name, p))
    return map
  }, [communityList, prompts])

  // 当前激活标签下的源列表
  const currentSourceList = useMemo(() => {
    if (activeTab === 'community') return communityList
    if (activeTab === 'custom') return prompts
    if (activeTab === 'favorites') {
      return favorites
        .map((id) => allPromptsMap.get(id))
        .filter(Boolean)
    }
    if (activeTab === 'recent') {
      return recentIds
        .map((id) => allPromptsMap.get(id))
        .filter(Boolean)
    }
    return communityList
  }, [activeTab, communityList, prompts, favorites, recentIds, allPromptsMap])

  // 过滤后的展示列表
  const filteredList = useMemo(() => {
    return currentSourceList.filter((item) => {
      // 分类过滤
      if (activeCategory !== 'all' && item.category !== activeCategory) {
        return false
      }
      // 搜索关键词过滤 (中英双语检索)
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase();
      const loc = getLocalizedPrompt(item, currentLang);
      return (
        item.name?.toLowerCase().includes(q) ||
        item.nameEn?.toLowerCase().includes(q) ||
        item.desc?.toLowerCase().includes(q) ||
        item.prompt?.toLowerCase().includes(q) ||
        loc.name?.toLowerCase().includes(q) ||
        loc.desc?.toLowerCase().includes(q) ||
        loc.prompt?.toLowerCase().includes(q)
      );
    })
  }, [currentSourceList, activeCategory, searchQuery])

  // 限制当前可见卡片数量（分批轻量渲染，确保万条数据依然 60 帧丝滑）
  const visibleList = useMemo(() => {
    return filteredList.slice(0, displayLimit)
  }, [filteredList, displayLimit])

  // 统计各个分类数量
  const categoryCounts = useMemo(() => {
    const counts = { all: currentSourceList.length }
    PROMPTS_CATEGORIES.forEach((c) => {
      if (c.id !== 'all') {
        counts[c.id] = currentSourceList.filter((item) => item.category === c.id).length
      }
    })
    return counts
  }, [currentSourceList])

  // 切换收藏状态
  const toggleFavorite = (item) => {
    const id = item.id || item.name
    const isFav = favorites.includes(id)
    if (isFav) {
      setFavorites((prev) => prev.filter((fid) => fid !== id))
      showToast(`已从「我的收藏」中移除`, '⭐')
    } else {
      setFavorites((prev) => [id, ...prev])
      showToast(`已成功加入「我的收藏」`, '⭐')
    }
  }

  // 记录最近使用
  const recordRecent = (item) => {
    const id = item.id || item.name
    setRecentIds((prev) => {
      const filtered = prev.filter((rid) => rid !== id)
      return [id, ...filtered].slice(0, 30)
    })
  }

  // 保存或编辑自定义提示词
  const handleSave = (prompt) => {
    const exists = prompts.find((p) => p.id === prompt.id)
    const newPrompts = exists
      ? prompts.map((p) => (p.id === prompt.id ? prompt : p))
      : [prompt, ...prompts]
    onUpdate(newPrompts)
    setShowModal(false)
    setEditingPrompt(null)
    setIsCloneMode(false)
    showToast(t('prompts.savedSuccess') || '提示词已保存到私有库', '✅')
  }

  // 删除自定义提示词
  const handleDelete = (id) => {
    onUpdate(prompts.filter((p) => p.id !== id))
    setFavorites((prev) => prev.filter((fid) => fid !== id))
    setRecentIds((prev) => prev.filter((rid) => rid !== id))
    showToast(t('prompts.deletedSuccess') || '提示词已删除', '🗑️')
  }

  // 复制 Prompt 内容
  const handleCopyPrompt = (item) => {
    const loc = getLocalizedPrompt(item, currentLang);
    const text = loc.prompt || item.prompt;
    if (window.clipai?.copyToClipboard) {
      window.clipai.copyToClipboard({ type: 'text', content: text });
    } else {
      navigator.clipboard?.writeText(text);
    }
    recordRecent(item);
    showToast(t('actions.copied') || '提示词已复制到剪贴板', '📋');
  }

  // 一键在 AI 助手中使用
  const handleUsePrompt = (item) => {
    const loc = getLocalizedPrompt(item, currentLang);
    const text = loc.prompt || item.prompt;
    const title = loc.name || item.name || item.nameEn;
    if (onUseInAI) {
      onUseInAI({ ...item, prompt: text, name: title, desc: loc.desc }, 'native');
    }
    recordRecent(item);
    showToast(`${t('prompts.appliedNotice') || '已载入'} 「${title}」`, '⚡');
  }

  // 联网同步 prompts.chat 官方常用 200 条
  const handleSyncOnline = async () => {
    setSyncing(true)
    try {
      if (window.clipai?.syncPromptsChat) {
        const res = await window.clipai.syncPromptsChat()
        if (res.success && res.prompts?.length > 0) {
          setOnlinePrompts(res.prompts)
          try {
            localStorage.setItem('clipai_cached_prompts_chat', JSON.stringify(res.prompts))
          } catch {}
          showToast(`${t('prompts.syncSuccess') || '成功同步'} ${res.count} 个官方常用角色`, '🌐')
        } else {
          showToast('同步未获取到数据', '⚠️')
        }
      }
    } catch (e) {
      showToast('同步异常: ' + e.message, '❌')
    } finally {
      setSyncing(false)
    }
  }

  // 导出私有库 JSON
  const handleExportJSON = () => {
    if (prompts.length === 0) {
      showToast('私有库暂无提示词可导出', 'ℹ️')
      return
    }
    const data = JSON.stringify(prompts, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `clipai-custom-prompts-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    showToast(`已导出 ${prompts.length} 条私有提示词`, '📤')
  }

  // 导入 JSON 文件
  const handleImportFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result)
        if (Array.isArray(parsed) && parsed.length > 0) {
          const imported = parsed.map((p, idx) => ({
            id: p.id || `imported_${Date.now()}_${idx}`,
            emoji: p.emoji || '💡',
            name: p.name || p.act || p.nameEn || '未命名提示词',
            category: p.category || 'writing',
            desc: p.desc || p.description || '',
            prompt: p.prompt || ''
          })).filter(p => p.prompt.trim())

          onUpdate([...imported, ...prompts])
          showToast(`成功导入 ${imported.length} 条提示词！`, '📥')
        } else {
          showToast('JSON 格式无效或内容为空', '⚠️')
        }
      } catch (err) {
        showToast('导入解析失败: ' + err.message, '❌')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="prompt-center-container">
      {/* 隐藏的导入文件 input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleImportFile}
      />

      {/* ── 4 合 1 库导航标签栏（极简精炼文字，均匀四等分，永不溢出） ── */}
      <div className="prompt-tab-switch" style={{ width: '100%', display: 'flex', gap: 2 }}>
        <button
          className={`prompt-tab-btn ${activeTab === 'community' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center', padding: '3px 2px', minWidth: 0, fontSize: '11px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('community')}
          title={t('prompts.communityTab') || '精选'}
        >
          <span>🌟 {t('prompts.communityTab') || '精选'}</span>
          <span className="prompt-tab-badge">{communityList.length}</span>
        </button>

        <button
          className={`prompt-tab-btn ${activeTab === 'custom' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center', padding: '3px 2px', minWidth: 0, fontSize: '11px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('custom')}
          title={t('prompts.customTab') || '私有'}
        >
          <span>💡 {t('prompts.customTab') || '私有'}</span>
          <span className="prompt-tab-badge">{prompts.length}</span>
        </button>

        <button
          className={`prompt-tab-btn ${activeTab === 'favorites' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center', padding: '3px 2px', minWidth: 0, fontSize: '11px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('favorites')}
          title={t('prompts.favoritesTab') || '收藏'}
        >
          <span>⭐ {t('prompts.favoritesTab') || '收藏'}</span>
          <span className="prompt-tab-badge">{favorites.length}</span>
        </button>

        <button
          className={`prompt-tab-btn ${activeTab === 'recent' ? 'active' : ''}`}
          style={{ flex: 1, justifyContent: 'center', padding: '3px 2px', minWidth: 0, fontSize: '11px', whiteSpace: 'nowrap' }}
          onClick={() => setActiveTab('recent')}
          title={t('prompts.recentTab') || '最近'}
        >
          <span>🕒 {t('prompts.recentTab') || '最近'}</span>
          <span className="prompt-tab-badge">{recentIds.length}</span>
        </button>
      </div>
      {/* ── 行 2：搜索框 + 右侧轻量快捷操作 ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', margin: '3px 0 4px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <input
            className="settings-input prompt-search-input"
            style={{ padding: '6px 24px 6px 8px', fontSize: '11.5px', height: '28px', width: '100%' }}
            placeholder={
              activeTab === 'community'
                ? (t('prompts.searchPlaceholder') || '🔍 搜索 100+ 提示词...')
                : (activeTab === 'custom' ? (t('prompts.searchPlaceholder') || '🔍 搜索私有提示词...') : (activeTab === 'favorites' ? (t('prompts.searchPlaceholder') || '🔍 搜索收藏...') : (t('prompts.searchPlaceholder') || '🔍 搜索最近角色...')))
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="prompt-search-clear"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        {/* 右侧动态快捷操作 */}
        {activeTab === 'community' && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: 11, padding: '2px 6px', height: '28px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}
              onClick={() => {
                if (window.clipai?.openExternal) {
                  window.clipai.openExternal('https://prompts.chat')
                } else {
                  window.open('https://prompts.chat', '_blank')
                }
              }}
              title="prompts.chat"
            >
              <span>🌐 {t('prompts.website') || '官网'} ↗</span>
            </button>

            <button
              className="btn btn-primary"
              style={{ fontSize: 11, padding: '2px 7px', height: '28px', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 2 }}
              onClick={() => {
                setEditingPrompt(null)
                setIsCloneMode(false)
                setShowModal(true)
              }}
              title={t('prompts.addBtn') || '新建提示词'}
            >
              <span>➕ {t('prompts.customBtn') || '自定义'}</span>
            </button>
          </div>
        )}

        {activeTab === 'custom' && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button
              className="btn btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              style={{ fontSize: 11, padding: '2px 5px', height: '28px', color: 'var(--text-secondary)' }}
              title={t('prompts.importBtn') || '导入'}
            >
              📥 {t('prompts.importBtn') || '导入'}
            </button>

            <button
              className="btn btn-ghost"
              onClick={handleExportJSON}
              style={{ fontSize: 11, padding: '2px 5px', height: '28px', color: 'var(--text-secondary)' }}
              title={t('prompts.exportBtn') || '导出'}
            >
              📤 {t('prompts.exportBtn') || '导出'}
            </button>

            <button
              className="btn btn-primary"
              onClick={() => { setEditingPrompt(null); setIsCloneMode(false); setShowModal(true) }}
              style={{ fontSize: 11, padding: '2px 7px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: 2 }}
              title={t('prompts.addBtn') || '新建提示词'}
            >
              ➕ {t('prompts.customBtn') || '自定义'}
            </button>
          </div>
        )}

        {(activeTab === 'favorites' || activeTab === 'recent') && (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {activeTab === 'recent' && recentIds.length > 0 && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 11, padding: '2px 6px', height: '28px', color: 'var(--text-muted)' }}
                onClick={() => {
                  setRecentIds([])
                  showToast(t('prompts.deletedSuccess') || '记录已清空', '🗑️')
                }}
                title={t('prompts.clear') || '清空'}
              >
                🗑️ {t('prompts.clear') || '清空'}
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={() => { setEditingPrompt(null); setIsCloneMode(false); setShowModal(true) }}
              style={{ fontSize: 11, padding: '2px 7px', height: '28px', display: 'inline-flex', alignItems: 'center', gap: 2 }}
              title={t('prompts.addBtn') || '新建提示词'}
            >
              ➕ {t('prompts.customBtn') || '自定义'}
            </button>
          </div>
        )}
      </div>

      {/* ── 3 列 × 2 排 完美自适应分类网格（无论窗口多窄，6个分类 100% 全部完整可见，永不溢出、永不遮挡！） ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '4px',
          width: '100%',
          marginBottom: '5px'
        }}
      >
        {PROMPTS_CATEGORIES.map((c) => {
          const count = categoryCounts[c.id] || 0
          const name = t(c.nameKey) || c.defaultName
          return (
            <button
              key={c.id}
              className={`prompt-cat-pill ${activeCategory === c.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(c.id)}
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '3px 2px',
                fontSize: '11px',
                height: '24px',
                boxSizing: 'border-box'
              }}
            >
              <span>{c.emoji}</span>
              <span>{name}</span>
              <span className="prompt-cat-count">{count}</span>
            </button>
          )
        })}
      </div>

      {/* ── 提示词卡片流 ── */}
      <div className="prompt-grid">
        {filteredList.length === 0 ? (
          <div className="empty-state" style={{ padding: '36px 16px', gridColumn: '1 / -1' }}>
            <div className="empty-icon">
              {activeTab === 'favorites' ? '⭐' : (activeTab === 'recent' ? '🕒' : '💡')}
            </div>
            <div className="empty-title">
              {searchQuery
                ? (t('prompts.emptySearch') || '未找到匹配的提示词')
                : (activeTab === 'favorites' ? (t('prompts.emptyFavorites') || '暂无收藏的提示词') : (activeTab === 'recent' ? (t('prompts.emptyRecent') || '暂无最近使用的提示词') : (activeTab === 'custom' ? (t('prompts.emptyTitle') || '私有库暂无提示词') : (t('prompts.emptyCommunity') || '暂无提示词'))))}
            </div>
            <div className="empty-desc">
              {searchQuery
                ? (t('prompts.emptySearchDesc') || '尝试更换搜索关键词或切换分类')
                : (activeTab === 'favorites'
                    ? (t('prompts.emptyFavoritesDesc') || '在任意提示词卡片右上角点击「⭐ 收藏」，即可快速汇集常用角色！')
                    : (activeTab === 'recent'
                        ? (t('prompts.emptyRecentDesc') || '点击卡片「⚡ 极速使用」或「📋 复制」后，将自动在此记录！')
                        : (t('prompts.emptyCustomDesc') || '点击右上角「➕ 自定义」创建专属提示词，或在精选库中点击「⎘ 克隆魔改」')))}
            </div>
          </div>
        ) : (
          visibleList.map((item) => {
            const itemId = item.id || item.name;
            const isFav = favorites.includes(itemId);
            const catObj = PROMPTS_CATEGORIES.find((c) => c.id === item.category);
            const isCustom = prompts.some((p) => p.id === item.id);
            const loc = getLocalizedPrompt(item, currentLang);
            const displayTitle = loc.name;
            const displayDesc = loc.desc;
            const displayPrompt = loc.prompt;

            return (
              <div key={itemId} className="prompt-card-v2">
                <div className="prompt-card-top">
                  <div className="prompt-card-title-group">
                    <span className="prompt-card-icon">{item.emoji || '💡'}</span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="prompt-card-heading">
                        <span className="prompt-card-name-text">{displayTitle}</span>
                      </div>
                      {displayDesc && <div className="prompt-card-desc-text">{displayDesc}</div>}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {item.category && (
                      <span className="prompt-cat-tag">
                        {catObj ? `${catObj.emoji} ${t(catObj.nameKey) || catObj.defaultName}` : `🏷️ ${item.category}`}
                      </span>
                    )}
                    {/* ⭐ 收藏按钮 */}
                    <button
                      className={`prompt-star-btn ${isFav ? 'starred' : ''}`}
                      onClick={() => toggleFavorite(item)}
                      title={isFav ? (t('actions.delete') || '取消收藏') : (t('prompts.favoritesTab') || '收藏')}
                    >
                      {isFav ? '⭐' : '☆'}
                    </button>
                  </div>
                </div>

                <div className="prompt-card-content-box" title={displayPrompt}>
                  {displayPrompt}
                </div>

                <div className="prompt-card-actions">
                  {/* ⚡ 极速使用 */}
                  <button
                    className="btn btn-primary prompt-act-btn use-btn"
                    onClick={() => handleUsePrompt(item)}
                    title={t('prompts.useInNativeTip') || '载入极速助手对话'}
                  >
                    ⚡ {t('prompts.useNativeBtn') || '极速使用'}
                  </button>

                  {/* ⎘ 克隆魔改到私有库 */}
                  <button
                    className="btn btn-secondary prompt-act-btn clone-btn"
                    onClick={() => {
                      setEditingPrompt(item)
                      setIsCloneMode(true)
                      setShowModal(true)
                    }}
                    title={t('prompts.cloneTitle') || '基于此设定克隆并魔改到我的私有库'}
                  >
                    ⎘ {t('prompts.cloneBtn') || '克隆魔改'}
                  </button>

                  {isCustom && (
                    <>
                      <button
                        className="btn btn-secondary prompt-act-btn edit-btn"
                        onClick={() => {
                          setEditingPrompt(item)
                          setIsCloneMode(false)
                          setShowModal(true)
                        }}
                        title={t('actions.edit') || '编辑'}
                      >
                        ✏️
                      </button>
                      <button
                        className="btn btn-ghost prompt-act-btn delete-btn"
                        onClick={() => handleDelete(item.id)}
                        title={t('actions.delete') || '删除'}
                      >
                        ✕
                      </button>
                    </>
                  )}

                  <button
                    className="btn btn-ghost prompt-act-btn copy-btn"
                    onClick={() => handleCopyPrompt(item)}
                    title={t('actions.copy') || '复制'}
                  >
                    📋
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── 列表分页加载更多按钮 ── */}
      {filteredList.length > displayLimit && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <button
            className="btn btn-secondary"
            style={{
              fontSize: 11.5,
              padding: '6px 18px',
              borderRadius: 20,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-strong)'
            }}
            onClick={() => setDisplayLimit((prev) => prev + 25)}
          >
            <span>📥 {t('prompts.loadMore') || '加载更多角色'}</span>
            <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>
              {t('prompts.loadMoreCount', { visible: visibleList.length, total: filteredList.length }) || `(已展示 ${visibleList.length} / 共 ${filteredList.length} 条)`}
            </span>
          </button>
        </div>
      )}

      {/* ── 新建/编辑/克隆弹窗 ── */}
      {showModal && (
        <PromptModal
          prompt={editingPrompt}
          isClone={isCloneMode}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingPrompt(null); setIsCloneMode(false) }}
          t={t}
        />
      )}
    </div>
  )
}
