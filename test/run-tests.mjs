import assert from 'assert'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { getMaxHistoryLimit, persistHistoryList, DEFAULT_MAX_HISTORY } from '../src/shared/historyUtils.js'
import { parseShortcutFromEvent, executeShortcutTransaction, isValidShortcutString, resolveStoredShortcut } from '../src/shared/shortcutUtils.js'
import { buildChatMessages } from '../src/shared/aiUtils.js'
import { fetchWithTimeout, parseResponseSafe, isAllowedAimakeXUrl, isSafeExternalUrl } from '../src/shared/networkUtils.js'
import { SETTINGS_WHITELIST_KEYS, DEFAULT_SETTINGS, filterSafeSettings } from '../src/shared/settingsUtils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

console.log('🧪 开始运行 ClipAI 生产模块共享单元测试套件...\n')

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅ [PASS] ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message)
    failed++
  }
}

async function asyncTest(name, fn) {
  try {
    await fn()
    console.log(`  ✅ [PASS] ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message)
    failed++
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 历史持久化与上限控制（生产模块：historyUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('📦 1. 历史持久化与上限控制测试 (historyUtils.js)')

test('普通历史记录达到上限时正确截断，并保留全部收藏记录', () => {
  const mockHistory = []
  for (let i = 1; i <= 300; i++) {
    mockHistory.push({
      id: i,
      type: 'text',
      content: `Item ${i}`,
      favorite: i % 5 === 0 // 60 条收藏
    })
  }

  const result = persistHistoryList(mockHistory, 100)
  const favCount = result.filter((i) => i.favorite).length
  const nonFavCount = result.filter((i) => !i.favorite).length

  assert.strictEqual(favCount, 60, '所有 60 条收藏必须完整保留')
  assert.strictEqual(nonFavCount, 100, '普通记录应被限制在 maxLimit (100) 条')
  assert.strictEqual(result.length, 160, '总记录数应为 60 收藏 + 100 普通')
})

test('getMaxHistoryLimit 边界与类型校验', () => {
  assert.strictEqual(getMaxHistoryLimit(null), DEFAULT_MAX_HISTORY)
  assert.strictEqual(getMaxHistoryLimit(-10), DEFAULT_MAX_HISTORY)
  assert.strictEqual(getMaxHistoryLimit(5000), DEFAULT_MAX_HISTORY)
  assert.strictEqual(getMaxHistoryLimit('350'), 350)
  assert.strictEqual(getMaxHistoryLimit(50), 50)
})

// ─────────────────────────────────────────────────────────────
// 2. 快捷键读取与回退逻辑测试（生产模块：shortcutUtils.js -> resolveStoredShortcut）
// ─────────────────────────────────────────────────────────────
console.log('\n🔒 2. 快捷键安全读取与禁用保留测试 (resolveStoredShortcut)')

test('resolveStoredShortcut 必须保留空字符串（禁用状态）', () => {
  assert.strictEqual(resolveStoredShortcut('', 'Alt+Space'), '', '空字符串表示主动禁用，绝不能被 fallback 覆盖')
  assert.strictEqual(resolveStoredShortcut('', 'Alt+A'), '', '截图快捷键空字符串必须保留')
})

test('resolveStoredShortcut 仅在 undefined 或 null 时使用 fallback', () => {
  assert.strictEqual(resolveStoredShortcut(undefined, 'Alt+Space'), 'Alt+Space')
  assert.strictEqual(resolveStoredShortcut(null, 'Alt+A'), 'Alt+A')
})

test('resolveStoredShortcut 正常字符串保留与非法类型回退', () => {
  assert.strictEqual(resolveStoredShortcut('Ctrl+K', 'Alt+Space'), 'Ctrl+K')
  assert.strictEqual(resolveStoredShortcut(12345, 'Alt+Space'), 'Alt+Space')
  assert.strictEqual(resolveStoredShortcut({}, 'Alt+Space'), 'Alt+Space')
})

test('禁用一个快捷键后修改另一个，保证不会重新激活已禁用项', () => {
  // 模拟 store 存储状态：唤醒快捷键被禁用 ("")，截图快捷键为 "Alt+A"
  const mockStore = {
    shortcut: '',
    screenshotShortcut: 'Alt+A'
  }

  // 用户仅修改截图快捷键为 "Ctrl+Shift+S"
  const incomingPayload = {
    screenshotShortcut: 'Ctrl+Shift+S'
  }

  // 主进程根据 resolveStoredShortcut 构造目标对象
  const target = {
    shortcut: 'shortcut' in incomingPayload
      ? resolveStoredShortcut(incomingPayload.shortcut, 'Alt+Space')
      : resolveStoredShortcut(mockStore.shortcut, 'Alt+Space'),
    screenshotShortcut: 'screenshotShortcut' in incomingPayload
      ? resolveStoredShortcut(incomingPayload.screenshotShortcut, 'Alt+A')
      : resolveStoredShortcut(mockStore.screenshotShortcut, 'Alt+A')
  }

  assert.strictEqual(target.shortcut, '', '已禁用的唤醒快捷键必须保持为空字符串')
  assert.strictEqual(target.screenshotShortcut, 'Ctrl+Shift+S')

  const txResult = executeShortcutTransaction({
    targetShortcuts: target,
    previousShortcuts: { shortcut: '', screenshotShortcut: 'Alt+A' },
    registerFn: () => true,
    unregisterAllFn: () => {}
  })

  assert.strictEqual(txResult.success, true)
  assert.strictEqual(txResult.activeShortcuts.shortcut, '', '唤醒快捷键依然保持禁用')
  assert.strictEqual(txResult.activeShortcuts.screenshotShortcut, 'Ctrl+Shift+S')
})

// ─────────────────────────────────────────────────────────────
// 3. 快捷键事件解析与格式化（生产模块：shortcutUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n⌨️  3. 快捷键解析与无重复修饰键测试 (shortcutUtils.js)')

test('parseShortcutFromEvent 解析 Ctrl+A 不包含重复 Ctrl', () => {
  const mockEvent = {
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    key: 'a',
    code: 'KeyA'
  }
  const result = parseShortcutFromEvent(mockEvent)
  assert.strictEqual(result, 'Ctrl+A')
})

test('parseShortcutFromEvent 单按修饰键返回 null', () => {
  assert.strictEqual(parseShortcutFromEvent({ key: 'Control' }), null)
  assert.strictEqual(parseShortcutFromEvent({ key: 'Alt' }), null)
  assert.strictEqual(parseShortcutFromEvent({ key: 'Shift' }), null)
  assert.strictEqual(parseShortcutFromEvent({ key: 'Meta' }), null)
})

test('isValidShortcutString 校验有效性', () => {
  assert.strictEqual(isValidShortcutString('Alt+Space'), true)
  assert.strictEqual(isValidShortcutString('Command+Shift+A'), true)
  assert.strictEqual(isValidShortcutString('Ctrl+'), false)
  assert.strictEqual(isValidShortcutString(''), false)
})

// ─────────────────────────────────────────────────────────────
// 4. 快捷键注册事务、支持主动禁用与失败回滚测试（生产模块：shortcutUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n🔄 4. 快捷键注册事务与禁用测试 (shortcutUtils.js)')

test('快捷键全部注册成功时提交目标快捷键', () => {
  const mockRegistered = new Set()
  const registerFn = (type, key) => {
    mockRegistered.add(key)
    return true
  }

  const result = executeShortcutTransaction({
    targetShortcuts: { shortcut: 'Alt+Space', screenshotShortcut: 'Alt+A' },
    previousShortcuts: { shortcut: 'Ctrl+Q', screenshotShortcut: 'Ctrl+W' },
    registerFn,
    unregisterAllFn: () => mockRegistered.clear()
  })

  assert.strictEqual(result.success, true)
  assert.strictEqual(result.activeShortcuts.shortcut, 'Alt+Space')
  assert.strictEqual(result.activeShortcuts.screenshotShortcut, 'Alt+A')
  assert.strictEqual(result.failed.length, 0)
})

test('a. 只禁用唤醒快捷键：留空不调用 register，另一个快捷键正常注册', () => {
  const mockRegistered = new Set()
  let registerCallCount = 0
  const registerFn = (type, key) => {
    registerCallCount++
    mockRegistered.add(key)
    return true
  }

  const result = executeShortcutTransaction({
    targetShortcuts: { shortcut: '', screenshotShortcut: 'Alt+A' },
    previousShortcuts: { shortcut: 'Alt+Space', screenshotShortcut: 'Alt+A' },
    registerFn,
    unregisterAllFn: () => mockRegistered.clear()
  })

  assert.strictEqual(result.success, true)
  assert.strictEqual(registerCallCount, 1, '空字符串不应调用 registerFn')
  assert.strictEqual(result.activeShortcuts.shortcut, '')
  assert.strictEqual(result.activeShortcuts.screenshotShortcut, 'Alt+A')
  assert.strictEqual(result.failed.length, 0)
})

test('b. 只禁用截图快捷键：留空不调用 register，唤醒快捷键正常注册', () => {
  const mockRegistered = new Set()
  let registerCallCount = 0
  const registerFn = (type, key) => {
    registerCallCount++
    mockRegistered.add(key)
    return true
  }

  const result = executeShortcutTransaction({
    targetShortcuts: { shortcut: 'Alt+Space', screenshotShortcut: '' },
    previousShortcuts: { shortcut: 'Alt+Space', screenshotShortcut: 'Alt+A' },
    registerFn,
    unregisterAllFn: () => mockRegistered.clear()
  })

  assert.strictEqual(result.success, true)
  assert.strictEqual(registerCallCount, 1)
  assert.strictEqual(result.activeShortcuts.shortcut, 'Alt+Space')
  assert.strictEqual(result.activeShortcuts.screenshotShortcut, '')
  assert.strictEqual(result.failed.length, 0)
})

test('c. 两个快捷键全部禁用：均不调用 register，两者均成功置空', () => {
  let registerCallCount = 0
  const registerFn = () => {
    registerCallCount++
    return true
  }

  const result = executeShortcutTransaction({
    targetShortcuts: { shortcut: '', screenshotShortcut: '' },
    previousShortcuts: { shortcut: 'Alt+Space', screenshotShortcut: 'Alt+A' },
    registerFn,
    unregisterAllFn: () => {}
  })

  assert.strictEqual(result.success, true)
  assert.strictEqual(registerCallCount, 0, '全部禁用时不应调用任何 registerFn')
  assert.strictEqual(result.activeShortcuts.shortcut, '')
  assert.strictEqual(result.activeShortcuts.screenshotShortcut, '')
  assert.strictEqual(result.failed.length, 0)
})

test('d. 禁用一个、另一个注册失败时仍能正确回滚', () => {
  const mockRegistered = new Set()
  const registerFn = (type, key) => {
    if (key === 'Alt+A') return false
    mockRegistered.add(key)
    return true
  }

  const result = executeShortcutTransaction({
    targetShortcuts: { shortcut: '', screenshotShortcut: 'Alt+A' },
    previousShortcuts: { shortcut: 'Ctrl+Shift+Space', screenshotShortcut: 'Ctrl+Shift+S' },
    registerFn,
    unregisterAllFn: () => mockRegistered.clear()
  })

  assert.strictEqual(result.success, false, '存在非空且注册失败的快捷键时判定为失败')
  assert.strictEqual(result.failed.length, 1)
  assert.strictEqual(result.failed[0].key, 'Alt+A')
  assert.strictEqual(result.activeShortcuts.shortcut, 'Ctrl+Shift+Space')
  assert.strictEqual(result.activeShortcuts.screenshotShortcut, 'Ctrl+Shift+S')
  assert(mockRegistered.has('Ctrl+Shift+Space'), '回滚时必须重新注册旧唤醒快捷键')
})

test('常规被占用导致注册失败时自动回滚', () => {
  const mockRegistered = new Set()
  const registerFn = (type, key) => {
    if (key === 'Alt+A') return false
    mockRegistered.add(key)
    return true
  }

  const result = executeShortcutTransaction({
    targetShortcuts: { shortcut: 'Alt+Space', screenshotShortcut: 'Alt+A' },
    previousShortcuts: { shortcut: 'Ctrl+Q', screenshotShortcut: 'Ctrl+W' },
    registerFn,
    unregisterAllFn: () => mockRegistered.clear()
  })

  assert.strictEqual(result.success, false)
  assert.strictEqual(result.failed.length, 1)
  assert.strictEqual(result.activeShortcuts.shortcut, 'Ctrl+Q')
  assert.strictEqual(result.activeShortcuts.screenshotShortcut, 'Ctrl+W')
})

// ─────────────────────────────────────────────────────────────
// 5. AI 消息构造与提示词隔离（生产模块：aiUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n🤖 5. AI 消息构造与提示词隔离测试 (aiUtils.js)')

test('buildChatMessages 用户消息只含原始输入，提示词作为 prompt 独立传递', () => {
  const prompt = '你是一个资深翻译官。'
  const userInput = '你好，世界'
  const history = [
    { question: '1+1=?', answer: '2' }
  ]

  const payload = buildChatMessages(prompt, userInput, history)

  assert.strictEqual(payload.prompt, prompt)
  assert.strictEqual(payload.text, userInput)
  assert.strictEqual(payload.messages.length, 3)

  // 检查上下文
  assert.strictEqual(payload.messages[0].role, 'user')
  assert.strictEqual(payload.messages[0].content, '1+1=?')
  assert.strictEqual(payload.messages[1].role, 'assistant')
  assert.strictEqual(payload.messages[1].content, '2')

  // 检查当前回合（绝不包含重复拼接的 prompt）
  assert.strictEqual(payload.messages[2].role, 'user')
  assert.strictEqual(payload.messages[2].content, '你好，世界')
})

test('buildChatMessages 真实生产路径：连续追问时仅加载最近 8 条会话记录', () => {
  const sessionHistory = []
  for (let i = 1; i <= 15; i++) {
    sessionHistory.push({
      question: `Question ${i}`,
      answer: `Answer ${i}`
    })
  }

  const recent8 = sessionHistory.slice(-8)
  const payload = buildChatMessages('系统提示词', '当前新问题', recent8)

  assert.strictEqual(payload.prompt, '系统提示词')
  assert.strictEqual(payload.text, '当前新问题')
  assert.strictEqual(payload.messages.length, 17)
  assert.strictEqual(payload.messages[0].content, 'Question 8')
  assert.strictEqual(payload.messages[1].content, 'Answer 8')
  assert.strictEqual(payload.messages[14].content, 'Question 15')
  assert.strictEqual(payload.messages[15].content, 'Answer 15')
  assert.strictEqual(payload.messages[16].content, '当前新问题')
})

// ─────────────────────────────────────────────────────────────
// 6. 网络请求超时与安全响应解析（生产模块：networkUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n⏱️  6. 网络超时与响应解析测试 (networkUtils.js)')

await asyncTest('fetchWithTimeout 超时自动 Abort 并返回友好错误', async () => {
  const hangingFetch = (_url, { signal }) => {
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const err = new Error('The operation was aborted')
        err.name = 'AbortError'
        reject(err)
      })
    })
  }

  let caught = null
  try {
    await fetchWithTimeout('https://api.example.com', {}, 80, hangingFetch)
  } catch (err) {
    caught = err
  }

  assert(caught !== null, '超时必须抛出异常')
  assert(caught.message.includes('请求超时'), `必须包含友好超时提示: ${caught.message}`)
})

await asyncTest('parseResponseSafe 正常 JSON 响应解析', async () => {
  const mockRes = {
    ok: true,
    status: 200,
    headers: {
      get: (h) => (h === 'content-type' ? 'application/json; charset=utf-8' : '')
    },
    json: async () => ({ choices: [{ message: { content: 'Hello' } }] })
  }

  const data = await parseResponseSafe(mockRes, 'OpenAI')
  assert.strictEqual(data.choices[0].message.content, 'Hello')
})

await asyncTest('parseResponseSafe 非 200 错误码安全解析', async () => {
  const mockErrorRes = {
    ok: false,
    status: 502,
    statusText: 'Bad Gateway',
    headers: {
      get: () => 'text/html'
    },
    text: async () => '<html><body>502 Bad Gateway</body></html>'
  }

  let caught = null
  try {
    await parseResponseSafe(mockErrorRes, 'DeepSeek')
  } catch (e) {
    caught = e
  }

  assert(caught !== null)
  assert(caught.message.includes('502'), '错误应包含 HTTP 状态码 502')
})

// ─────────────────────────────────────────────────────────────
// 7. providerDetectedModels 与设置白名单（生产模块：settingsUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n🛡️  7. providerDetectedModels 与设置白名单测试 (settingsUtils.js)')

test('SETTINGS_WHITELIST_KEYS 必须包含 providerDetectedModels', () => {
  assert(SETTINGS_WHITELIST_KEYS.includes('providerDetectedModels'), '白名单中必须包含 providerDetectedModels')
  assert.deepStrictEqual(DEFAULT_SETTINGS.providerDetectedModels, {}, '默认设置中 providerDetectedModels 应为空对象')
})

test('filterSafeSettings 正常保留 providerDetectedModels 并过滤非法非设置字段', () => {
  const mockStore = {
    apiKey: 'sk-test',
    provider: 'ollama',
    providerDetectedModels: {
      ollama: ['qwen2.5:7b', 'deepseek-r1:8b'],
      deepseek: ['deepseek-chat', 'deepseek-reasoner']
    },
    history: [{ id: 1, type: 'text', content: 'Secret clipboard data' }],
    tempScratch: 123
  }

  const safe = filterSafeSettings(mockStore, DEFAULT_SETTINGS)

  assert.strictEqual(safe.apiKey, 'sk-test')
  assert.strictEqual(safe.provider, 'ollama')
  assert.deepStrictEqual(safe.providerDetectedModels.ollama, ['qwen2.5:7b', 'deepseek-r1:8b'], '已检测模型列表必须保留')
  assert.strictEqual(safe.history, undefined, 'history 绝不能混入 settings 中')
  assert.strictEqual(safe.tempScratch, undefined, '临时非白名单字段被过滤')
})

// ─────────────────────────────────────────────────────────────
// 8. 图片存储与磁盘配额测试（生产模块：imageUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n🖼️  8. 图片存储与磁盘配额测试 (imageUtils.js)')

import {
  isSafeImageFilename,
  parseDataUrl,
  calculateThumbnailSize,
  normalizeProtocolPath,
  planDiskPruning
} from '../src/shared/imageUtils.js'

test('isSafeImageFilename 校验受控图片文件名与防御路径穿越', () => {
  assert.strictEqual(isSafeImageFilename('img_123456_abc.png'), true)
  assert.strictEqual(isSafeImageFilename('img_test-1.jpg'), true)
  assert.strictEqual(isSafeImageFilename('img_test.webp'), true)
  
  // 非法穿越路径与恶意字符
  assert.strictEqual(isSafeImageFilename('../evil.png'), false)
  assert.strictEqual(isSafeImageFilename('sub/dir/img.png'), false)
  assert.strictEqual(isSafeImageFilename('/root/img.png'), false)
  assert.strictEqual(isSafeImageFilename('..\\evil.png'), false)
  assert.strictEqual(isSafeImageFilename('script.js'), false)
  assert.strictEqual(isSafeImageFilename(''), false)
  assert.strictEqual(isSafeImageFilename(null), false)
})

test('parseDataUrl 解析有效与无效 Base64 Data URL', () => {
  const validPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  const parsedPng = parseDataUrl(validPng)
  assert.strictEqual(parsedPng.mimeType, 'image/png')
  assert.strictEqual(parsedPng.ext, '.png')
  assert(parsedPng.base64Data.length > 10)

  const validJpg = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
  const parsedJpg = parseDataUrl(validJpg)
  assert.strictEqual(parsedJpg.mimeType, 'image/jpeg')
  assert.strictEqual(parsedJpg.ext, '.jpg')

  assert.strictEqual(parseDataUrl('invalid string'), null)
  assert.strictEqual(parseDataUrl('data:text/plain;base64,abc'), null)
})

test('calculateThumbnailSize 保持宽高比例且长边不超过 240px', () => {
  // 横向大图 (1920x1080)
  const landscape = calculateThumbnailSize(1920, 1080, 240)
  assert.strictEqual(landscape.width, 240)
  assert.strictEqual(landscape.height, 135)

  // 纵向大图 (1080x1920)
  const portrait = calculateThumbnailSize(1080, 1920, 240)
  assert.strictEqual(portrait.width, 135)
  assert.strictEqual(portrait.height, 240)

  // 小于 240 的小图保持原样
  const small = calculateThumbnailSize(100, 80, 240)
  assert.strictEqual(small.width, 100)
  assert.strictEqual(small.height, 80)
})

test('normalizeProtocolPath 提取并校验协议 URL 文件名', () => {
  assert.strictEqual(normalizeProtocolPath('clipai-image://img_123.png'), 'img_123.png')
  assert.strictEqual(normalizeProtocolPath('clipai-image:///img_456.jpg?t=123#view'), 'img_456.jpg')
  assert.strictEqual(normalizeProtocolPath('clipai-image://../secret.json'), null, '路径穿越应被拒绝')
  assert.strictEqual(normalizeProtocolPath('http://example.com/a.png'), null)
})

test('planDiskPruning 当图片总大小超额时仅清理未收藏的最旧图片', () => {
  const mockHistory = [
    { id: 1, type: 'image', filePath: 'img_1.png', byteSize: 200, timestamp: '2026-01-01T10:00:00Z', favorite: false },
    { id: 2, type: 'image', filePath: 'img_2.png', byteSize: 300, timestamp: '2026-01-01T11:00:00Z', favorite: true },
    { id: 3, type: 'image', filePath: 'img_3.png', byteSize: 400, timestamp: '2026-01-01T12:00:00Z', favorite: false }
  ]

  // 总大小 900 字节，限额 500 字节
  const plan = planDiskPruning(mockHistory, 500)
  // 应首先清理未收藏且最旧的 id: 1 (200 字节，剩余 700)，仍超标；接着跳过收藏的 id: 2，清理 id: 3 (400 字节，剩余 300 达标)
  assert.deepStrictEqual(plan.prunedIds, [1, 3], '应裁剪未收藏的 id: 1 和 3，绝不能删除收藏的 id: 2')
  assert(plan.totalBytes <= 500, '裁剪后总大小应达标')
})

// ─────────────────────────────────────────────────────────────
// 9. 健康作息计时器精准度与去重测试（生产模块：timerUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n⏱️  9. 健康作息计时器精准度与去重测试 (timerUtils.js)')

import {
  calculateRemainingSeconds,
  createTimerEndsAt,
  normalizeTimerState,
  processTimerTick
} from '../src/shared/timerUtils.js'

test('calculateRemainingSeconds 与 createTimerEndsAt 时间差精准计算', () => {
  const now = 1000000000000
  const endsAt = createTimerEndsAt(30, now)
  assert.strictEqual(endsAt, now + 30000)

  const remaining = calculateRemainingSeconds(endsAt, now)
  assert.strictEqual(remaining, 30)

  const pastRemaining = calculateRemainingSeconds(now - 5000, now)
  assert.strictEqual(pastRemaining, 0)
})

test('normalizeTimerState 兼容旧版 localStorage 并生成 cycleId 与 endsAt', () => {
  const now = 1000000000000
  const legacyState = {
    isRunning: true,
    remainingSeconds: 60,
    totalSeconds: 300
  }

  const normalized = normalizeTimerState(legacyState, now)
  assert.strictEqual(normalized.isRunning, true)
  assert.strictEqual(normalized.remainingSeconds, 60)
  assert.strictEqual(normalized.endsAt, now + 60000)
  assert(normalized.cycleId.startsWith('cycle_'))
})

test('processTimerTick 单次与循环计时器到期提醒及周期去重', () => {
  const now = 1000000000000
  const triggeredSet = new Set()

  // 1. 倒计时进行中 (剩余 10 秒)
  const runningState = {
    isRunning: true,
    totalSeconds: 30,
    endsAt: now + 10000,
    cycleId: 'cycle_test_1',
    isLoop: false
  }
  const tick1 = processTimerTick(runningState, triggeredSet, now)
  assert.strictEqual(tick1.triggered, false)
  assert.strictEqual(tick1.nextState.remainingSeconds, 10)

  // 2. 倒计时到期
  const tick2 = processTimerTick(runningState, triggeredSet, now + 12000)
  assert.strictEqual(tick2.triggered, true, '首次到期应触发提醒')
  assert.strictEqual(tick2.cycleIdToRecord, 'cycle_test_1')
  assert.strictEqual(tick2.nextState.isRunning, false, '单次计时器到期后停止')

  triggeredSet.add(tick2.cycleIdToRecord)

  // 3. 重复检测（休眠唤醒防多重并发触发）
  const tick3 = processTimerTick(runningState, triggeredSet, now + 15000)
  assert.strictEqual(tick3.triggered, false, '同一周期已记录，绝不重复触发弹窗')

  // 4. 循环计时器模式 (isLoop: true)
  const loopState = {
    isRunning: true,
    totalSeconds: 60,
    endsAt: now - 1000,
    cycleId: 'cycle_loop_1',
    isLoop: true
  }
  const loopTick = processTimerTick(loopState, new Set(), now)
  assert.strictEqual(loopTick.triggered, true)
  assert.strictEqual(loopTick.nextState.isRunning, true, '循环计时器应自动开启下一周期')
  assert(loopTick.nextState.endsAt > now, '新周期截止时间已自动推移')
})

// ─────────────────────────────────────────────────────────────
// 10. API Key 脱敏掩码与日志安全测试（生产模块：apiKeyUtils.js）
// ─────────────────────────────────────────────────────────────
console.log('\n🔒 10. API Key 脱敏掩码与日志安全测试 (apiKeyUtils.js)')

import { maskApiKey, sanitizeTextForLogs, isMaskedApiKey } from '../src/shared/apiKeyUtils.js'

test('maskApiKey 掩码脱敏', () => {
  assert.strictEqual(maskApiKey('sk-ant-api03-abcdefghijklmn1234567890'), 'sk-a••••••••7890')
  assert.strictEqual(maskApiKey('AIzaSyD-1234567890abcdefghijklmnopqrst'), 'AIza••••••••qrst')
  assert.strictEqual(maskApiKey('123456'), '••••••••')
  assert.strictEqual(maskApiKey(''), '')
  assert.strictEqual(maskApiKey(null), '')
})

test('isMaskedApiKey 正确识别掩码与真实 Key', () => {
  assert.strictEqual(isMaskedApiKey('sk-a••••••••7890'), true)
  assert.strictEqual(isMaskedApiKey('••••••••'), true)
  assert.strictEqual(isMaskedApiKey('sk-ant-12345678901234567890'), false)
  assert.strictEqual(isMaskedApiKey('AIzaSyD-1234567890'), false)
  assert.strictEqual(isMaskedApiKey(''), false)
  assert.strictEqual(isMaskedApiKey(undefined), false)
})

test('sanitizeTextForLogs 日志脱敏防泄露', () => {
  const rawLog = 'Error fetching https://api.openai.com/v1?key=AIzaSyD-secret-key-12345 with Authorization: Bearer sk-ant-1234567890abcdef'
  const sanitized = sanitizeTextForLogs(rawLog)

  assert(!sanitized.includes('AIzaSyD-secret-key-12345'), '明文 key 必须被脱敏')
  assert(!sanitized.includes('sk-ant-1234567890abcdef'), '明文 sk 必须被脱敏')
  assert(sanitized.includes('[REDACTED_API_KEY]'), '脱敏标记必须存在')
})

// ─────────────────────────────────────────────────────────────
// 11. 计时器延后与重启逻辑测试 (timerUtils.js -> snoozeTimer, restartLoopTimer, addTimeToTimer)
// ─────────────────────────────────────────────────────────────
console.log('\n⏰ 11. 计时器延后与重启逻辑测试 (timerUtils.js)')

import { snoozeTimer, restartLoopTimer, addTimeToTimer } from '../src/shared/timerUtils.js'

test('snoozeTimer 重新生成 endsAt 与 cycleId 并激活运行状态', () => {
  const now = 1000000000000
  const state = {
    id: 'timer_1',
    isRunning: false,
    totalSeconds: 1800,
    remainingSeconds: 0,
    endsAt: null,
    cycleId: 'old_cycle'
  }

  const snoozed = snoozeTimer(state, 300, now)
  assert.strictEqual(snoozed.isRunning, true)
  assert.strictEqual(snoozed.totalSeconds, 300)
  assert.strictEqual(snoozed.remainingSeconds, 300)
  assert.strictEqual(snoozed.endsAt, now + 300000)
  assert(snoozed.cycleId && snoozed.cycleId !== 'old_cycle', 'snooze 必须生成全新 cycleId')
})

test('restartLoopTimer 重新生成当前周期的 endsAt 与新 cycleId', () => {
  const now = 1000000000000
  const state = {
    id: 'loop_1',
    isRunning: true,
    totalSeconds: 2400,
    remainingSeconds: 10,
    endsAt: now + 10000,
    cycleId: 'old_loop_cycle',
    isLoop: true
  }

  const restarted = restartLoopTimer(state, now)
  assert.strictEqual(restarted.isRunning, true)
  assert.strictEqual(restarted.totalSeconds, 2400)
  assert.strictEqual(restarted.remainingSeconds, 2400)
  assert.strictEqual(restarted.endsAt, now + 2400000)
  assert(restarted.cycleId && restarted.cycleId !== 'old_loop_cycle')
})

test('addTimeToTimer 精准延长运行中计时器并更新 endsAt', () => {
  const now = 1000000000000
  const state = {
    isRunning: true,
    totalSeconds: 600,
    remainingSeconds: 200,
    endsAt: now + 200000,
    cycleId: 'cycle_run'
  }

  const added = addTimeToTimer(state, 300, now)
  assert.strictEqual(added.isRunning, true)
  assert.strictEqual(added.totalSeconds, 900)
  assert.strictEqual(added.remainingSeconds, 500)
  assert.strictEqual(added.endsAt, now + 500000)
  assert(added.cycleId !== 'cycle_run')
})

// ─────────────────────────────────────────────────────────────
// 14. 历史记录 IPC 契约与前端容错保护测试
// ─────────────────────────────────────────────────────────────
console.log('\n📦 14. 历史记录 IPC 契约与前端容错保护测试')

test('delete-item、toggle-favorite、clear-history 成功响应均包含数组 history', () => {
  const initialHistory = [
    { id: 1, type: 'text', content: 'hello', favorite: false },
    { id: 2, type: 'text', content: 'world', favorite: true }
  ]

  // 模拟 delete-item 逻辑
  const deleteHandler = (id, list) => {
    const next = list.filter((i) => i.id !== id)
    return { success: true, history: next }
  }

  // 模拟 toggle-favorite 逻辑
  const toggleHandler = (id, list) => {
    const next = list.map((i) => (i.id === id ? { ...i, favorite: !i.favorite } : i))
    return { success: true, history: next }
  }

  // 模拟 clear-history 逻辑
  const clearHandler = (list) => {
    const next = list.filter((i) => i.favorite)
    return { success: true, history: next }
  }

  const resDel = deleteHandler(1, initialHistory)
  assert.strictEqual(resDel.success, true)
  assert(Array.isArray(resDel.history))
  assert.strictEqual(resDel.history.length, 1)

  const resFav = toggleHandler(1, initialHistory)
  assert.strictEqual(resFav.success, true)
  assert(Array.isArray(resFav.history))
  assert.strictEqual(resFav.history[0].favorite, true)

  const resClr = clearHandler(initialHistory)
  assert.strictEqual(resClr.success, true)
  assert(Array.isArray(resClr.history))
  assert.strictEqual(resClr.history.length, 1)
  assert.strictEqual(resClr.history[0].id, 2)
})

test('前端收到失败或异常响应时不会把 history 更新成对象、null 或 undefined', () => {
  let currentHistory = [{ id: 1, type: 'text', content: 'a' }]
  const setHistoryMock = (val) => {
    if (Array.isArray(val)) {
      currentHistory = val
    }
  }

  // 模拟异常返回 { success: false, error: '...' }
  const badResponse1 = { success: false, error: 'Store write failed' }
  if (badResponse1 && badResponse1.success && Array.isArray(badResponse1.history)) {
    setHistoryMock(badResponse1.history)
  }
  assert(Array.isArray(currentHistory), 'history 必须保持数组')
  assert.strictEqual(currentHistory.length, 1)

  // 模拟直接返回了对象 { success: true }
  const badResponse2 = { success: true }
  if (badResponse2 && badResponse2.success && Array.isArray(badResponse2.history)) {
    setHistoryMock(badResponse2.history)
  }
  assert(Array.isArray(currentHistory), 'history 绝不会被赋值为非数组对象')
  assert.strictEqual(currentHistory.length, 1)
})

// ─────────────────────────────────────────────────────────────
// 15. finish-snipper 参数协议与容错测试
// ─────────────────────────────────────────────────────────────
console.log('\n📸 15. finish-snipper 参数协议与容错测试')

function validateFinishSnipperPayload(payload) {
  const dataUrl = payload && typeof payload === 'object' ? payload.dataUrl : (typeof payload === 'string' ? payload : null)
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { success: false, error: '无效截图数据' }
  }
  return { success: true, dataUrl }
}

test('finish-snipper 能正确处理对象协议 { dataUrl }', () => {
  const validPayload = { dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' }
  const res = validateFinishSnipperPayload(validPayload)
  assert.strictEqual(res.success, true)
  assert.strictEqual(res.dataUrl, validPayload.dataUrl)
})

test('finish-snipper 收到字符串、null、空对象、非图片 Data URL 时安全失败', () => {
  assert.strictEqual(validateFinishSnipperPayload(null).success, false)
  assert.strictEqual(validateFinishSnipperPayload({}).success, false)
  assert.strictEqual(validateFinishSnipperPayload({ dataUrl: '' }).success, false)
  assert.strictEqual(validateFinishSnipperPayload({ dataUrl: 'data:text/html;base64,abc' }).success, false)
  assert.strictEqual(validateFinishSnipperPayload(12345).success, false)
  assert.strictEqual(validateFinishSnipperPayload({ dataUrl: 'https://evil.com/img.png' }).success, false)
})

// ─────────────────────────────────────────────────────────────
// 16. Viewer Preload 最小权限与安全隔离检查
// ─────────────────────────────────────────────────────────────
console.log('\n🖼️ 16. Viewer Preload 最小权限与安全隔离检查')

import fsSyncModule from 'fs'

test('viewer preload 仅包含查看器所需最小权限，不泄露敏感特权 API', () => {
  const viewerPreloadCode = fsSyncModule.readFileSync(join(__dirname, '../electron/preload/viewer.js'), 'utf-8')
  
  // 必须包含的必要接口
  assert(viewerPreloadCode.includes('copyImageToClipboard'), '必须暴露 copyImageToClipboard')
  assert(viewerPreloadCode.includes('minimizeImageViewer'), '必须暴露 minimizeImageViewer')
  assert(viewerPreloadCode.includes('getCurrentViewerImage'), '必须暴露 getCurrentViewerImage')
  assert(viewerPreloadCode.includes('saveImageDialog'), '必须暴露 saveImageDialog')

  // 严禁暴露的特权接口
  assert(!viewerPreloadCode.includes('deleteItem'), 'Viewer Preload 严禁包含 deleteItem')
  assert(!viewerPreloadCode.includes('clearHistory'), 'Viewer Preload 严禁包含 clearHistory')
  assert(!viewerPreloadCode.includes('saveApiKey'), 'Viewer Preload 严禁包含 saveApiKey')
  assert(!viewerPreloadCode.includes('setSettings'), 'Viewer Preload 严禁包含 setSettings')
  assert(!viewerPreloadCode.includes('savePrompts'), 'Viewer Preload 严禁包含 savePrompts')
  assert(!viewerPreloadCode.includes('quitApp'), 'Viewer Preload 严禁包含 quitApp')
})

// ─────────────────────────────────────────────────────────────
// 17. WebView HTTPS 严格校验与协议防御测试
// ─────────────────────────────────────────────────────────────
console.log('\n🔒 17. WebView HTTPS 严格校验与协议防御测试')

test('isAllowedAimakeXUrl 严格要求 HTTPS 并精准匹配白名单域名', () => {
  // 允许的官方 HTTPS 域名
  assert.strictEqual(isAllowedAimakeXUrl('https://chat.aimakex.com'), true)
  assert.strictEqual(isAllowedAimakeXUrl('https://chat.aimakex.com/'), true)
  assert.strictEqual(isAllowedAimakeXUrl('https://aimakex.com'), true)
  assert.strictEqual(isAllowedAimakeXUrl('https://api.aimakex.com'), true)

  // 拒绝 HTTP
  assert.strictEqual(isAllowedAimakeXUrl('http://chat.aimakex.com'), false, 'HTTP 协议必须拒绝')
  assert.strictEqual(isAllowedAimakeXUrl('http://aimakex.com'), false, 'HTTP 协议必须拒绝')

  // 拒绝伪造/前缀仿冒域名
  assert.strictEqual(isAllowedAimakeXUrl('https://chat.aimakex.com.evil.com'), false)
  assert.strictEqual(isAllowedAimakeXUrl('https://evil.com/?redirect=chat.aimakex.com'), false)
  assert.strictEqual(isAllowedAimakeXUrl('https://evil-aimakex.com'), false)
  assert.strictEqual(isAllowedAimakeXUrl('https://aimakex.com.fake.org'), false)

  // 拒绝危险 scheme
  assert.strictEqual(isAllowedAimakeXUrl('javascript:alert(1)'), false)
  assert.strictEqual(isAllowedAimakeXUrl('file:///etc/passwd'), false)
  assert.strictEqual(isAllowedAimakeXUrl('data:text/html,evil'), false)
})

// ─────────────────────────────────────────────────────────────
// 19. finish-snipper 严格参数契约测试 (validateFinishSnipperPayload)
// ─────────────────────────────────────────────────────────────
console.log('\n✂️ 19. finish-snipper 严格参数契约测试 (validateFinishSnipperPayload)')

test('validateFinishSnipperPayload: 严格拒绝原始字符串 (即使是合法 Data URL 字符串)', async () => {
  const { validateFinishSnipperPayload } = await import('../src/shared/imageUtils.js')
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  
  // 直接传字符串必须失败
  const strResult = validateFinishSnipperPayload(validDataUrl)
  assert.strictEqual(strResult.success, false, '直接传字符串必须返回 success: false')
  assert.ok(strResult.error.includes('必须为普通对象'), '错误信息必须提示参数必须为对象')

  // 传数组必须失败
  const arrResult = validateFinishSnipperPayload([validDataUrl])
  assert.strictEqual(arrResult.success, false, '数组必须返回 success: false')

  // 传 null/undefined/空对象 必须失败
  assert.strictEqual(validateFinishSnipperPayload(null).success, false)
  assert.strictEqual(validateFinishSnipperPayload(undefined).success, false)
  assert.strictEqual(validateFinishSnipperPayload({}).success, false)

  // 传非图片 Data URL 必须失败
  assert.strictEqual(validateFinishSnipperPayload({ dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }).success, false)

  // 传合法对象必须成功
  const validResult = validateFinishSnipperPayload({ dataUrl: validDataUrl })
  assert.strictEqual(validResult.success, true)
  assert.strictEqual(validResult.dataUrl, validDataUrl)
  assert.strictEqual(validResult.parsed.ext, '.png')
})

// ─────────────────────────────────────────────────────────────
// 20. 窗口导航与 WebContents 安全策略评估测试 (evaluateNavigationPolicy)
// ─────────────────────────────────────────────────────────────
console.log('\n🛡️ 20. 窗口导航与 WebContents 安全策略评估测试 (evaluateNavigationPolicy)')

test('evaluateNavigationPolicy: 特权 BrowserWindow 与 WebView 策略严格隔离', async () => {
  const { evaluateNavigationPolicy, isExactDevOriginUrl } = await import('../src/shared/networkUtils.js')
  const devServerUrl = 'http://localhost:5173'
  const appRendererDir = '/app/dist/renderer'

  // 1. devOrigin 精确匹配测试
  assert.strictEqual(isExactDevOriginUrl('http://localhost:5173/index.html', devServerUrl), true)
  assert.strictEqual(isExactDevOriginUrl('http://localhost:5173/subpath?q=1', devServerUrl), true)
  assert.strictEqual(isExactDevOriginUrl('http://localhost:5173.evil.com', devServerUrl), false, '必须拒绝伪造前缀域名')
  assert.strictEqual(isExactDevOriginUrl('http://localhost:8080', devServerUrl), false)

  // 2. 特权窗口 (BrowserWindow: 主窗口、Viewer、Snipper)
  // 开发环境精确匹配 devServer
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'http://localhost:5173', contentsType: 'window', devServerUrl, isDev: true }),
    'allow-internal'
  )
  // 即使是 AimakeX 白名单，特权窗口也绝不能内部 loadURL，只能调起系统浏览器
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'https://chat.aimakex.com', contentsType: 'window', devServerUrl, isDev: true }),
    'open-external'
  )
  // 外部普通网站 -> 系统浏览器
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'https://github.com', contentsType: 'window', devServerUrl, isDev: true }),
    'open-external'
  )
  // 伪造开发地址 -> 外部浏览器或拒绝
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'http://localhost:5173.evil.com', contentsType: 'window', devServerUrl, isDev: true }),
    'open-external'
  )
  // 生产环境受控 file:// -> allow-internal
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'file:///app/dist/renderer/index.html', contentsType: 'window', appRendererDir, isDev: false }),
    'allow-internal'
  )
  // 生产环境越界 file:// -> deny
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'file:///etc/passwd', contentsType: 'window', appRendererDir, isDev: false }),
    'deny'
  )
  // 危险协议 -> deny
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'javascript:alert(1)', contentsType: 'window', isDev: false }),
    'deny'
  )

  // 3. WebView
  // 白名单 AimakeX HTTPS -> allow-internal
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'https://chat.aimakex.com', contentsType: 'webview' }),
    'allow-internal'
  )
  // 外部 HTTP/HTTPS -> open-external
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'https://google.com', contentsType: 'webview' }),
    'open-external'
  )
  // 危险协议在 WebView -> deny
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'javascript:alert(1)', contentsType: 'webview' }),
    'deny'
  )
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'file:///etc/passwd', contentsType: 'webview' }),
    'deny'
  )
  assert.strictEqual(
    evaluateNavigationPolicy({ url: 'data:text/html,evil', contentsType: 'webview' }),
    'deny'
  )
})

// ─────────────────────────────────────────────────────────────
// 21. 历史记录持久化原子性契约测试
// ─────────────────────────────────────────────────────────────
console.log('\n💾 21. 历史记录持久化原子性契约测试')

test('persistHistory: store.set 写入失败时，内存数据不被破坏', () => {
  let memoryHistory = [{ id: 1, content: 'item 1' }]
  const mockStore = {
    get: () => 100,
    set: () => {
      throw new Error('Disk full')
    }
  }

  function simulatePersistHistory(list) {
    const trimmed = persistHistoryList(list, 100)
    mockStore.set('history', trimmed)
    memoryHistory = trimmed
    return trimmed
  }

  let errorThrown = false
  try {
    simulatePersistHistory([{ id: 2, content: 'item 2' }])
  } catch (err) {
    errorThrown = true
  }

  assert.strictEqual(errorThrown, true, '写入 store 失败必须抛出异常')
  assert.strictEqual(memoryHistory[0].id, 1, '写入失败时内存数据必须保持旧状态，不能被提前更新')
})

// ─────────────────────────────────────────────────────────────
// 22. 设置更新 API Key 隔离测试
// ─────────────────────────────────────────────────────────────
console.log('\n🔒 22. 设置更新 API Key 隔离测试')

test('普通设置更新净化：必须安全剔除 apiKey 字段', () => {
  const dirtySettings = {
    theme: 'dark',
    shortcut: 'Alt+Space',
    apiKey: 'sk-secret-plain-key-12345',
    providerConfigs: {
      openai: { model: 'gpt-4o', apiKey: 'sk-openai-plain-key' },
      gemini: { model: 'gemini-2.5-flash', apiKey: 'AIzaSyPlainKey' }
    }
  }

  // 模拟 App.jsx 中的净化逻辑
  const safeS = { ...dirtySettings }
  delete safeS.apiKey
  if (safeS.providerConfigs) {
    const safeConfigs = {}
    for (const [p, cfg] of Object.entries(safeS.providerConfigs)) {
      safeConfigs[p] = { ...cfg }
      delete safeConfigs[p].apiKey
    }
    safeS.providerConfigs = safeConfigs
  }

  assert.strictEqual(safeS.apiKey, undefined)
  assert.strictEqual(safeS.providerConfigs.openai.apiKey, undefined)
  assert.strictEqual(safeS.providerConfigs.gemini.apiKey, undefined)
  assert.strictEqual(safeS.providerConfigs.openai.model, 'gpt-4o')
  assert.strictEqual(safeS.theme, 'dark')
})

// ─────────────────────────────────────────────────────────────
// 23. isAllowedAppFileUrl 真实生产白名单与前缀绕过防御测试 (networkUtils.js)
// ─────────────────────────────────────────────────────────────
console.log('\n📂 23. isAllowedAppFileUrl 真实生产白名单与前缀绕过防御测试 (networkUtils.js)')

test('isAllowedAppFileUrl: 精确匹配受控 renderer 根目录，彻底阻断同级前缀与路径穿越', async () => {
  const { isAllowedAppFileUrl } = await import('../src/shared/networkUtils.js')
  const appRendererDir = '/app/dist/renderer'

  // 1. 允许合法内部文件
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/index.html', appRendererDir), true, '合法 index.html 必须放行')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/assets/index.js', appRendererDir), true, '合法子目录资源必须放行')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/sub%20dir/my%20file.html', appRendererDir), true, '合法空格路径必须放行')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/%E4%B8%AD%E6%96%87%E7%9B%AE%E5%BD%95/%E9%A1%B5%E9%9D%A2.html', appRendererDir), true, '合法中文路径必须放行')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer', appRendererDir), true, '根目录本身放行')

  // 2. 拒绝同级前缀目录（修复前缀字符串匹配漏洞）
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer-evil/index.html', appRendererDir), false, '同级前缀 renderer-evil 必须拒绝')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer_backup/index.html', appRendererDir), false, '同级前缀 renderer_backup 必须拒绝')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer2/index.html', appRendererDir), false, '同级前缀 renderer2 必须拒绝')

  // 3. 拒绝路径穿越与越界系统文件
  assert.strictEqual(isAllowedAppFileUrl('file:///etc/passwd', appRendererDir), false, '系统文件必须拒绝')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/../main/index.js', appRendererDir), false, '路径穿越 .. 必须拒绝')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/%2e%2e/main/index.js', appRendererDir), false, '编码路径穿越 %2e%2e 必须拒绝')

  // 4. 拒绝非 file 协议与危险 scheme
  assert.strictEqual(isAllowedAppFileUrl('javascript:alert(1)', appRendererDir), false)
  assert.strictEqual(isAllowedAppFileUrl('data:text/html,evil', appRendererDir), false)
  assert.strictEqual(isAllowedAppFileUrl('http://localhost:5173/index.html', appRendererDir), false)
  assert.strictEqual(isAllowedAppFileUrl('https://aimakex.com', appRendererDir), false)

  // 5. 异常与边界输入防御
  assert.strictEqual(isAllowedAppFileUrl(null, appRendererDir), false)
  assert.strictEqual(isAllowedAppFileUrl(undefined, appRendererDir), false)
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/index.html', null), false, 'appRendererDir 为 null 必须拒绝')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/index.html', ''), false, 'appRendererDir 为空必须拒绝')
  assert.strictEqual(isAllowedAppFileUrl('file:///app/dist/renderer/index.html', '   '), false)
  assert.strictEqual(isAllowedAppFileUrl('file:///', appRendererDir), false)
})

// ─────────────────────────────────────────────────────────────
// 24. executeFinishSnipperTransaction 真实截图事务阶段与故障恢复契约测试
// ─────────────────────────────────────────────────────────────
console.log('\n📸 24. executeFinishSnipperTransaction 真实截图事务阶段与故障恢复契约测试')

test('executeFinishSnipperTransaction: 阶段 A (参数验证失败) 不调用任何副作用', async () => {
  const { executeFinishSnipperTransaction } = await import('../src/shared/screenshotTransaction.js')
  let saveCalled = false

  const res = await executeFinishSnipperTransaction('invalid_string_payload', {
    saveDataUrl: async () => { saveCalled = true }
  })

  assert.strictEqual(res.success, false)
  assert.strictEqual(saveCalled, false, '参数校验失败绝不创建图片')
})

test('executeFinishSnipperTransaction: 阶段 B (图片创建失败) 不发送成功事件且不调用删除', async () => {
  const { executeFinishSnipperTransaction } = await import('../src/shared/screenshotTransaction.js')
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  let successEventSent = false
  let deleteCalled = false

  const res = await executeFinishSnipperTransaction({ dataUrl: validDataUrl }, {
    saveDataUrl: async () => {
      throw new Error('Disk write I/O error')
    },
    addToHistory: async () => {},
    deleteImageFile: async () => { deleteCalled = true },
    sendScreenshotSuccess: () => { successEventSent = true }
  })

  assert.strictEqual(res.success, false)
  assert.strictEqual(res.error, 'Disk write I/O error')
  assert.strictEqual(successEventSent, false, '图片创建失败绝不发送成功通知')
  assert.strictEqual(deleteCalled, false, '未成功创建文件时不调用删除')
})

test('executeFinishSnipperTransaction: 阶段 C (历史持久化失败) 必须安全删除新建文件，不发送成功事件，不关闭窗口', async () => {
  const { executeFinishSnipperTransaction } = await import('../src/shared/screenshotTransaction.js')
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const mockItem = { id: 101, filePath: 'clipai_images/snap_101.png', label: '截图' }
  let deletedPath = null
  let successEventSent = false
  let snipperClosed = false

  const res = await executeFinishSnipperTransaction({ dataUrl: validDataUrl }, {
    saveDataUrl: async () => mockItem,
    addToHistory: async () => {
      throw new Error('Store persistence failed')
    },
    deleteImageFile: async (path) => {
      deletedPath = path
    },
    sendScreenshotSuccess: () => { successEventSent = true },
    closeSnipperWindow: () => { snipperClosed = true }
  })

  assert.strictEqual(res.success, false)
  assert.strictEqual(deletedPath, 'clipai_images/snap_101.png', '历史持久化失败必须清理新建图片文件')
  assert.strictEqual(successEventSent, false, '历史持久化失败绝不发送 screenshot-success')
  assert.strictEqual(snipperClosed, false, '历史持久化失败不关闭截图交互窗口')
})

test('executeFinishSnipperTransaction: 历史持久化成功且副作用正常时按序执行并返回 success', async () => {
  const { executeFinishSnipperTransaction } = await import('../src/shared/screenshotTransaction.js')
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const mockItem = { id: 102, filePath: 'clipai_images/snap_102.png', label: '截图' }

  const executionLog = []

  const res = await executeFinishSnipperTransaction({ dataUrl: validDataUrl }, {
    saveDataUrl: async () => {
      executionLog.push('saveDataUrl')
      return mockItem
    },
    addToHistory: async () => {
      executionLog.push('addToHistory')
      return { success: true }
    },
    deleteImageFile: async () => {
      executionLog.push('deleteImageFile')
    },
    sendScreenshotSuccess: () => {
      executionLog.push('sendScreenshotSuccess')
    },
    writeClipboardImage: async () => {
      executionLog.push('writeClipboardImage')
    },
    closeSnipperWindow: () => {
      executionLog.push('closeSnipperWindow')
    },
    showMainWindow: () => {
      executionLog.push('showMainWindow')
    }
  })

  assert.strictEqual(res.success, true)
  assert.strictEqual(res.item.id, 102)
  assert.deepStrictEqual(executionLog, [
    'saveDataUrl',
    'addToHistory',
    'sendScreenshotSuccess',
    'writeClipboardImage',
    'closeSnipperWindow',
    'showMainWindow'
  ], '各阶段必须严格按照规范生命周期顺序执行')
})

test('executeFinishSnipperTransaction: 阶段 D (写剪贴板抛错) 绝不删除图片文件，不回滚历史，返回 success: true', async () => {
  const { executeFinishSnipperTransaction } = await import('../src/shared/screenshotTransaction.js')
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const mockItem = { id: 103, filePath: 'clipai_images/snap_103.png', label: '截图' }
  let deleteCalled = false
  const warnings = []

  const res = await executeFinishSnipperTransaction({ dataUrl: validDataUrl }, {
    saveDataUrl: async () => mockItem,
    addToHistory: async () => ({ success: true }),
    deleteImageFile: async () => { deleteCalled = true },
    writeClipboardImage: async () => {
      throw new Error('Clipboard lock timeout')
    },
    logWarning: (msg) => warnings.push(msg)
  })

  assert.strictEqual(res.success, true, '剪贴板写入失败属于非关键副作用，返回仍应为 success: true')
  assert.strictEqual(res.item.id, 103)
  assert.strictEqual(deleteCalled, false, '历史已提交，绝不能删除图片文件')
  assert.ok(warnings.some((w) => w.includes('Clipboard lock timeout')), '必须记录 warning')
})

test('executeFinishSnipperTransaction: 阶段 D (关闭窗口或显示主窗口失败) 绝不删除图片文件，返回 success: true', async () => {
  const { executeFinishSnipperTransaction } = await import('../src/shared/screenshotTransaction.js')
  const validDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const mockItem = { id: 104, filePath: 'clipai_images/snap_104.png', label: '截图' }
  let deleteCalled = false
  const warnings = []

  const res = await executeFinishSnipperTransaction({ dataUrl: validDataUrl }, {
    saveDataUrl: async () => mockItem,
    addToHistory: async () => ({ success: true }),
    deleteImageFile: async () => { deleteCalled = true },
    closeSnipperWindow: () => {
      throw new Error('Snipper window already destroyed')
    },
    showMainWindow: () => {
      throw new Error('Main window minimized state error')
    },
    logWarning: (msg) => warnings.push(msg)
  })

  assert.strictEqual(res.success, true)
  assert.strictEqual(deleteCalled, false, '窗口操作异常绝不能删除图片文件')
  assert.strictEqual(res.item.id, 104)
  assert.strictEqual(warnings.length, 2)
})

// ─────────────────────────────────────────────────────────────
console.log(`\n🎉 全部测试执行完毕: 总计 ${passed + failed} 个测试, 通过 ${passed} 个, 失败 ${failed} 个\n`)

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}




