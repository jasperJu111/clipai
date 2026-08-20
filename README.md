# 📋 ClipAI — 融合极致美学与 AI 生产力的下一代智能剪贴板

<div align="center">

<img src="resources/icon.png" width="128" height="128" alt="ClipAI Icon" style="border-radius: 28px; box-shadow: 0 12px 36px rgba(0,0,0,0.3);" />

<h3>✨ 极速剪贴 · 多模态 AI · 12 套灵动主题 · 提示词中心 · 专业截图画板 · 健康番茄钟</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-30.0-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Languages-8%20Languages-success?style=flat-square" alt="Languages" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

[简体中文](README.md) · [English](README_EN.md)

</div>

---

## 🌟 项目简介 (About ClipAI)

**ClipAI** 是一款专为开发者、创作者、学者与职场精英打造的**高颜值、全能型开源智能剪贴板工具**。

它不仅拥有媲美原生系统的 60 帧流畅亚克力毛玻璃视觉质感，更深度融合了**本地/云端多模态大语言模型（DeepSeek、OpenAI、Claude、Gemini、Ollama 等）**，让你的每一次复制、截图、问答与写作都事半功倍。

---

## ✨ 核心功能矩阵 (Feature Highlights)

### 1. 📋 极速智能剪贴板管理
* **全格式智能捕获**：文本、代码高亮、高清图片、网页链接、屏幕截图自动分类归档。
* **快捷检索与持久化**：支持 `⌘F` 实时模糊搜索，本地安全持久化，历史容量可自定（50 ~ 1000 条）。
* **置顶收藏与快捷操作**：支持对常用代码片段、文本模板一键 ⭐ 收藏与 📌 置顶，支持一键清空未收藏条目。

### 2. 🤖 多模型 AI 智能工作台
* **多服务商即开即用**：原生支持 **DeepSeek**、**OpenAI (GPT-4o)**、**Anthropic (Claude 3.5)**、**Google (Gemini 1.5 Pro)**、**Ollama (本地离线私有模型)** 及任何 OpenAI 兼容的第三方代理。
* **一键模型探针**：点击自动扫描并列出当前 API 账户下所有可用的模型列表，免去手动配置繁琐参数。
* **高频场景快捷指令**：
  * ✨ **文章润色**：深度重构文本，提升专业度与表达力。
  * 📝 **智能摘要**：快速提取长文核心要点（Bullet Points）。
  * 🔍 **语法校对**：精准修正错别字、标点与语病。
  * 💡 **代码解析**：通俗深度拆解代码逻辑与实现原理。
  * 🐞 **查找修复 Bug**：一键排查潜在漏洞与边界条件并提供优化方案。
  * 📊 **整理表格**：杂乱文本/JSON 快速转换为标准 Markdown 表格。
  * 🌐 **多语互译**：支持中、英、日、韩、西、德、法一键地道互译。

### 3. 🐱 智造喵 (AimakeX) 深度生态互通
* 深度内嵌智造喵专属智能体工作台，支持从剪贴板一键将富文本或图片直传至智造喵对话流，实现多 Agent 协同办公。

### 4. 🌟 100+ 提示词中心 (Prompts Center)
* **4 合 1 提示词库**：**精选库 (100+)**、**私有自建库**、**我的收藏**、**最近使用**。
* **全分类覆盖**：编程开发、文案写作、职场效率、学术科研、创意设计、生活娱乐等。
* **克隆与魔改**：遇到优秀的官方角色，支持一键克隆到私有库进行自由定制修改。
* **导入导出与云端同步**：支持 JSON 格式备份与跨设备迁移。

### 5. 📸 区域截图与专业图像标注画板 (ScreenSnipper)
* **全局唤醒截图**：按快捷键 `Alt+S`（或点击顶栏 📸 图标）即可冻结全屏、精确截取任意区域。
* **专业级画板标注**：矩形框、圆形、方向箭头、自由画笔涂鸦、文字排版、局部马赛克打码。
* **AI 视觉多模态分析**：直接在截图上调用大模型进行 **OCR 文字提取**、**画面总结**、**多语翻译** 与 **解题答疑**。

### 6. ⏱️ 健康作息与专注番茄钟 (Health & Focus Timer)
* **顶栏灵动胶囊倒计时**：呼吸动画实时显示剩余时间，不占用工作空间。
* **科学健康作息预设**：
  * 💧 **规律喝水**（推荐 45 分钟）
  * 🚶 **久坐活动**（推荐 50 分钟）
  * 🍱 **按时就餐**（午餐/晚餐提醒）
  * 🍅 **标准番茄工作法**（25 分钟深度专注 + 5 分钟小休）
  * 👀 **20-20-20 护眼法则**（缓解视疲劳）
* **强提醒与和弦音效**：Web Audio 合成优雅和弦提示音 + macOS/Windows 操作系统原生通知中心强提醒（应用隐藏在后台依然准时送达）。

### 7. 🎨 12 套顶级主题与个性化定制
* **12 款精雕细琢的主题配色**：
  * 📱 **iOS 灵动液态**（Dynamic Island 亚克力通透悬浮）
  * 💎 **Linear 黑曜星空**（极光靛青 · 黑曜石深邃暗夜）
  * ⚡ **Raycast 赤红之夜**（深渊午夜 · 绯红能量）
  * 🌈 **Arc 弥生霓虹**（流体渐变 · 极光霓虹网格）
  * 🧊 **Sequoia 冰川晶透**（macOS 冰川蓝 · 晶莹剔透玻璃）
  * 🌲 **翡翠极光**、🌅 **落日余晖**、👾 **黑客矩阵**、🏙️ **Apple 陶瓷白**、☕ **暖阳丝绒白**、🌫️ **冷杉薄雾蓝** 等。
* **自定义背景壁纸**：支持任意本地图片上传，支持**毛玻璃虚化模糊 (Blur)** 与 **暗度遮光遮罩 (Dim Overlay)** 无级滑动微调。
* **窗口背景不透明度 (Opacity)**：65% ~ 100% 自由可调，边查代码/网页边使用剪贴板。
* **排版布局密度**：极客紧凑、标准黄金、宽松舒展三档自由切换。

### 8. 🌐 8 国全球母语深度本地化
* 原生支持 **简体中文 (zh-CN)**、**繁體中文 (zh-TW)**、**English (en-US)**、**日本語 (ja-JP)**、**한국어 (ko-KR)**、**Español (es-ES)**、**Deutsch (de-DE)**、**Français (fr-FR)**。
* 222+ 个词条全方位深度覆盖，包含提示词库多语言智能映射。

---

## 🚀 快捷键指南 (Shortcuts)

| 快捷键 | 作用说明 |
| :--- | :--- |
| <kbd>Alt + A</kbd> (或 <kbd>⌥ + A</kbd>) | **全局快速唤醒 / 隐藏 ClipAI 窗口** |
| <kbd>Alt + S</kbd> (或 <kbd>⌥ + S</kbd>) | **开启全局高清区域截图与标注画板** |
| <kbd>⌘ + F</kbd> / <kbd>Ctrl + F</kbd> | 快速聚焦搜索框 |
| <kbd>⌘ + Enter</kbd> / <kbd>Ctrl + Enter</kbd> | 在 AI 对话或提示词中快速发送生成 |
| <kbd>⌘ + Q</kbd> / <kbd>Alt + F4</kbd> | 彻底退出应用并关闭后台托盘进程 |

---

## 📖 详细使用教程 (Usage Guide)

### 1. 剪贴板使用
* 日常复制任何文本、链接、代码或截图，ClipAI 将在后台自动静默捕获。
* 在剪贴板列表中：
  * 单击卡片右侧的 📋 图标即可快速重新复制；
  * 点击 ✨ **AI 解析** 可直接带入 AI 对话流；
  * 点击 ⭐ 收藏可永久防止被清空。

### 2. AI 助手配置与使用
1. 点击顶部导航栏的 **「设置」** ➔ **「AI 服务商设置」**；
2. 选择你的供应商（如 `DeepSeek`、`OpenAI`、`Ollama` 等）；
3. 填入你的 `API Key`（本地 Ollama 可直接连接无需 Key）；
4. 点击 **「🔍 检测可用模型」** 选择心仪的模型（如 `deepseek-chat` 或 `gpt-4o`）；
5. 点击 **「⚡ 测试连接」** 确认延时正常即可开始畅享极速 AI 问答！

### 3. 提示词库使用与魔改
1. 进入顶部 **「AI 助手」** ➔ 子标签切换至 **「💡 提示词库」**；
2. 浏览精选的 100+ 角色（如 Linux 终端、前端架构师、周报大师等）；
3. 点击卡片底部的 **`⚡ 极速使用`** 立即载入对话；
4. 点击 **`⎘ 克隆魔改`** 可将该人设复制到自己的私有库进行定制保存。

### 4. 专注与健康定时器
1. 点击顶部标题栏右侧的 ⏱️ 计时器图标打开面板；
2. 选择「规律喝水」、「久坐活动」或「番茄专注」，点击 **「开始计时」**；
3. 窗口顶栏会显示动态倒计时胶囊，倒计时结束后将自动播放和弦铃声并弹出系统通知。

---

## 💻 开发者指南与本地构建 (Development & Build)

### 1. 环境准备
* [Node.js](https://nodejs.org/) (建议 `v18.0.0` 或更高版本)
* `npm` 或 `pnpm` / `yarn`

### 2. 克隆与安装依赖
```bash
# 克隆本仓库
git clone https://github.com/jasperJu111/clipai.git

# 进入项目目录
cd clipai

# 安装项目依赖
npm install
```

### 3. 启动本地开发调试
```bash
npm run dev
```

### 4. 打包分发构建
```bash
# 构建 macOS 安装包 (.dmg / .zip)
npm run build:mac

# 构建 Windows 安装包 (.exe / portable)
npm run build:win

# 构建全平台安装包
npm run build
```
打包生成的可执行文件将位于 `dist/` 目录下。

---

## 🛠️ 技术栈 (Tech Stack)

* **应用底座**：[Electron 30](https://www.electronjs.org/) + [electron-vite](https://evite.netlify.app/)
* **前端框架**：[React 18](https://react.dev/) + Hooks
* **样式架构**：Vanilla CSS 3（深度毛玻璃滤镜、CSS 变量色彩引擎、GPU 硬件加速渲染）
* **AI 通信**：Fetch SSE 流式传输 (Server-Sent Events) + Web Worker 异步任务
* **音频合成**：HTML5 Web Audio API（原生和弦合成，无需外挂庞大音频资源文件）
* **本地存储**：Electron Store + LocalStorage 本地加密持久化

---

## 📄 开源协议 (License)

本项目基于 [MIT License](LICENSE) 开源协议，欢迎自由使用、学习与商业衍生开发。

---

<div align="center">
  <sub>Made with ❤️ by ClipAI Community. 如果觉得好用，请为本项目点一个 ⭐ Star 鼓励一下吧！</sub>
</div>
