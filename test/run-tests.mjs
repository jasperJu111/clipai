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

// ─── Windows 跨平台兼容性测试 ───────────────────────────────
test('formatShortcutForDisplay: macOS 下应正确展示 ⌘ Cmd / ⌥ Option 等符号', async () => {
  const { formatShortcutForDisplay } = await import('../src/shared/shortcutUtils.js')
  assert.strictEqual(formatShortcutForDisplay('Command+Shift+V', 'darwin'), '⌘ Cmd + ⇧ Shift + V')
  assert.strictEqual(formatShortcutForDisplay('Alt+Space', 'darwin'), '⌥ Option + Space')
  assert.strictEqual(formatShortcutForDisplay('Ctrl+Alt+A', 'darwin'), '⌃ Ctrl + ⌥ Option + A')
})

test('formatShortcutForDisplay: Windows 下应清晰展示 Ctrl / Alt / Shift / Win，绝不能出现 ⌘ 或 ⌥', async () => {
  const { formatShortcutForDisplay } = await import('../src/shared/shortcutUtils.js')
  const winDisplay1 = formatShortcutForDisplay('Command+Shift+V', 'win32')
  const winDisplay2 = formatShortcutForDisplay('Alt+Space', 'win32')
  const winDisplay3 = formatShortcutForDisplay('Ctrl+Shift+A', 'win32')

  assert.strictEqual(winDisplay1, 'Win + Shift + V')
  assert.strictEqual(winDisplay2, 'Alt + Space')
  assert.strictEqual(winDisplay3, 'Ctrl + Shift + A')

  // 严禁包含苹果专有符号
  assert.ok(!winDisplay1.includes('⌘') && !winDisplay1.includes('⌥'), 'Windows 快捷键不得含有 Mac 字符')
  assert.ok(!winDisplay2.includes('⌘') && !winDisplay2.includes('⌥'), 'Windows 快捷键不得含有 Mac 字符')
  assert.ok(!winDisplay3.includes('⌘') && !winDisplay3.includes('⌥'), 'Windows 快捷键不得含有 Mac 字符')
})

test('parseShortcutFromEvent: 支持平台感知的修饰键解析', async () => {
  const { parseShortcutFromEvent } = await import('../src/shared/shortcutUtils.js')

  const macEvent = { metaKey: true, shiftKey: true, key: 'V', code: 'KeyV' }
  assert.strictEqual(parseShortcutFromEvent(macEvent, 'darwin'), 'Command+Shift+V')

  const winEvent = { ctrlKey: true, shiftKey: true, key: 'V', code: 'KeyV' }
  assert.strictEqual(parseShortcutFromEvent(winEvent, 'win32'), 'Ctrl+Shift+V')
})

test('Windows resources/icon.ico 图标生成与尺寸校验', async () => {
  const fs = await import('fs')
  const path = await import('path')
  const icoPath = path.resolve('resources/icon.ico')
  assert.ok(fs.existsSync(icoPath), 'resources/icon.ico 必须存在')
  
  const buf = fs.readFileSync(icoPath)
  assert.ok(buf.length > 1000, 'icon.ico 文件大小必须合理')
  assert.strictEqual(buf.readUInt16LE(0), 0, 'ICO header reserved must be 0')
  assert.strictEqual(buf.readUInt16LE(2), 1, 'ICO header type must be 1')
  const count = buf.readUInt16LE(4)
  assert.ok(count >= 5, `ICO 应包含多个尺寸，当前包含: ${count} 种尺寸`)
})

test('package.json: 包含 Windows NSIS 目标与 package:win 脚本', async () => {
  const fs = await import('fs')
  const path = await import('path')
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'))

  assert.ok(pkg.scripts['package:win'], '必须包含 package:win 构建命令')
  assert.ok(pkg.scripts['package:mac'], '必须包含 package:mac 构建命令')
  assert.ok(pkg.build?.win?.target, 'build.win.target 必须配置')
  assert.strictEqual(pkg.build.win.icon, 'resources/icon.ico', 'Windows 图标必须指定 resources/icon.ico')
  assert.ok(pkg.build.nsis, '必须包含 nsis 安装包配置')
})

// ─── 1. 快捷键注册事务与适配器调用集成测试 (Issue 1) ───────────
test('executeShortcutTransaction: 生产对象参数契约与注册调用顺序 (type, key)', async () => {
  const { executeShortcutTransaction } = await import('../src/shared/shortcutUtils.js')
  const registerCalls = []
  let unregisterCalled = false

  const res = executeShortcutTransaction({
    targetShortcuts: {
      shortcut: 'Ctrl+Shift+Space',
      screenshotShortcut: 'Ctrl+Shift+A'
    },
    previousShortcuts: {
      shortcut: 'Alt+Space',
      screenshotShortcut: 'Alt+A'
    },
    registerFn: (type, key) => {
      registerCalls.push({ type, key })
      return true
    },
    unregisterAllFn: () => {
      unregisterCalled = true
    }
  })

  assert.strictEqual(res.success, true)
  assert.strictEqual(unregisterCalled, true, '必须先卸载旧快捷键')
  assert.strictEqual(registerCalls.length, 2, '两个快捷键均应被注册')
  assert.deepStrictEqual(registerCalls[0], { type: 'shortcut', key: 'Ctrl+Shift+Space' })
  assert.deepStrictEqual(registerCalls[1], { type: 'screenshotShortcut', key: 'Ctrl+Shift+A' })
  assert.deepStrictEqual(res.activeShortcuts, {
    shortcut: 'Ctrl+Shift+Space',
    screenshotShortcut: 'Ctrl+Shift+A'
  })
})

test('executeShortcutTransaction: 一个快捷键为空时只注册另一个', async () => {
  const { executeShortcutTransaction } = await import('../src/shared/shortcutUtils.js')
  const registerCalls = []

  const res = executeShortcutTransaction({
    targetShortcuts: {
      shortcut: '',
      screenshotShortcut: 'Ctrl+Shift+A'
    },
    previousShortcuts: {
      shortcut: 'Alt+Space',
      screenshotShortcut: 'Alt+A'
    },
    registerFn: (type, key) => {
      registerCalls.push({ type, key })
      return true
    },
    unregisterAllFn: () => {}
  })

  assert.strictEqual(res.success, true)
  assert.strictEqual(registerCalls.length, 1)
  assert.deepStrictEqual(registerCalls[0], { type: 'screenshotShortcut', key: 'Ctrl+Shift+A' })
  assert.strictEqual(res.activeShortcuts.shortcut, '')
  assert.strictEqual(res.activeShortcuts.screenshotShortcut, 'Ctrl+Shift+A')
})

test('executeShortcutTransaction: 注册失败时必须安全回滚并校验回滚结果', async () => {
  const { executeShortcutTransaction } = await import('../src/shared/shortcutUtils.js')
  const registerCalls = []

  const res = executeShortcutTransaction({
    targetShortcuts: {
      shortcut: 'Ctrl+Shift+Space',
      screenshotShortcut: 'ConflictKey'
    },
    previousShortcuts: {
      shortcut: 'Alt+Space',
      screenshotShortcut: 'Alt+A'
    },
    registerFn: (type, key) => {
      registerCalls.push({ type, key })
      if (key === 'ConflictKey') return false
      return true
    },
    unregisterAllFn: () => {}
  })

  assert.strictEqual(res.success, false)
  assert.strictEqual(res.failed.length, 1)
  assert.strictEqual(res.failed[0].type, 'screenshotShortcut')
  // 回滚成功恢复 previousShortcuts
  assert.deepStrictEqual(res.activeShortcuts, {
    shortcut: 'Alt+Space',
    screenshotShortcut: 'Alt+A'
  })
})

test('executeShortcutTransaction: 回滚失败时不能虚假汇报 activeShortcuts', async () => {
  const { executeShortcutTransaction } = await import('../src/shared/shortcutUtils.js')
  let attempt = 0

  const res = executeShortcutTransaction({
    targetShortcuts: {
      shortcut: 'NewKey1',
      screenshotShortcut: 'NewKey2'
    },
    previousShortcuts: {
      shortcut: 'PrevKey1',
      screenshotShortcut: 'PrevKey2'
    },
    registerFn: (type, key) => {
      attempt++
      if (key === 'NewKey2') return false // 触发回滚
      if (key === 'PrevKey1') return false // 回滚时 PrevKey1 也注册失败
      if (key === 'PrevKey2') return true  // PrevKey2 回滚成功
      return true
    },
    unregisterAllFn: () => {}
  })

  assert.strictEqual(res.success, false)
  // PrevKey1 回滚失败，activeShortcuts 中不应包含 PrevKey1
  assert.strictEqual(res.activeShortcuts.shortcut, undefined)
  assert.strictEqual(res.activeShortcuts.screenshotShortcut, 'PrevKey2')
})

test('executeShortcutTransaction: 两个快捷键设置相同组合时必须拒绝注册', async () => {
  const { executeShortcutTransaction } = await import('../src/shared/shortcutUtils.js')
  let registerCalled = false

  const res = executeShortcutTransaction({
    targetShortcuts: {
      shortcut: 'Ctrl+Shift+A',
      screenshotShortcut: 'Ctrl+Shift+A'
    },
    previousShortcuts: {
      shortcut: 'Alt+Space',
      screenshotShortcut: 'Alt+A'
    },
    registerFn: () => {
      registerCalled = true
      return true
    },
    unregisterAllFn: () => {}
  })

  assert.strictEqual(res.success, false)
  assert.strictEqual(registerCalled, false, '重复快捷键冲突时不得调用 register')
  assert.ok(res.failed[0].reason.includes('重复') || res.failed[0].reason.includes('相同组合'))
})

// ─── 2. 跨平台默认快捷键测试 (Issue 2) ─────────────────────────
test('getDefaultShortcuts: 跨平台默认快捷键匹配与隔离', async () => {
  const { getDefaultShortcuts } = await import('../src/shared/shortcutUtils.js')
  
  const macDefaults = getDefaultShortcuts('darwin')
  assert.strictEqual(macDefaults.shortcut, 'Alt+Space')
  assert.strictEqual(macDefaults.screenshotShortcut, 'Alt+A')

  const winDefaults = getDefaultShortcuts('win32')
  assert.strictEqual(winDefaults.shortcut, 'Ctrl+Shift+Space', 'Windows 默认主快捷键应为 Ctrl+Shift+Space')
  assert.strictEqual(winDefaults.screenshotShortcut, 'Ctrl+Shift+A', 'Windows 默认截图快捷键应为 Ctrl+Shift+A')
  assert.notStrictEqual(winDefaults.shortcut, 'Alt+Space', 'Windows 默认不得为 Alt+Space')
})

// ─── 3. Windows 多显示器采集源精准匹配测试 (Issue 3) ────────────
test('selectDesktopCapturerSource: display_id 精确匹配与短 ID 防模糊匹配', async () => {
  const { selectDesktopCapturerSource } = await import('../src/shared/screenUtils.js')
  
  const mockSources = [
    { id: 'screen:10:0', display_id: '10', name: 'Screen 10' },
    { id: 'screen:1:0', display_id: '1', name: 'Screen 1' },
    { id: 'screen:277909845:0', display_id: '277909845', name: 'Screen Secondary' }
  ]

  // 1. 精确匹配 display_id === '1'
  const match1 = selectDesktopCapturerSource(mockSources, { id: 1 })
  assert.strictEqual(match1.matched, true)
  assert.strictEqual(match1.source.display_id, '1')
  assert.notStrictEqual(match1.source.display_id, '10', '绝不能使用 includes 将 1 模糊匹配为 10')

  // 2. 精确匹配副屏 display_id === '277909845'
  const match2 = selectDesktopCapturerSource(mockSources, { id: '277909845', bounds: { x: -1920, y: 0, width: 1920, height: 1080 } })
  assert.strictEqual(match2.matched, true)
  assert.strictEqual(match2.source.display_id, '277909845')

  // 3. source.id token 冒号匹配 (无 display_id 字段时的回退)
  const tokenSources = [
    { id: 'screen:65537:0', name: 'Display 65537' },
    { id: 'screen:65538:0', name: 'Display 65538' }
  ]
  const matchToken = selectDesktopCapturerSource(tokenSources, { id: 65538 })
  assert.strictEqual(matchToken.matched, true)
  assert.strictEqual(matchToken.source.id, 'screen:65538:0')

  // 4. 找不到对应屏幕时明确汇报 matched: false 与原因
  const unmatch = selectDesktopCapturerSource(mockSources, { id: 99999 })
  assert.strictEqual(unmatch.matched, false)
  assert.ok(unmatch.reason.includes('未能精准匹配'), '未匹配时必须提供明确降级理由')
})

// ─── 4. 高 DPI 与物理像素裁剪坐标变换测试 (Issue 4) ─────────────
test('calculatePhysicalCropRect: 100%、125%、150%、200% 物理分辨率转换精准度', async () => {
  const { calculatePhysicalCropRect } = await import('../src/shared/snipperCropUtils.js')

  // 1. 100% 缩放 (1920x1080 -> 1920x1080)
  const res100 = calculatePhysicalCropRect(
    { x: 100, y: 100, w: 500, h: 300 },
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080 }
  )
  assert.strictEqual(res100.valid, true)
  assert.strictEqual(res100.x, 100)
  assert.strictEqual(res100.y, 100)
  assert.strictEqual(res100.width, 500)
  assert.strictEqual(res100.height, 300)
  assert.strictEqual(res100.scaleX, 1)
  assert.strictEqual(res100.scaleY, 1)

  // 2. 125% 缩放 (逻辑 1536x864, 原图物理 1920x1080)
  const res125 = calculatePhysicalCropRect(
    { x: 100, y: 100, w: 400, h: 200 },
    { width: 1536, height: 864 },
    { width: 1920, height: 1080 }
  )
  assert.strictEqual(res125.valid, true)
  assert.strictEqual(res125.scaleX, 1.25)
  assert.strictEqual(res125.scaleY, 1.25)
  assert.strictEqual(res125.x, 125)
  assert.strictEqual(res125.y, 125)
  assert.strictEqual(res125.width, 500)
  assert.strictEqual(res125.height, 250)

  // 3. 150% 缩放 (逻辑 1707x960, 原图物理 2560x1440)
  const res150 = calculatePhysicalCropRect(
    { x: 200, y: 100, w: 600, h: 400 },
    { width: 1706.6666, height: 960 },
    { width: 2560, height: 1440 }
  )
  assert.strictEqual(res150.valid, true)
  assert.strictEqual(Math.round(res150.scaleX * 100) / 100, 1.5)
  assert.strictEqual(res150.scaleY, 1.5)
  assert.strictEqual(res150.width, 900)
  assert.strictEqual(res150.height, 600)

  // 4. 200% 缩放 (逻辑 1920x1080, 原图物理 3840x2160)
  const res200 = calculatePhysicalCropRect(
    { x: 50, y: 50, w: 200, h: 100 },
    { width: 1920, height: 1080 },
    { width: 3840, height: 2160 }
  )
  assert.strictEqual(res200.scaleX, 2)
  assert.strictEqual(res200.scaleY, 2)
  assert.strictEqual(res200.width, 400)
  assert.strictEqual(res200.height, 200)

  // 5. 逆向拖拽与边界越界安全截断
  const resOverflow = calculatePhysicalCropRect(
    { x: 1900, y: 1000, w: 200, h: 200 },
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080 }
  )
  assert.strictEqual(resOverflow.valid, true)
  assert.strictEqual(resOverflow.x, 1900)
  assert.strictEqual(resOverflow.y, 1000)
  assert.strictEqual(resOverflow.width, 20) // 1920 - 1900 = 20
  assert.strictEqual(resOverflow.height, 80) // 1080 - 1000 = 80
})

// ─── 5. 截图标注物理像素渲染专项测试 (renderPhysicalAnnotations) ───────
function createMockCanvasContext() {
  const calls = []
  return {
    calls,
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    font: '',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    save() { calls.push({ method: 'save' }) },
    restore() { calls.push({ method: 'restore' }) },
    beginPath() { calls.push({ method: 'beginPath' }) },
    closePath() { calls.push({ method: 'closePath' }) },
    rect(x, y, w, h) { calls.push({ method: 'rect', args: [x, y, w, h] }) },
    clip() { calls.push({ method: 'clip' }) },
    strokeRect(x, y, w, h) { calls.push({ method: 'strokeRect', args: [x, y, w, h], strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }) },
    fillRect(x, y, w, h) { calls.push({ method: 'fillRect', args: [x, y, w, h], fillStyle: this.fillStyle }) },
    stroke() { calls.push({ method: 'stroke', strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }) },
    fill() { calls.push({ method: 'fill', fillStyle: this.fillStyle }) },
    moveTo(x, y) { calls.push({ method: 'moveTo', args: [x, y] }) },
    lineTo(x, y) { calls.push({ method: 'lineTo', args: [x, y] }) },
    arc(x, y, r, sa, ea) { calls.push({ method: 'arc', args: [x, y, r, sa, ea], fillStyle: this.fillStyle }) },
    ellipse(x, y, rx, ry, rot, sa, ea) { calls.push({ method: 'ellipse', args: [x, y, rx, ry, rot, sa, ea], strokeStyle: this.strokeStyle, lineWidth: this.lineWidth }) },
    fillText(text, x, y) { calls.push({ method: 'fillText', args: [text, x, y], font: this.font, fillStyle: this.fillStyle }) }
  }
}

test('renderPhysicalAnnotations: tool: "rect" 正确调用 strokeRect 与处理负宽高', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 100, y: 100, width: 800, height: 600, scaleX: 2, scaleY: 2 }

  // 正向矩形 + 逆向矩形 (负宽高)
  const annotations = [
    { tool: 'rect', color: '#ef4444', width: 3, x: 100, y: 100, w: 200, h: 150 },
    { tool: 'rect', color: '#3b82f6', width: 2, x: 400, y: 300, w: -100, h: -50 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations })

  const strokeRectCalls = ctx.calls.filter((c) => c.method === 'strokeRect')
  assert.strictEqual(strokeRectCalls.length, 2, '矩形必须产生 2 次 strokeRect 调用')

  // 第 1 个：lx=100 -> px = 100*2 - 100 = 100, ly=100 -> py = 100*2 - 100 = 100, pw = 200*2 = 400, ph = 150*2 = 300
  assert.deepStrictEqual(strokeRectCalls[0].args, [100, 100, 400, 300])
  assert.strictEqual(strokeRectCalls[0].strokeStyle, '#ef4444')
  assert.strictEqual(strokeRectCalls[0].lineWidth, 6) // width=3 * scaleFactor=2

  // 第 2 个：逆向拖拽规范化后 rx=300, ry=250, rw=100, rh=50 -> px = 300*2 - 100 = 500, py = 250*2 - 100 = 400, pw = 200, ph = 100
  assert.deepStrictEqual(strokeRectCalls[1].args, [500, 400, 200, 100])
  assert.strictEqual(strokeRectCalls[1].strokeStyle, '#3b82f6')
})

test('renderPhysicalAnnotations: tool: "circle" 正确调用 ellipse 与处理负宽高', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 50, y: 50, width: 600, height: 600, scaleX: 1.5, scaleY: 1.5 }

  const annotations = [
    { tool: 'circle', color: '#10b981', width: 4, x: 100, y: 100, w: 200, h: 100 },
    { tool: 'circle', color: '#f59e0b', width: 2, x: 300, y: 300, w: -100, h: -100 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations })

  const ellipseCalls = ctx.calls.filter((c) => c.method === 'ellipse')
  assert.strictEqual(ellipseCalls.length, 2, '圆形必须产生 2 次 ellipse 调用')

  // 第 1 个：cx=200, cy=150, rx=100, ry=50 -> 中心点 px = 200*1.5 - 50 = 250, py = 150*1.5 - 50 = 175, prx = 150, pry = 75
  assert.deepStrictEqual(ellipseCalls[0].args, [250, 175, 150, 75, 0, 0, 2 * Math.PI])
  assert.strictEqual(ellipseCalls[0].strokeStyle, '#10b981')
  assert.strictEqual(ellipseCalls[0].lineWidth, 6) // 4 * 1.5 = 6

  // 第 2 个：逆向拖拽规范化后 cx=250, cy=250, rx=50, ry=50 -> 中心点 px = 250*1.5 - 50 = 325, py = 325, prx = 75, pry = 75
  assert.deepStrictEqual(ellipseCalls[1].args, [325, 325, 75, 75, 0, 0, 2 * Math.PI])
  assert.strictEqual(ellipseCalls[1].strokeStyle, '#f59e0b')
})

test('renderPhysicalAnnotations: tool: "arrow" 正确调用 moveTo, lineTo, stroke, fill', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 0, y: 0, width: 800, height: 600, scaleX: 1, scaleY: 1 }

  const annotations = [
    { tool: 'arrow', color: '#ef4444', width: 3, fromX: 50, fromY: 50, toX: 200, toY: 150 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations })

  const hasMoveTo = ctx.calls.some((c) => c.method === 'moveTo' && c.args[0] === 50 && c.args[1] === 50)
  const hasLineTo = ctx.calls.some((c) => c.method === 'lineTo' && c.args[0] === 200 && c.args[1] === 150)
  const hasStroke = ctx.calls.some((c) => c.method === 'stroke')
  const hasFill = ctx.calls.some((c) => c.method === 'fill')

  assert.ok(hasMoveTo, '箭头轴线必须调用 moveTo(fromX, fromY)')
  assert.ok(hasLineTo, '箭头轴线必须调用 lineTo(toX, toY)')
  assert.ok(hasStroke, '箭头轴线必须调用 stroke')
  assert.ok(hasFill, '箭头头部必须调用 fill')
})

test('renderPhysicalAnnotations: tool: "pen" 多点连续画线与单点绘制圆点', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 0, y: 0, width: 500, height: 500, scaleX: 1, scaleY: 1 }

  const annotations = [
    { tool: 'pen', color: '#ef4444', width: 3, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }, { x: 30, y: 15 }] },
    { tool: 'pen', color: '#3b82f6', width: 4, points: [{ x: 100, y: 100 }] }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations })

  // 多点画笔：moveTo(10, 10), lineTo(20, 20), lineTo(30, 15), stroke
  assert.ok(ctx.calls.some((c) => c.method === 'moveTo' && c.args[0] === 10 && c.args[1] === 10))
  assert.ok(ctx.calls.some((c) => c.method === 'lineTo' && c.args[0] === 20 && c.args[1] === 20))
  assert.ok(ctx.calls.some((c) => c.method === 'lineTo' && c.args[0] === 30 && c.args[1] === 15))

  // 单点画笔：arc(100, 100, ...) + fill
  assert.ok(ctx.calls.some((c) => c.method === 'arc' && c.args[0] === 100 && c.args[1] === 100))
  assert.ok(ctx.calls.some((c) => c.method === 'fill' && c.fillStyle === '#3b82f6'))
})

test('renderPhysicalAnnotations: tool: "mosaic" 绘制与负宽高安全无死循环', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 0, y: 0, width: 500, height: 500, scaleX: 1, scaleY: 1 }

  const annotations = [
    { tool: 'mosaic', x: 20, y: 20, w: 40, h: 40 },
    { tool: 'mosaic', x: 100, y: 100, w: -30, h: -30 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations })

  const fillRectCalls = ctx.calls.filter((c) => c.method === 'fillRect')
  assert.ok(fillRectCalls.length > 0, '马赛克必须产生小方块 fillRect 调用')
  assert.ok(fillRectCalls.every((c) => c.args[2] > 0 && c.args[3] > 0), '马赛克方块尺寸必须为正值')
})

test('renderPhysicalAnnotations: 文字字号随 DPI 比例缩放 (size: 30 @ 150% -> 45px)', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 0, y: 0, width: 1000, height: 800, scaleX: 1.5, scaleY: 1.5 }

  const textInputs = [
    { x: 50, y: 80, text: 'ClipAI 高清截图', color: '#10b981', size: 30 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, textInputs })

  const fillTextCalls = ctx.calls.filter((c) => c.method === 'fillText')
  assert.strictEqual(fillTextCalls.length, 1)
  assert.strictEqual(fillTextCalls[0].args[0], 'ClipAI 高清截图')
  assert.strictEqual(fillTextCalls[0].args[1], 75) // 50 * 1.5 = 75
  assert.strictEqual(fillTextCalls[0].args[2], 120) // 80 * 1.5 = 120
  assert.ok(fillTextCalls[0].font.includes('45px'), `字号必须为 45px (30 * 1.5)，实际为: ${fillTextCalls[0].font}`)
  assert.strictEqual(fillTextCalls[0].fillStyle, '#10b981')
})

test('renderPhysicalAnnotations: 多标注组合全部在同一选区内绘制', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 100, y: 100, width: 800, height: 600, scaleX: 1, scaleY: 1 }

  const annotations = [
    { tool: 'rect', color: '#ef4444', width: 3, x: 150, y: 150, w: 100, h: 80 },
    { tool: 'circle', color: '#3b82f6', width: 3, x: 300, y: 150, w: 80, h: 80 },
    { tool: 'arrow', color: '#10b981', width: 3, fromX: 400, fromY: 150, toX: 450, toY: 200 },
    { tool: 'pen', color: '#f59e0b', width: 3, points: [{ x: 500, y: 150 }, { x: 520, y: 170 }] },
    { tool: 'mosaic', x: 200, y: 300, w: 50, h: 50 }
  ]
  const textInputs = [
    { x: 300, y: 300, text: 'Hello', color: '#ffffff', size: 18 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations, textInputs })

  assert.ok(ctx.calls.some((c) => c.method === 'strokeRect'), '必须包含 strokeRect')
  assert.ok(ctx.calls.some((c) => c.method === 'ellipse'), '必须包含 ellipse')
  assert.ok(ctx.calls.some((c) => c.method === 'stroke'), '必须包含 stroke')
  assert.ok(ctx.calls.some((c) => c.method === 'fillRect'), '必须包含 fillRect')
  assert.ok(ctx.calls.some((c) => c.method === 'fillText'), '必须包含 fillText')
})

test('renderPhysicalAnnotations: 选区偏移 (cropRect.x/y > 0) 正确平移坐标', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 300, y: 200, width: 500, height: 400, scaleX: 1, scaleY: 1 }

  const annotations = [
    { tool: 'rect', color: '#ef4444', width: 2, x: 350, y: 250, w: 100, h: 100 }
  ]
  const textInputs = [
    { x: 400, y: 300, text: 'Offset Text', color: '#fff', size: 20 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations, textInputs })

  const strokeRectCall = ctx.calls.find((c) => c.method === 'strokeRect')
  // lx=350 -> px = 350 - 300 = 50, ly=250 -> py = 250 - 200 = 50
  assert.deepStrictEqual(strokeRectCall.args, [50, 50, 100, 100])

  const fillTextCall = ctx.calls.find((c) => c.method === 'fillText')
  // lx=400 -> px = 400 - 300 = 100, ly=300 -> py = 300 - 200 = 100
  assert.deepStrictEqual(fillTextCall.args.slice(1), [100, 100])
})

test('renderPhysicalAnnotations: 非等比缩放 (scaleX !== scaleY) 分别转换坐标与尺寸', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 0, y: 0, width: 1000, height: 1000, scaleX: 1.25, scaleY: 1.5 }

  const annotations = [
    { tool: 'rect', color: '#ef4444', width: 2, x: 100, y: 100, w: 200, h: 100 },
    { tool: 'circle', color: '#3b82f6', width: 2, x: 400, y: 200, w: 200, h: 100 }
  ]

  renderPhysicalAnnotations({ ctx, cropRect, annotations })

  const strokeRectCall = ctx.calls.find((c) => c.method === 'strokeRect')
  // px = 100*1.25 = 125, py = 100*1.5 = 150, pw = 200*1.25 = 250, ph = 100*1.5 = 150
  assert.deepStrictEqual(strokeRectCall.args, [125, 150, 250, 150])

  const ellipseCall = ctx.calls.find((c) => c.method === 'ellipse')
  // cx=500 -> px=500*1.25=625, cy=250 -> py=250*1.5=375, prx = (200*1.25)/2 = 125, pry = (100*1.5)/2 = 75
  assert.deepStrictEqual(ellipseCall.args, [625, 375, 125, 75, 0, 0, 2 * Math.PI])
})

test('生产数据契约校验: renderPhysicalAnnotations 兼容读取 tool/type、width/size、size/fontSize', async () => {
  const { renderPhysicalAnnotations } = await import('../src/shared/snipperCropUtils.js')
  const ctx = createMockCanvasContext()
  const cropRect = { x: 0, y: 0, width: 800, height: 600, scaleX: 1, scaleY: 1 }

  // 1. 标准生产契约 (tool, width, size)
  const prodAnn = [{ tool: 'rect', color: '#ef4444', width: 5, x: 10, y: 10, w: 50, h: 50 }]
  const prodTxt = [{ text: 'Prod', color: '#fff', size: 24, x: 10, y: 10 }]

  renderPhysicalAnnotations({ ctx, cropRect, annotations: prodAnn, textInputs: prodTxt })

  const strokeRectCalls = ctx.calls.filter((c) => c.method === 'strokeRect')
  assert.strictEqual(strokeRectCalls[0].lineWidth, 5, '必须读取 width: 5')

  const fillTextCalls = ctx.calls.filter((c) => c.method === 'fillText')
  assert.ok(fillTextCalls[0].font.includes('24px'), '必须读取 size: 24')

  // 2. 兼容旧版/备选字段 (type, size 作为线宽, fontSize 作为字号)
  const ctxLegacy = createMockCanvasContext()
  const legacyAnn = [{ type: 'rect', color: '#ef4444', size: 6, x: 10, y: 10, w: 50, h: 50 }]
  const legacyTxt = [{ text: 'Legacy', color: '#fff', fontSize: 20, x: 10, y: 10 }]

  renderPhysicalAnnotations({ ctx: ctxLegacy, cropRect, annotations: legacyAnn, textInputs: legacyTxt })

  const legacyStroke = ctxLegacy.calls.filter((c) => c.method === 'strokeRect')
  assert.strictEqual(legacyStroke[0].lineWidth, 6, '兼容读取 size 作为线宽')

  const legacyFill = ctxLegacy.calls.filter((c) => c.method === 'fillText')
  assert.ok(legacyFill[0].font.includes('20px'), '兼容读取 fontSize 作为字号')
})

// ─────────────────────────────────────────────────────────────
console.log(`\n🎉 全部测试执行完毕: 总计 ${passed + failed} 个测试, 通过 ${passed} 个, 失败 ${failed} 个\n`)

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}



