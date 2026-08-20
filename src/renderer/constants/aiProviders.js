// 🌐 全主流 AI 大模型提供商定义与预设配置
export const AI_PROVIDERS = [
  // ── 国内主流大模型 ──
  {
    id: 'deepseek',
    name: 'DeepSeek',
    group: 'domestic',
    icon: '🐋',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    websiteUrl: 'https://platform.deepseek.com',
    defaultModel: 'deepseek-chat',
    models: [
      { name: 'deepseek-chat', displayName: 'DeepSeek-V3' },
      { name: 'deepseek-reasoner', displayName: 'DeepSeek-R1' }
    ],
    supportVision: false
  },
  {
    id: 'qwen',
    name: 'Qwen',
    group: 'domestic',
    icon: '🟠',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    websiteUrl: 'https://bailian.console.aliyun.com',
    defaultModel: 'qwen-plus',
    models: [
      { name: 'qwen-plus', displayName: 'Qwen-Plus' },
      { name: 'qwen-max', displayName: 'Qwen-Max' },
      { name: 'qwen-turbo', displayName: 'Qwen-Turbo' },
      { name: 'qwen-vl-max', displayName: 'Qwen-VL-Max' },
      { name: 'qwen-vl-plus', displayName: 'Qwen-VL-Plus' }
    ],
    supportVision: true
  },
  {
    id: 'zhipu',
    name: 'GLM (Zhipu)',
    group: 'domestic',
    icon: '⚡',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    websiteUrl: 'https://bigmodel.cn',
    defaultModel: 'glm-4-flash',
    models: [
      { name: 'glm-4-flash', displayName: 'GLM-4-Flash' },
      { name: 'glm-4-plus', displayName: 'GLM-4-Plus' },
      { name: 'glm-4-air', displayName: 'GLM-4-Air' },
      { name: 'glm-4v-plus', displayName: 'GLM-4V-Plus' }
    ],
    supportVision: true
  },
  {
    id: 'moonshot',
    name: 'Kimi (Moonshot)',
    group: 'domestic',
    icon: '🌙',
    defaultBaseUrl: 'https://api.moonshot.cn/v1',
    websiteUrl: 'https://platform.moonshot.cn',
    defaultModel: 'moonshot-v1-8k',
    models: [
      { name: 'moonshot-v1-8k', displayName: 'Moonshot-v1-8k' },
      { name: 'moonshot-v1-32k', displayName: 'Moonshot-v1-32k' },
      { name: 'moonshot-v1-128k', displayName: 'Moonshot-v1-128k' }
    ],
    supportVision: false
  },
  {
    id: 'doubao',
    name: 'Doubao',
    group: 'domestic',
    icon: '🐬',
    defaultBaseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    websiteUrl: 'https://console.volcengine.com/ark',
    defaultModel: 'doubao-pro-32k',
    models: [
      { name: 'doubao-pro-32k', displayName: 'Doubao-Pro-32K' },
      { name: 'doubao-lite-32k', displayName: 'Doubao-Lite-32K' },
      { name: 'doubao-vision-pro-32k', displayName: 'Doubao-Vision-Pro' }
    ],
    supportVision: true
  },
  {
    id: 'ernie',
    name: 'ERNIE (Baidu)',
    group: 'domestic',
    icon: '🌌',
    defaultBaseUrl: 'https://qianfan.baidubce.com/v2',
    websiteUrl: 'https://cloud.baidu.com/product/wenxinworkshop',
    defaultModel: 'ernie-speed-128k',
    models: [
      { name: 'ernie-speed-128k', displayName: 'ERNIE-Speed-128K' },
      { name: 'ernie-4.0-turbo-8k', displayName: 'ERNIE-4.0-Turbo' },
      { name: 'ernie-lite-8k', displayName: 'ERNIE-Lite' }
    ],
    supportVision: false
  },
  {
    id: 'hunyuan',
    name: 'Hunyuan (Tencent)',
    group: 'domestic',
    icon: '🔴',
    defaultBaseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    websiteUrl: 'https://cloud.tencent.com/product/hunyuan',
    defaultModel: 'hunyuan-standard',
    models: [
      { name: 'hunyuan-standard', displayName: 'Hunyuan-Standard' },
      { name: 'hunyuan-pro', displayName: 'Hunyuan-Pro' },
      { name: 'hunyuan-vision', displayName: 'Hunyuan-Vision' }
    ],
    supportVision: true
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    group: 'domestic',
    icon: '🔥',
    defaultBaseUrl: 'https://api.minimax.chat/v1',
    websiteUrl: 'https://api.minimax.chat',
    defaultModel: 'abab6.5s-chat',
    models: [
      { name: 'abab6.5s-chat', displayName: 'Abab6.5s-Chat' },
      { name: 'abab7-chat', displayName: 'Abab7-Chat' }
    ],
    supportVision: false
  },

  // ── 国际顶尖 AI 厂商 ──
  {
    id: 'gemini',
    name: 'Google Gemini',
    group: 'international',
    icon: '✨',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    websiteUrl: 'https://aistudio.google.com/app/apikey',
    defaultModel: 'gemini-2.5-flash',
    models: [
      { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
      { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash' },
      { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' },
      { name: 'gemini-1.5-flash', displayName: 'Gemini 1.5 Flash' }
    ],
    supportVision: true
  },
  {
    id: 'openai',
    name: 'OpenAI (ChatGPT)',
    group: 'international',
    icon: '🤖',
    defaultBaseUrl: 'https://api.openai.com/v1',
    websiteUrl: 'https://platform.openai.com/api-keys',
    defaultModel: 'gpt-4o',
    models: [
      { name: 'gpt-4o', displayName: 'GPT-4o' },
      { name: 'gpt-4o-mini', displayName: 'GPT-4o-mini' },
      { name: 'o3-mini', displayName: 'o3-mini' },
      { name: 'o1', displayName: 'o1' }
    ],
    supportVision: true
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    group: 'international',
    icon: '🎭',
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    websiteUrl: 'https://console.anthropic.com',
    defaultModel: 'claude-3-7-sonnet-20250219',
    models: [
      { name: 'claude-3-7-sonnet-20250219', displayName: 'Claude 3.7 Sonnet' },
      { name: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet' },
      { name: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku' }
    ],
    supportVision: true
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    group: 'international',
    icon: '🌪️',
    defaultBaseUrl: 'https://api.mistral.ai/v1',
    websiteUrl: 'https://console.mistral.ai',
    defaultModel: 'mistral-large-latest',
    models: [
      { name: 'mistral-large-latest', displayName: 'Mistral Large' },
      { name: 'codestral-latest', displayName: 'Codestral' },
      { name: 'pixtral-large-latest', displayName: 'Pixtral Large' }
    ],
    supportVision: true
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    group: 'international',
    icon: '💻',
    defaultBaseUrl: 'https://api.x.ai/v1',
    websiteUrl: 'https://console.x.ai',
    defaultModel: 'grok-2',
    models: [
      { name: 'grok-2', displayName: 'Grok-2' },
      { name: 'grok-2-vision-1212', displayName: 'Grok-2-Vision' }
    ],
    supportVision: true
  },

  // ── 极速推理与聚合平台 ──
  {
    id: 'siliconflow',
    name: 'SiliconFlow',
    group: 'aggregator',
    icon: '⚡',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    websiteUrl: 'https://cloud.siliconflow.cn',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    models: [
      { name: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek-V3' },
      { name: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek-R1' },
      { name: 'Qwen/Qwen2.5-72B-Instruct', displayName: 'Qwen2.5-72B-Instruct' },
      { name: 'THUDM/glm-4-9b-chat', displayName: 'GLM-4-9B-Chat' }
    ],
    supportVision: false
  },
  {
    id: 'groq',
    name: 'Groq',
    group: 'aggregator',
    icon: '⚡',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    websiteUrl: 'https://console.groq.com/keys',
    defaultModel: 'deepseek-r1-distill-llama-70b',
    models: [
      { name: 'deepseek-r1-distill-llama-70b', displayName: 'DeepSeek-R1-Distill-70B' },
      { name: 'llama-3.3-70b-versatile', displayName: 'Llama-3.3-70B' },
      { name: 'mixtral-8x7b-32768', displayName: 'Mixtral-8x7B' }
    ],
    supportVision: false
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    group: 'aggregator',
    icon: '🌐',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    websiteUrl: 'https://openrouter.ai/keys',
    defaultModel: 'deepseek/deepseek-r1',
    models: [
      { name: 'deepseek/deepseek-r1', displayName: 'DeepSeek-R1' },
      { name: 'deepseek/deepseek-chat', displayName: 'DeepSeek-V3' },
      { name: 'anthropic/claude-3.7-sonnet', displayName: 'Claude 3.7 Sonnet' },
      { name: 'openai/gpt-4o', displayName: 'GPT-4o' },
      { name: 'google/gemini-2.0-flash-001', displayName: 'Gemini 2.0 Flash' }
    ],
    supportVision: true
  },
  {
    id: 'together',
    name: 'Together AI',
    group: 'aggregator',
    icon: '🚀',
    defaultBaseUrl: 'https://api.together.xyz/v1',
    websiteUrl: 'https://api.together.ai',
    defaultModel: 'deepseek-ai/DeepSeek-R1',
    models: [
      { name: 'deepseek-ai/DeepSeek-R1', displayName: 'DeepSeek-R1' },
      { name: 'deepseek-ai/DeepSeek-V3', displayName: 'DeepSeek-V3' },
      { name: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', displayName: 'Llama-3.3-70B-Turbo' }
    ],
    supportVision: false
  },

  // ── 本地离线与自定义兼容 ──
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    group: 'local',
    icon: '🦙',
    defaultBaseUrl: 'http://localhost:11434/v1',
    websiteUrl: 'https://ollama.com',
    defaultModel: 'deepseek-r1',
    models: [
      { name: 'deepseek-r1', displayName: 'deepseek-r1' },
      { name: 'llama3.3', displayName: 'llama3.3' },
      { name: 'qwen2.5', displayName: 'qwen2.5' },
      { name: 'phi4', displayName: 'phi4' }
    ],
    supportVision: false
  },
  {
    id: 'lmstudio',
    name: 'LM Studio / LocalAI',
    group: 'local',
    icon: '🖥️',
    defaultBaseUrl: 'http://localhost:1234/v1',
    websiteUrl: 'https://lmstudio.ai',
    defaultModel: 'local-model',
    models: [
      { name: 'local-model', displayName: 'local-model' }
    ],
    supportVision: false
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI Compatible)',
    group: 'custom',
    icon: '🛠️',
    defaultBaseUrl: '',
    websiteUrl: '',
    defaultModel: '',
    models: [],
    supportVision: true
  }
]

export const AI_GROUPS = [
  { id: 'domestic', label: '🇨🇳 Regional AI Providers', count: 8 },
  { id: 'international', label: '🌍 Global AI Providers', count: 5 },
  { id: 'aggregator', label: '⚡ Fast Inference & Hubs', count: 4 },
  { id: 'local', label: '💻 Local / Offline AI', count: 2 },
  { id: 'custom', label: '🛠️ Custom Endpoint', count: 1 }
]
