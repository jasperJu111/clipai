# 📋 ClipAI — 融合极致美学与 AI 生产力的下一代智能剪贴板

<div align="center">

<img src="resources/icon.png" width="128" height="128" alt="ClipAI Icon" style="border-radius: 28px; box-shadow: 0 12px 36px rgba(0,0,0,0.3);" />

<h3>✨ 智能剪贴 · 多模态 AI · 极速截图标注 · 100+ 提示词 · 12 套灵动主题 · 健康番茄钟</h3>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%2010%2F11-blue?style=flat-square&logo=apple" alt="Platform" />
  <img src="https://img.shields.io/badge/Version-v0.1.3-orange?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/Electron-29.4-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18.3-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-5.4-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Languages-8%20Languages-success?style=flat-square" alt="Languages" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License" />
</p>

[简体中文](README.md) · [English](README_EN.md)

</div>

---

## 🌟 项目简介 (About ClipAI)

**ClipAI** 是一款专为开发者、创作者、学者与职场精英打造的**高颜值、全能型开源智能剪贴板与生产力工作台**。

它深度融合了 **macOS 与 Windows 10/11** 原生设计语言，提供 60 帧流畅亚克力毛玻璃视觉质感，更无缝集成了 **本地与云端多模态大语言模型（DeepSeek、OpenAI、Claude、Gemini、Ollama 等）**，让每一次复制、截图、标注、问答与写作都极速高效。

---

## ✨ 核心功能矩阵 (Feature Highlights)

### 1. 📋 极速智能剪贴板管理 (Smart Clipboard)
* **全格式智能捕获**：实时监控文本、代码语法高亮、高清图片、富文本及链接，智能哈希去重。
* **毫秒级模糊检索**：支持全局快速唤醒与 `⌘F` / `Ctrl+F` 实时模糊搜索，支持按「全部 / 文本 / 图片 / 收藏」多维筛选。
* **置顶收藏与历史管理**：支持一键 ⭐ 收藏与 📌 置顶常用片段，历史容量可自定（50 ~ 1000 条），支持一键清空非收藏条目。
* **磁盘持久化与配额保护**：图片采用磁盘结构化持久化存储与缩略图缓存，内置智能 LRU 自动清理，杜绝内存膨胀。

### 2. 📸 极速十字准星截图与专业画板标注 (Screen Capture & Annotation)
* **跨平台原生级截图体验**：
  * **macOS & Windows 深度适配**：零外部依赖，毫秒级响应。
  * **全局快捷键一键呼出**：macOS 默认 `⌘⌥A`，Windows 默认 `Alt+A` / `Ctrl+Shift+A`（支持自由自定义或禁用）。
  * **流畅交互**：十字准星精准定格，支持 8 锚点自由缩放、动态像素尺寸徽标，按 `Space`（空格键）一键选取全屏。
  * **极速完成/取消**：双击选区或按 `Enter` 快速复制并保存；按 `Esc` 或鼠标右键瞬时退出。
* **高清截图查看与标注画板 (ImageViewer)**：
  * 截图后点击 **`✏️ 标注编辑`** 直通专业图片标注工具箱。
  * **完整标注工具**：矩形框选、圆形、方向箭头、画笔自由涂鸦、文字排版（支持字号与色彩定制）、智能马赛克打码、撤销上一步、一键清屏。
  * **图像控制与输出**：支持无级缩放、90° 旋转、适应窗口、一键复制到剪贴板与保存至本地。
  * **AI 视觉多模态分析**：在标注窗口内直接点击 **`✨ 问 AI`** 进行 **OCR 文字提取**、**多语翻译**、**图表解析** 与 **代码答疑**。

### 3. 🤖 多模型 AI 智能助手与智造喵 (AI Assistant & AimakeX)
* **最新模型动态接入**：支持接入 **OpenAI**、**Anthropic Claude**、**Google Gemini**、**DeepSeek**、**Ollama 本地模型**等平台面向当前 API 账户开放的最新模型，以及任何 OpenAI 兼容接口，无需在应用中写死模型版本号。
* **自动发现与手动配置**：可自动扫描并列出当前 API 账户实际可用的模型，也支持手动填写模型名称，方便在服务商发布新模型后快速接入。
* **🐱 智造喵工作台**：内置智造喵入口，可在 ClipAI 内直接打开智造喵，并将剪贴板内容快速填入工作区。相关项目：[**@PlexPt/awesome-chatgpt-prompts-zh**](https://github.com/PlexPt/awesome-chatgpt-prompts-zh)。
* **高频场景快捷指令**：
  * ✨ **文章润色**：深度重构文本，提升专业度与表达力。
  * 📝 **智能摘要**：快速提取长文核心要点（Bullet Points）。
  * 🔍 **语法校对**：精准修正错别字、标点与语病。
  * 💡 **代码解析**：深度拆解代码逻辑与算法实现。
  * 🐞 **查找修复 Bug**：一键排查代码潜在漏洞与边界条件。
  * 📊 **整理表格**：杂乱文本/JSON 快速转换为标准 Markdown 表格。
  * 🌐 **多语互译**：支持 8 种语言地道精准互译。

### 4. 🌟 100+ 提示词中心 (Prompts Center)
* **开源提示词资源**：精选内容参考 [**@f/prompts.chat**](https://github.com/f/prompts.chat) 开源提示词库，并在 ClipAI 内提供便捷检索与调用体验。
* **4 合 1 提示词库**：**精选库 (100+)**、**私有自建库**、**我的收藏**、**最近使用**。
* **全分类覆盖**：编程开发、文案写作、职场效率、学术科研、创意设计、生活娱乐等。
* **自定义创建与管理**：支持自由新建、编辑、分类、收藏和删除个人提示词。
* **一键克隆与自由魔改**：遇到优秀的角色设定，可一键克隆到私有库继续修改和定制。
* **导入导出备份**：支持标准 JSON 格式备份与跨设备轻松迁移。

### 5. ⏱️ 科学健康作息与番茄钟专注系统 (Wellness & Focus Timer)
* **灵动胶囊倒计时**：顶栏呼吸胶囊实时显示剩余时间，不干扰正常工作。
* **科学健康预设**：
  * 💧 **规律喝水**（推荐 45 分钟）
  * 🚶 **久坐活动**（推荐 50 分钟）
  * 🍱 **按时就餐**（午餐/晚餐提醒）
  * 🍅 **标准番茄工作法**（25 分钟深度沉浸 + 5 分钟小休）
  * 👀 **20-20-20 护眼法则**（每 20 分钟远眺 20 英尺外放松 20 秒）
* **强提醒与和弦音效**：Web Audio 优雅和弦提示音 + macOS/Windows 原生通知中心强提醒（应用隐藏在后台依然准时送达，支持「稍后 5 分钟」再提醒）。
* **今日健康数据看板**：实时统计今日番茄钟专注次数与健康达标概览。

### 6. 🎨 12 套顶级主题与个性化定制 (Aesthetics & Personalization)
* **12 款精雕细琢的主题配色**：
  * 📱 **iOS 灵动液态** (Dynamic Island 液态玻璃)
  * 💎 **Linear 黑曜星空** (极光靛青 · 黑曜石深邃暗夜)
  * ⚡ **Raycast 赤红之夜** (深渊午夜 · 绯红能量)
  * 🌈 **Arc 弥生霓虹** (流体渐变 · 极光霓虹网格)
  * 🧊 **Sequoia 冰川晶透** (macOS 冰川蓝 · 晶莹剔透玻璃)
  * 🌲 **翡翠极光**、🌅 **落日余晖**、👾 **黑客矩阵**、🏙️ **Apple 陶瓷白**、☕ **暖阳丝绒白**、🌫️ **冷杉薄雾蓝** 等。
* **自定义壁纸与背景微调**：支持上传本地图片壁纸，支持**毛玻璃虚化度 (Blur)** 与 **暗度遮光 (Dim Overlay)** 无级调节。
* **窗口背景不透明度 (Opacity)**：65% ~ 100% 自由可调，边看背景代码/文档边使用剪贴板。
* **排版布局密度**：极客紧凑、标准黄金、宽松舒展三档自由切换。

### 7. 🌐 8 国全球语言深度本地化 (i18n)
全界面（主面板、设置、截图工具栏、标注查看器）完整原生支持 8 种语言，实时无缝热切换：
- 🇨🇳 简体中文 (zh-CN)
- 🇭🇰 繁體中文 (zh-TW)
- 🇺🇸 English (en-US)
- 🇯🇵 日本語 (ja-JP)
- 🇰🇷 한국어 (ko-KR)
- 🇪🇸 Español (es-ES)
- 🇩🇪 Deutsch (de-DE)
- 🇫🇷 Français (fr-FR)

### 8. 🔒 极致隐私与安全加固 (Security & Privacy First)
* **100% 本地优先**：历史数据与图片全本地存储，零云端上传，无隐私泄露风险。
* **硬件级密态加密**：API Key 采用系统硬件安全层（Electron `safeStorage` / Keychain / DPAPI）密态加密。
* **日志与界面全流程脱敏**：敏感 API Key 自动掩码，防止截屏或日志外泄。
* **配置自动备份容灾**：启动时自动执行脱敏配置备份，保障数据万无一失。

---

## 🙏 开源引用与致谢 (Open-Source Credits)

ClipAI 的智造喵入口及提示词功能参考或集成了以下优秀项目：

* 🐱 **智造喵相关项目**：[**@PlexPt/awesome-chatgpt-prompts-zh**](https://github.com/PlexPt/awesome-chatgpt-prompts-zh)
* 💡 **prompts.chat 开源提示词库**：[**@f/prompts.chat**](https://github.com/f/prompts.chat)

感谢以上项目作者与开源社区的贡献。使用相关内容时，请同时遵循对应上游项目的许可证要求。

---

## ⌨️ 快捷键指南 (Shortcuts)

| 功能说明 | macOS 快捷键 | Windows 快捷键 |
| :--- | :--- | :--- |
| **唤醒 / 隐藏 ClipAI 主窗口** | <kbd>⌥ + Space</kbd> (或 <kbd>⌘ + ⇧ + V</kbd>) | <kbd>Ctrl + Shift + V</kbd> (或 <kbd>Alt + V</kbd>) |
| **极速全屏交互截图** | <kbd>⌥ + A</kbd> (或 <kbd>⌘ + ⌥ + A</kbd>) | <kbd>Alt + A</kbd> (或 <kbd>Ctrl + Shift + A</kbd>) |
| **快速聚焦搜索框** | <kbd>⌘ + F</kbd> | <kbd>Ctrl + F</kbd> |
| **AI 对话 / 提示词发送** | <kbd>⌘ + Enter</kbd> | <kbd>Ctrl + Enter</kbd> |
| **截图全屏选区** | <kbd>Space</kbd> (空格键) | <kbd>Space</kbd> (空格键) |
| **截图完成并复制** | <kbd>Enter</kbd> (或双击选区) | <kbd>Enter</kbd> (或双击选区) |
| **取消截图 / 关闭弹窗** | <kbd>Esc</kbd> (或鼠标右键) | <kbd>Esc</kbd> (或鼠标右键) |

---

## 📦 下载与安装 (Downloads)

前往 [GitHub Releases](https://github.com/jasperJu111/clipai/releases) 下载最新 **v0.1.3** 安装包：

| 平台 | 架构 | 安装包类型 | 下载文件名 |
| :--- | :--- | :--- | :--- |
| **Windows** | x64 (64-bit) | NSIS 一键安装包 | `ClipAI-0.1.3-windows-x64-setup.exe` |
| **macOS** | Universal (Apple Silicon M系列 & Intel) | DMG 镜像 | `ClipAI-0.1.3-universal.dmg` |
| **macOS** | Universal | 绿色免安装 ZIP | `ClipAI-0.1.3-universal-mac.zip` |

---

## 🛠️ 本地开发与构建 (Development)

```bash
# 1. 克隆代码仓库
git clone https://github.com/jasperJu111/clipai.git
cd clipai

# 2. 安装依赖
npm install

# 3. 启动开发模式
npm run dev

# 4. 执行自动化测试 (81项单元与集成测试)
npm test

# 5. 打包构建
npm run package:mac   # 构建 macOS Universal DMG
npm run package:win   # 构建 Windows x64 安装包
```

---

## 📄 开源协议 (License)

本项目基于 [MIT License](LICENSE) 协议开源。
