export function buildChatMessages(promptPrefix, userInput, history = []) {
  const messages = []
  
  if (Array.isArray(history) && history.length > 0) {
    history.forEach((item) => {
      if (item && item.question && item.answer) {
        messages.push({ role: 'user', content: item.question })
        messages.push({ role: 'assistant', content: item.answer })
      }
    })
  }

  // 用户当前回合消息只包含原始用户输入文本，绝不拼接重复的 promptPrefix
  const cleanInput = typeof userInput === 'string' ? userInput.trim() : ''
  messages.push({ role: 'user', content: cleanInput })

  return {
    prompt: typeof promptPrefix === 'string' ? promptPrefix.trim() : '',
    text: cleanInput,
    messages
  }
}
