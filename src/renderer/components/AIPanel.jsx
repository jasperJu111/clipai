import { useState, useEffect, useRef, useMemo } from 'react'
import AimakeXPanel from './AimakeXPanel'
import PromptManager from './PromptManager'
import MarkdownView from './MarkdownView'
import { buildChatMessages } from '../../shared/aiUtils.js'

const TRANSLATE_LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸', prompt: 'Please translate the following text into natural, fluent, and idiomatic English:' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', prompt: '以下の文章を自然で流暢な日本語に翻訳してください：' },
  { code: 'ko', name: '한국어', flag: '🇰🇷', prompt: '다음 내용을 자연스럽고 매끄러운 한국어로 번역해 주세요:' },
  { code: 'zh-CN', name: '简体中文', flag: '🇨🇳', prompt: '请将以下内容精准翻译为通顺地道的简体中文：' },
  { code: 'zh-TW', name: '繁體中文', flag: '🇹🇼', prompt: '請將以下內容精準翻譯為流暢地道的繁體中文：' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', prompt: 'Veuillez traduire le texte suivant en français courant et élégant :' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', prompt: 'Bitte übersetzen Sie den folgenden Text in fließendes und natürliches Deutsch:' },
  { code: 'es', name: 'Español', flag: '🇪🇸', prompt: 'Por favor, traduzca el siguiente texto al español natural y fluido:' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', prompt: 'Пожалуйста, переведите следующий текст на естественный и грамотный русский язык:' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭', prompt: 'โปรดแปลข้อความต่อไปนี้เป็นภาษาไทยที่สละสลวย:' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', prompt: 'يرجى ترجمة النص التالي إلى لغة عربية فصحى وسلسة:' }
]

export default function AIPanel({ settings, selectedItem, prompts, onUpdatePrompts, activePromptPreset, onClearActivePromptPreset, onNavigateTab, showToast, t = (k) => k }) {
  const [aiSubMode, setAiSubMode] = useState('native') // 'native' | 'aimakex' | 'prompts'
  const [pendingAimakeXText, setPendingAimakeXText] = useState(null)
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedPromptId, setSelectedPromptId] = useState('')
  const [expandedCardIds, setExpandedCardIds] = useState({})

  const toggleExpand = (id) => {
    setExpandedCardIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const [multiTurnEnabled, setMultiTurnEnabled] = useState(true)
  const [topicSessionTime, setTopicSessionTime] = useState(0)
  const [bottomText, setBottomText] = useState('')
  const [replyTarget, setReplyTarget] = useState(null)
  const topInputRef = useRef(null)
  const bottomInputRef = useRef(null)

  // 当外部传入提示词预设时自动分发到对应引擎
  useEffect(() => {
    if (activePromptPreset?.prompt) {
      if (activePromptPreset.target === 'aimakex') {
        setPendingAimakeXText(activePromptPreset.prompt)
        setAiSubMode('aimakex')
      } else {
        setInputText(activePromptPreset.prompt)
        setAiSubMode('native')
        setError(null)
        topInputRef.current?.focus()
      }
      onClearActivePromptPreset?.()
    }
  }, [activePromptPreset, onClearActivePromptPreset])

  // 🌐 翻译目标语言选择状态（支持持久化记忆）
  const [targetLangCode, setTargetLangCode] = useState(() => {
    try {
      return localStorage.getItem('clipai_translate_lang') || 'en'
    } catch {
      return 'en'
    }
  })
  const [showLangDropdown, setShowLangDropdown] = useState(false)
  const [catFilter, setCatFilter] = useState('all') // 'all' | 'writing' | 'code'
  const [cardInputs, setCardInputs] = useState({})
  const langMenuRef = useRef(null)

  // 💬 对话历史记录列表，永久保存到 localStorage
  const [chatHistory, setChatHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('clipai_ai_chat_history') || '[]')
    } catch {
      return []
    }
  })

  const messagesEndRef = useRef(null)

  // 点击外部关闭语言下拉
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
        setShowLangDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 状态自动持久化
  useEffect(() => {
    try {
      localStorage.setItem('clipai_ai_chat_history', JSON.stringify(chatHistory))
    } catch {}
  }, [chatHistory])

  const currentLang = TRANSLATE_LANGUAGES.find((l) => l.code === targetLangCode) || TRANSLATE_LANGUAGES[0]

  const OTHER_PROMPTS = [
    { id: 'polish', emoji: '✨', category: 'writing', name: t('aiPanel.polish'), prompt: '请对以下内容进行深度专业润色与语言润饰，提升表达的清晰度、专业度与地道感：' },
    { id: 'summarize', emoji: '📝', category: 'writing', name: t('aiPanel.summarize'), prompt: '请精炼提炼以下内容的核心要点，使用结构清晰的要点列表 (Bullet Points) 呈现：' },
    { id: 'grammar_check', emoji: '🔍', category: 'writing', name: t('aiPanel.grammarCheck'), prompt: '请对以下文本进行严谨的语法、错别字、标点与标号校对，指出错误并给出修改后的完整文本：' },
    { id: 'reply_draft', emoji: '✉️', category: 'writing', name: t('aiPanel.replyDraft'), prompt: '请根据以下内容，撰写一份得体、礼貌、专业且结构清晰的回复或邮件草案：' },
    { id: 'expand_text', emoji: '🎯', category: 'writing', name: t('aiPanel.expandText'), prompt: '请在保留核心主旨的前提下，对以下内容进行充分扩写与丰富细节，增强说服力与表达深度：' },
    { id: 'explain_code', emoji: '💡', category: 'code', name: t('aiPanel.explain'), prompt: '请通俗易懂地深度解析以下代码或技术概念的核心逻辑、工作原理与关键注意点：' },
    { id: 'fix_code', emoji: '🐞', category: 'code', name: t('aiPanel.fixCode'), prompt: '请排查并修复以下代码中的潜在 Bug、边界条件或安全漏洞，并提供修复后的完整代码与修改说明：' },
    { id: 'optimize_code', emoji: '⚡', category: 'code', name: t('aiPanel.optimizeCode'), prompt: '请对以下代码进行重构与性能优化，遵循最佳实践，提升可读性与执行效率：' },
    { id: 'format_table', emoji: '📊', category: 'code', name: t('aiPanel.formatTable'), prompt: '请将以下零散或杂乱的数据/文本，整理规范为整洁美观的 Markdown 表格或标准 JSON 格式：' }
  ]

  // 当选中项变化时自动填入文本
  useEffect(() => {
    if (selectedItem?.type === 'text') {
      setInputText(selectedItem.content)
      setError(null)
    }
  }, [selectedItem])

  // 开启全新独立话题（清空上下文记忆干扰）
  const handleNewTopic = () => {
    setTopicSessionTime(Date.now())
    setReplyTarget(null)
    setInputText('')
    setBottomText('')
    setError(null)
    showToast('✨ 已开启新话题，后续提问将从全新上下文开始', '✨')
    topInputRef.current?.focus()
  }

  // 会话分组：只有同一个 sessionId 的多次追问才聚合在同一个对话卡片框框中
  const sessionThreads = useMemo(() => {
    if (chatHistory.length === 0) return []
    const sorted = [...chatHistory].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    const map = new Map()

    sorted.forEach((item) => {
      // 如果没有 sessionId，则以自身 id 作为独立会话，绝不混淆不同的独立提问
      const sId = item.sessionId || `session_${item.id}`
      if (!map.has(sId)) {
        map.set(sId, {
          id: sId,
          turns: [],
          latestTimestamp: item.timestamp
        })
      }
      const s = map.get(sId)
      s.turns.push(item)
      s.latestTimestamp = item.timestamp
    })

    return Array.from(map.values()).reverse()
  }, [chatHistory])

  // 统计当前选中的或最新会话轮数
  const activeTopicTurns = multiTurnEnabled && sessionThreads.length > 0 ? sessionThreads[0].turns.length : 0

  const sendQuestion = async (promptPrefix, questionText, targetSessionId) => {
    const text = (questionText !== undefined ? questionText : inputText).trim()
    if (!text) {
      setError(t('aiPanel.selectItemPrompt') || '请先输入内容或在历史列表中选择一条记录')
      return
    }

    const provider = settings?.provider || settings?.aiProvider || 'gemini'
    const providerConfigs = settings?.providerConfigs || {}
    const currentProviderConfig = providerConfigs[provider] || {}
    const hasConfiguredKey = Boolean(
      (currentProviderConfig.apiKey && currentProviderConfig.apiKey.trim()) ||
      (settings?.apiKey && settings?.apiKey.trim()) ||
      settings?.[`${provider}ApiKey`]
    )
    const isLocal = provider === 'ollama' || provider === 'lmstudio'

    if (!isLocal && !hasConfiguredKey && provider !== 'custom') {
      setError(t('aiPanel.noApiKeyWarning') || '请先在「设置」中配置 API Key 才能使用 AI 功能')
      return
    }

    setLoading(true)
    setError(null)

    const newChatId = Date.now().toString()
    // 如果是从卡片内追问，沿用该卡片的 targetSessionId；如果从顶部/快捷按钮提问，则开启全新的独立会话卡片！
    const activeSessionId = targetSessionId || `session_${newChatId}`

    const newRecord = {
      id: newChatId,
      sessionId: activeSessionId,
      timestamp: new Date().toISOString(),
      question: text,
      promptTitle: promptPrefix ? '快捷处理' : (targetSessionId ? '连续追问' : '直接提问'),
      answer: '',
      loading: true
    }

    setChatHistory((prev) => [newRecord, ...prev])

    // 提取当前 session 最近最多 8 条有效历史（按时间正序）
    let validHistory = []
    if (targetSessionId && chatHistory.length > 0) {
      validHistory = chatHistory
        .filter((item) => item.sessionId === activeSessionId && item.answer && !item.error && item.question)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
        .slice(-8)
    }

    const aiPayload = buildChatMessages(promptPrefix, text, validHistory)

    try {
      const res = await window.clipai?.aiRequest({
        provider,
        model: currentProviderConfig.model || (provider === 'gemini' ? settings?.geminiModel : (provider === 'openai' ? settings?.openaiModel : '')),
        customBaseUrl: currentProviderConfig.customBaseUrl,
        ...aiPayload
      })

      if (res && res.success) {
        const finalContent = res.result || '无返回结果'
        setChatHistory((prev) =>
          prev.map((c) => (c.id === newChatId ? { ...c, answer: finalContent, loading: false } : c))
        )
      } else {
        const errMsg = res?.error || '生成失败，请检查网络或 API Key 设置'
        setChatHistory((prev) =>
          prev.map((c) => (c.id === newChatId ? { ...c, answer: `❌ ${errMsg}`, error: true, loading: false } : c))
        )
        setError(errMsg)
      }
    } catch (err) {
      const errMsg = err.message || '生成失败，请检查网络或 API Key 设置'
      setChatHistory((prev) =>
        prev.map((c) => (c.id === newChatId ? { ...c, answer: `❌ ${errMsg}`, error: true, loading: false } : c))
      )
      setError(errMsg)
    } finally {
      setLoading(false)
      setReplyTarget(null)
    }
  }

  const handleFollowUp = (item) => {
    setReplyTarget(item)
    if (bottomInputRef.current) {
      bottomInputRef.current.focus()
    } else if (topInputRef.current) {
      topInputRef.current.focus()
    }
    showToast(`正在追问此回答...`, '💬')
  }

  const copyAnswer = (text) => {
    if (window.clipai?.copyToClipboard) {
      window.clipai.copyToClipboard({ type: 'text', content: text })
    } else {
      navigator.clipboard?.writeText(text)
    }
    showToast(t('aiPanel.copied') || '已复制到剪贴板', '📋')
  }

  const quoteAsInput = (text) => {
    setInputText(text)
    showToast(t('aiPanel.useSelected') || '已引用为新输入', '↩️')
  }

  const clearHistory = () => {
    setChatHistory([])
    try {
      localStorage.removeItem('clipai_ai_chat_history')
    } catch {}
    showToast(t('aiPanel.clearChat') || '对话记录已清空', '🗑️')
  }

  const deleteChatRecord = (id) => {
    setChatHistory((prev) => prev.filter((c) => c.id !== id))
  }

  const handleSelectPrompt = (e) => {
    const promptId = e.target.value
    setSelectedPromptId(promptId)
    const found = prompts?.find((p) => p.id === promptId)
    if (found && inputText.trim()) {
      sendQuestion(found.prompt, inputText)
    }
  }

  const formatTime = (iso) => {
    try {
      const d = new Date(iso)
      const now = new Date()
      const diffSec = Math.floor((now - d) / 1000)
      if (diffSec < 60) return t('clipboard.justNow')
      if (diffSec < 3600) return t('clipboard.minutesAgo', { m: Math.floor(diffSec / 60) })
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  return (
    <div className="ai-panel">
      {/* ── AI 统一子工作台切换胶囊 ── */}
      <div className="ai-mode-switcher-bar">
        <div className="ai-mode-capsule-switch">
          <button
            className={`ai-mode-capsule-btn ${aiSubMode === 'native' ? 'active' : ''}`}
            onClick={() => setAiSubMode('native')}
          >
            <span>⚡</span>
            <span>{t('aiPanel.subTabNative') || '极速助手'}</span>
          </button>
          <button
            className={`ai-mode-capsule-btn ${aiSubMode === 'aimakex' ? 'active' : ''}`}
            onClick={() => setAiSubMode('aimakex')}
          >
            <span>🐱</span>
            <span>{t('aiPanel.subTabAimakeX') || '智造喵'}</span>
          </button>
          <button
            className={`ai-mode-capsule-btn ${aiSubMode === 'prompts' ? 'active' : ''}`}
            onClick={() => setAiSubMode('prompts')}
          >
            <span>💡</span>
            <span>{t('aiPanel.subTabPrompts') || '提示词库'}</span>
          </button>
        </div>
      </div>

      {aiSubMode === 'aimakex' ? (
        <AimakeXPanel
          pendingText={pendingAimakeXText}
          onClearPendingText={() => setPendingAimakeXText(null)}
          showToast={showToast}
          t={t}
        />
      ) : aiSubMode === 'prompts' ? (
        <PromptManager
          prompts={prompts}
          onUseInAI={(preset, target = 'native') => {
            if (target === 'aimakex') {
              setPendingAimakeXText(preset.prompt)
              setAiSubMode('aimakex')
            } else {
              setInputText(preset.prompt)
              setAiSubMode('native')
            }
          }}
          onUpdate={onUpdatePrompts}
          showToast={showToast}
          t={t}
        />
      ) : (
        <>
          {/* ── 输入文本区 ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="panel-label">{t('aiPanel.inputLabel') || '指令与输入'}</span>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {inputText && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--text-muted)' }}
                    onClick={() => setInputText('')}
                    title={t('aiPanel.clearInput')}
                  >
                    ✕ {t('aiPanel.clearInput')}
                  </button>
                )}
                {selectedItem?.type === 'text' && selectedItem.content !== inputText && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--accent)' }}
                    onClick={() => setInputText(selectedItem.content)}
                  >
                    📋 {t('aiPanel.useSelected')}
                  </button>
                )}
              </div>
            </div>

            <textarea
              ref={topInputRef}
              className="ai-textarea"
              rows={3}
              placeholder={t('aiPanel.inputPlaceholder') || '输入给 AI 的指令或要求 (按 ⌘+Enter 快速发送)...'}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  sendQuestion(null, inputText)
                }
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {inputText.length} {t('clipboard.chars', { count: '' })}
              </span>
              <button
                className="btn btn-primary"
                onClick={() => sendQuestion(null, inputText)}
                disabled={loading || !inputText.trim()}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', fontSize: '12px' }}
              >
                {loading ? (
                  <>
                    <span className="spinner" style={{ width: 12, height: 12 }} />
                    <span>{t('aiPanel.generating')}</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>{replyTarget ? '发送追问' : (t('aiPanel.sendBtn') || '发送生成')}</span>
                    <span style={{ fontSize: '10px', opacity: 0.7 }}>(⌘↵)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(255, 69, 58, 0.1)',
                border: '1px solid rgba(255, 69, 58, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--danger)',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8
              }}
            >
              <span>⚠️ {error}</span>
              {error.includes('API Key') && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '11px', padding: '2px 6px', color: 'var(--accent)' }}
                  onClick={() => {
                    if (onNavigateTab) {
                      onNavigateTab('settings')
                    } else {
                      const settingsBtn = document.querySelector('[data-tab="settings"]')
                      if (settingsBtn) settingsBtn.click()
                    }
                  }}
                >
                  {t('aiPanel.goToSettings') || '前往设置'} →
                </button>
              )}
            </div>
          )}

          {/* ── 快捷提示词工具组 ── */}
          <div>
            <div className="quick-actions-header">
              <span className="panel-label">{t('aiPanel.quickActions')}</span>
              {/* 分类过滤器胶囊 */}
              <div className="quick-cat-group">
                <button
                  className={`quick-cat-btn ${catFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setCatFilter('all')}
                >
                  {t('aiPanel.catAll') || '全部'}
                </button>
                <button
                  className={`quick-cat-btn ${catFilter === 'writing' ? 'active' : ''}`}
                  onClick={() => setCatFilter('writing')}
                >
                  ✍️ {t('aiPanel.catWriting') || '写作办公'}
                </button>
                <button
                  className={`quick-cat-btn ${catFilter === 'code' ? 'active' : ''}`}
                  onClick={() => setCatFilter('code')}
                >
                  💻 {t('aiPanel.catCode') || '编程开发'}
                </button>
              </div>
            </div>

            <div className="quick-actions">
              {/* 🌐 智能分流胶囊翻译按钮 */}
              {(catFilter === 'all' || catFilter === 'writing') && (
                <div className="translate-split-capsule" ref={langMenuRef}>
                  <button
                    className="quick-btn translate-main-btn"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}
                    onClick={() => sendQuestion(currentLang.prompt, inputText)}
                    disabled={loading || !inputText.trim()}
                    title={inputText.trim() ? `翻译为 ${currentLang.name}` : (t('aiPanel.inputPlaceholder') || '输入指令...')}
                  >
                    <span className="quick-btn-icon">{currentLang.flag}</span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {targetLangCode === 'en' ? (t('aiPanel.translateEn') || '翻译为英文') : `翻译为 ${currentLang.name}`}
                    </span>
                  </button>

                  <button
                    className="quick-btn translate-arrow-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowLangDropdown((prev) => !prev)
                    }}
                    title="选择目标翻译语言"
                  >
                    <span
                      style={{
                        fontSize: 10,
                        transform: showLangDropdown ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s ease',
                        display: 'inline-block'
                      }}
                    >
                      ▾
                    </span>
                  </button>

                  {/* 🌐 语言快速选择浮层 */}
                  {showLangDropdown && (
                    <div className="translate-lang-popover">
                      <div className="translate-lang-popover-title">选择目标语言</div>
                      <div className="translate-lang-grid">
                        {TRANSLATE_LANGUAGES.map((lang) => (
                          <div
                            key={lang.code}
                            className={`translate-lang-item ${targetLangCode === lang.code ? 'active' : ''}`}
                            onClick={() => {
                              setTargetLangCode(lang.code)
                              try {
                                localStorage.setItem('clipai_translate_lang', lang.code)
                              } catch {}
                              setShowLangDropdown(false)
                              if (inputText.trim() && !loading) {
                                sendQuestion(lang.prompt, inputText)
                              }
                            }}
                          >
                            <span>{lang.flag}</span>
                            <span>{lang.name}</span>
                            {targetLangCode === lang.code && (
                              <span style={{ marginLeft: 'auto', color: 'var(--accent)' }}>✓</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 其余 9 大黄金预设按钮 */}
              {OTHER_PROMPTS.filter((p) => catFilter === 'all' || p.category === catFilter).map((p) => (
                <button
                  key={p.id}
                  className="quick-btn"
                  onClick={() => sendQuestion(p.prompt, inputText)}
                  disabled={loading || !inputText.trim()}
                  title={inputText.trim() ? p.name : (t('aiPanel.inputPlaceholder') || '输入指令...')}
                >
                  <span className="quick-btn-icon">{p.emoji}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── 自定义提示词下拉选择 ── */}
          {prompts && prompts.length > 0 && (
            <div className="custom-prompt-row">
              <select
                className="prompt-select"
                value={selectedPromptId}
                onChange={handleSelectPrompt}
                disabled={loading || !inputText.trim()}
              >
                <option value="">💡 {t('aiPanel.selectPrompt')}</option>
                {prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.emoji || '💡'} {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── 对话历史记录列表 ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="panel-label">
                  {t('aiPanel.chatHistory', { count: chatHistory.length })}
                </span>
                {activeTopicTurns > 0 && (
                  <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    (当前话题共 {activeTopicTurns} 轮)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {activeTopicTurns > 0 && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--accent)' }}
                    onClick={handleNewTopic}
                    title="开启新话题"
                  >
                    ➕ 新话题
                  </button>
                )}
                {chatHistory.length > 0 && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--text-muted)' }}
                    onClick={clearHistory}
                  >
                    🗑️ {t('aiPanel.clearChat')}
                  </button>
                )}
              </div>
            </div>

            {sessionThreads.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <div className="empty-icon" style={{ fontSize: '28px' }}>💬</div>
                <div className="empty-title" style={{ fontSize: '13px' }}>{t('aiPanel.emptyHistory')}</div>
                <div className="empty-desc" style={{ fontSize: '11px' }}>
                  {t('aiPanel.emptyHistoryDesc')}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sessionThreads.map((thread) => {
                  return (
                    <div key={thread.id} className="ai-bot-card ai-unified-thread-card">
                      {/* 顶部标题栏 */}
                      <div className="ai-bot-card-header">
                        <div className="ai-bot-meta">
                          <span className="ai-bot-avatar">🤖</span>
                          <span className="ai-bot-title">AI 对话</span>
                          <span className="ai-bot-badge">{thread.turns.length} 轮对话</span>
                          <span className="ai-bot-time">{formatTime(thread.latestTimestamp)}</span>
                        </div>

                        <div className="ai-bot-actions">
                          <button
                            className="ai-micro-btn delete"
                            onClick={() => {
                              const turnIds = new Set(thread.turns.map((t) => t.id))
                              setChatHistory((prev) => prev.filter((c) => !turnIds.has(c.id)))
                            }}
                            title="删除本会话记录"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* 轮次流（正序排列：问题1 -> 回答1 -> 问题2 -> 回答2 ... 都在同一个框框内向下延伸） */}
                      <div className="ai-thread-turns-container">
                        {thread.turns.map((turn, tIdx) => {
                          const answerText = turn.answer || ''
                          const isLong = answerText.length > 180 || answerText.split('\n').length > 5
                          const isExpanded = !!expandedCardIds[turn.id]

                          return (
                            <div key={turn.id} className="ai-thread-turn-item">
                              {/* 👤 用户提问气泡 */}
                              <div className="ai-user-bubble-row">
                                <div className="ai-user-bubble" title={turn.question}>
                                  <span className="ai-user-icon">👤</span>
                                  <span className="ai-user-text">{turn.question}</span>
                                </div>
                              </div>

                              {/* 🤖 AI 回答内容 */}
                              <div className="ai-turn-ai-reply">
                                {turn.loading && !turn.answer ? (
                                  <div className="ai-loading-state">
                                    <span className="spinner" style={{ width: 12, height: 12 }} />
                                    <span>{t('aiPanel.generating') || 'AI 思考生成中...'}</span>
                                  </div>
                                ) : (
                                  <div className={`ai-bot-content-wrapper ${isLong && !isExpanded ? 'collapsed' : ''}`}>
                                    <MarkdownView content={turn.answer} />
                                    {isLong && !isExpanded && <div className="ai-chat-fade-overlay" />}
                                  </div>
                                )}

                                {isLong && !turn.loading && (
                                  <div className="ai-bot-card-footer" style={{ justifyContent: 'flex-start', paddingTop: 2 }}>
                                    <button
                                      className="ai-expand-toggle-btn"
                                      onClick={() => toggleExpand(turn.id)}
                                    >
                                      <span>{isExpanded ? '收起 ▴' : `展开全文 (${answerText.length}字) ▾`}</span>
                                    </button>
                                  </div>
                                )}

                                {!turn.loading && turn.answer && (
                                  <div className="ai-turn-actions-bar">
                                    <button
                                      className="ai-micro-btn"
                                      onClick={() => copyAnswer(turn.answer)}
                                      title={t('actions.copy') || '复制结果'}
                                    >
                                      ⎘
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* ── 💬 嵌入本边框最下方的继续追问输入框 ── */}
                      <div className="ai-card-reply-box">
                        <input
                          className="ai-card-reply-input"
                          placeholder="💬 在当前对话框内继续提问、追问方案或分析... (Enter 发送)"
                          value={cardInputs[thread.id] || ''}
                          onChange={(e) => setCardInputs((prev) => ({ ...prev, [thread.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.nativeEvent?.isComposing && !e.shiftKey) {
                              e.preventDefault()
                              const text = (cardInputs[thread.id] || '').trim()
                              if (text && !loading) {
                                sendQuestion(null, text, thread.id)
                                setCardInputs((prev) => ({ ...prev, [thread.id]: '' }))
                              }
                            }
                          }}
                        />
                        <button
                          className="btn btn-primary ai-card-reply-send"
                          onClick={() => {
                            const text = (cardInputs[thread.id] || '').trim()
                            if (text && !loading) {
                              sendQuestion(null, text, thread.id)
                              setCardInputs((prev) => ({ ...prev, [thread.id]: '' }))
                            }
                          }}
                          disabled={loading || !(cardInputs[thread.id] || '').trim()}
                          title="在当前对话框内发送追问 (Enter)"
                        >
                          {loading ? <span className="spinner" style={{ width: 11, height: 11 }} /> : '🚀 发送'}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </>
      )}
    </div>
  )
}
