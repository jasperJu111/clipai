import React from 'react'

/**
 * 轻量纯纯前端无依赖的高性能 Markdown 美化渲染器
 * 支持：标题(#~###)、加粗(**)、斜体(*)、行内代码(`code`)、多行代码块(```)、有序/无序列表、引用(>)、换行
 */
export default function MarkdownView({ content }) {
  if (!content) return null

  // 按行解析
  const lines = content.split('\n')
  const elements = []
  let inCodeBlock = false
  let codeBlockLines = []
  let codeBlockLang = ''

  const renderInline = (text, keyPrefix = 'inline') => {
    if (!text) return null

    // 匹配: 行内代码 `...`、加粗 **...**、斜体 *...*
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g
    const parts = text.split(regex)

    return parts.map((part, idx) => {
      const key = `${keyPrefix}-${idx}`
      if (!part) return null

      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
        return (
          <code key={key} className="md-inline-code">
            {part.slice(1, -1)}
          </code>
        )
      }
      if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
        return (
          <strong key={key} className="md-bold">
            {part.slice(2, -2)}
          </strong>
        )
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
        return (
          <em key={key} className="md-italic">
            {part.slice(1, -1)}
          </em>
        )
      }

      return <span key={key}>{part}</span>
    })
  }

  lines.forEach((line, lineIdx) => {
    const trimmed = line.trim()

    // 1. 代码块处理 ```
    if (trimmed.startsWith('```')) {
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockLang = trimmed.slice(3).trim()
        codeBlockLines = []
      } else {
        inCodeBlock = false
        const fullCode = codeBlockLines.join('\n')
        elements.push(
          <div key={`codeblock-${lineIdx}`} className="md-code-block-wrapper">
            {codeBlockLang && <div className="md-code-block-lang">{codeBlockLang}</div>}
            <pre className="md-code-block">
              <code>{fullCode}</code>
            </pre>
          </div>
        )
      }
      return
    }

    if (inCodeBlock) {
      codeBlockLines.push(line)
      return
    }

    // 2. 标题处理 #, ##, ###
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${lineIdx}`} className="md-h3">
          {renderInline(trimmed.slice(4), `h3-${lineIdx}`)}
        </h4>
      )
      return
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${lineIdx}`} className="md-h2">
          {renderInline(trimmed.slice(3), `h2-${lineIdx}`)}
        </h3>
      )
      return
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${lineIdx}`} className="md-h1">
          {renderInline(trimmed.slice(2), `h1-${lineIdx}`)}
        </h2>
      )
      return
    }

    // 3. 引用块 >
    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote key={`quote-${lineIdx}`} className="md-blockquote">
          {renderInline(trimmed.slice(2), `quote-${lineIdx}`)}
        </blockquote>
      )
      return
    }

    // 4. 无序列表 - 或 *
    if (/^[-*•]\s+/.test(trimmed)) {
      const listContent = trimmed.replace(/^[-*•]\s+/, '')
      elements.push(
        <div key={`list-${lineIdx}`} className="md-list-item">
          <span className="md-list-bullet">•</span>
          <span className="md-list-content">{renderInline(listContent, `list-${lineIdx}`)}</span>
        </div>
      )
      return
    }

    // 5. 有序列表 1. 2. 3.
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
    if (numMatch) {
      elements.push(
        <div key={`numlist-${lineIdx}`} className="md-list-item">
          <span className="md-list-number">{numMatch[1]}.</span>
          <span className="md-list-content">{renderInline(numMatch[2], `numlist-${lineIdx}`)}</span>
        </div>
      )
      return
    }

    // 6. 分割线 ---
    if (/^[-*_]{3,}$/.test(trimmed)) {
      elements.push(<hr key={`hr-${lineIdx}`} className="md-divider" />)
      return
    }

    // 7. 空行
    if (!trimmed) {
      elements.push(<div key={`empty-${lineIdx}`} className="md-empty-space" />)
      return
    }

    // 8. 普通段落
    elements.push(
      <p key={`p-${lineIdx}`} className="md-paragraph">
        {renderInline(line, `p-${lineIdx}`)}
      </p>
    )
  })

  // 如果未闭合的代码块
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <div key="codeblock-unclosed" className="md-code-block-wrapper">
        <pre className="md-code-block">
          <code>{codeBlockLines.join('\n')}</code>
        </pre>
      </div>
    )
  }

  return <div className="md-container">{elements}</div>
}
