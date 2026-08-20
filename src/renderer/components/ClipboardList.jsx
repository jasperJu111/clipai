import { useState, useCallback } from 'react'

function formatTime(iso, t) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now - d) / 1000)
  if (diff < 60) return t ? t('clipboard.justNow') : '刚刚'
  if (diff < 3600) return t ? t('clipboard.minutesAgo', { m: Math.floor(diff / 60) }) : `${Math.floor(diff / 60)} 分钟前`
  if (diff < 86400) return t ? t('clipboard.hoursAgo', { h: Math.floor(diff / 3600) }) : `${Math.floor(diff / 3600)} 小时前`
  return d.toLocaleDateString()
}

function detectType(text) {
  if (/^https?:\/\//i.test(text)) return { tag: '🔗 Link', cls: '' }
  if (/^[\w._%+-]+@[\w.-]+\.[a-z]{2,}$/i.test(text)) return { tag: '📧 Email', cls: '' }
  if (/^\{[\s\S]*\}$|^\[[\s\S]*\]$/.test(text.trim())) return { tag: '{ } JSON', cls: 'code' }
  if (text.split('\n').length > 3 || /function|const |let |var |import |def |class /.test(text)) {
    return { tag: '</> Code', cls: 'code' }
  }
  return null
}

export default function ClipboardList({
  history,
  search,
  selectedItem,
  onSelect,
  onUseInAI,
  onSendToAimakeX,
  onUpdate,
  onPreviewImage,
  showToast,
  t
}) {
  const [copiedId, setCopiedId] = useState(null)

  const handleCopy = useCallback(
    async (e, item) => {
      e.stopPropagation()
      await window.clipai.copyToClipboard(item)
      setCopiedId(item.id)
      showToast(t ? t('actions.copied') : '已复制到剪贴板', '✅')
      setTimeout(() => setCopiedId(null), 1500)
    },
    [showToast, t]
  )

  const handleDelete = useCallback(
    async (e, id) => {
      e.stopPropagation()
      try {
        const res = await window.clipai.deleteItem(id)
        if (res && res.success && Array.isArray(res.history)) {
          onUpdate(res.history)
        } else if (Array.isArray(res)) {
          onUpdate(res)
        } else {
          showToast(res?.error || (t ? t('actions.deleteFailed') : '删除失败'), '❌')
        }
      } catch (err) {
        showToast(err.message || (t ? t('actions.deleteFailed') : '删除失败'), '❌')
      }
    },
    [onUpdate, showToast, t]
  )

  const handleFavorite = useCallback(
    async (e, id) => {
      e.stopPropagation()
      try {
        const res = await window.clipai.toggleFavorite(id)
        if (res && res.success && Array.isArray(res.history)) {
          onUpdate(res.history)
        } else if (Array.isArray(res)) {
          onUpdate(res)
        } else {
          showToast(res?.error || (t ? t('actions.favoriteFailed') : '收藏操作失败'), '❌')
        }
      } catch (err) {
        showToast(err.message || (t ? t('actions.favoriteFailed') : '收藏操作失败'), '❌')
      }
    },
    [onUpdate, showToast, t]
  )

  if (history.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">📋</div>
        <div className="empty-title">{search ? 'No matches found' : (t ? t('clipboard.emptyTitle') : '剪贴板历史为空')}</div>
        <div className="empty-desc">
          {search
            ? `No records matching "${search}"`
            : (t ? t('clipboard.emptyDesc') : '复制任何内容后会自动出现在这里\n支持文本、图片等多种格式')}
        </div>
      </div>
    )
  }

  // 分组：收藏 + 普通
  const favorites = history.filter((i) => i.favorite)
  const others = history.filter((i) => !i.favorite)

  const renderItem = (item) => {
    const isCopied = copiedId === item.id
    const isSelected = selectedItem?.id === item.id
    const textType = item.type === 'text' ? detectType(item.content) : null

    return (
      <div
        key={item.id}
        className={`clip-item ${isSelected ? 'active' : ''} ${item.favorite ? 'favorite' : ''}`}
        onClick={() => {
          onSelect(isSelected ? null : item)
          if (item.type === 'image' && onPreviewImage) {
            onPreviewImage(item)
          }
        }}
        onDoubleClick={(e) => handleCopy(e, item)}
      >
        {/* 类型图标 */}
        <div className="clip-type-icon">
          {item.type === 'image'
            ? item.isScreenshot
              ? '📸'
              : '🖼️'
            : textType?.tag?.startsWith('🔗')
            ? '🔗'
            : textType?.tag?.startsWith('📧')
            ? '📧'
            : textType?.tag?.startsWith('{')
            ? '{ }'
            : textType?.tag?.startsWith('</')
            ? '</>'
            : '📝'}
        </div>

        {/* 内容主体 */}
        <div className="clip-body">
          {item.type === 'text' ? (
            <div className={`clip-text ${textType?.cls || ''}`}>{item.preview || item.content}</div>
          ) : (
            <div
              style={{ position: 'relative', cursor: 'zoom-in' }}
              onClick={(e) => {
                e.stopPropagation()
                if (onPreviewImage) onPreviewImage(item)
              }}
              title={t ? t('actions.filterImage') : 'Image'}
            >
              <img
                src={item.thumbnail || item.content}
                className="clip-image-thumb"
                alt="Image"
                loading="lazy"
              />
              <div
                style={{
                  position: 'absolute',
                  right: 6,
                  bottom: 6,
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  borderRadius: 4,
                  padding: '2px 5px',
                  fontSize: 10,
                  backdropFilter: 'blur(4px)'
                }}
              >
                🔍 {t ? t('actions.filterImage') : 'Image'}
              </div>
            </div>
          )}

          <div className="clip-meta">
            <span className="clip-time">{formatTime(item.timestamp, t)}</span>
            {item.isScreenshot && <span className="clip-tag screenshot">📸 Screenshot</span>}
            {textType && !item.isScreenshot && (
              <span className="clip-tag">{textType.tag}</span>
            )}
          </div>
        </div>


        {/* 操作按钮 */}
        <div className="clip-actions">
          <button
            className={`clip-action-btn ${item.favorite ? 'fav-active' : ''}`}
            onClick={(e) => handleFavorite(e, item.id)}
            title={item.favorite ? (t ? t('actions.unfavorite') : '取消收藏') : (t ? t('actions.favorite') : '收藏')}
          >
            {item.favorite ? '⭐' : '☆'}
          </button>
          <button
            className="clip-action-btn"
            onClick={(e) => {
              e.stopPropagation()
              onUseInAI(item)
            }}
            title={t ? t('tabs.ai') : 'AI 助手'}
          >
            ✨
          </button>
          <button
            className={`clip-action-btn ${isCopied ? 'copy-ok' : ''}`}
            onClick={(e) => handleCopy(e, item)}
            title={t ? t('actions.copy') : '复制'}
          >
            {isCopied ? '✓' : '⎘'}
          </button>
          <button
            className="clip-action-btn delete"
            onClick={(e) => handleDelete(e, item.id)}
            title={t ? t('actions.delete') : '删除'}
          >
            ✕
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="clip-list">
      {/* 收藏区 */}
      {favorites.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">{t ? t('actions.filterFavorite') : '⭐ 收藏'}</span>
          </div>
          {favorites.map(renderItem)}
          <div className="divider" style={{ margin: '6px 0' }} />
        </>
      )}

      {/* 最近记录 */}
      {others.length > 0 && (
        <>
          {favorites.length > 0 && (
            <div className="section-header">
              <span className="section-title">🕐 {t ? t('tabs.history') : '最近'}</span>
            </div>
          )}
          {others.map(renderItem)}
        </>
      )}
    </div>
  )
}

