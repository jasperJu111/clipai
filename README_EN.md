# 📋 ClipAI — Next-Gen AI-Powered Clipboard with Premium Aesthetics

<div align="center">

<img src="resources/icon.png" width="128" height="128" alt="ClipAI Icon" style="border-radius: 28px; box-shadow: 0 12px 36px rgba(0,0,0,0.3);" />

<h3>✨ Fast Clipboard · Multimodal AI · 12 Dynamic Themes · Prompts Center · Pro Annotation Canvas · Wellness Timer</h3>

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

## 🌟 About ClipAI

**ClipAI** is an ultra-fast, visually stunning, open-source smart clipboard workstation crafted for developers, creators, researchers, and productivity power users.

Combining 60 FPS silky-smooth frosted glass aesthetics with deep **local & cloud multimodal LLM integration (DeepSeek, OpenAI, Claude, Gemini, Ollama, etc.)**, ClipAI turns your daily copying, screenshots, research, and coding into an effortless superpower.

---

## ✨ Key Features

### 1. 📋 Smart Clipboard Management
* **Universal Capture**: Automatically archives formatted text, syntax-highlighted code snippets, high-res images, web URLs, and screenshots.
* **Instant Search & Persistence**: Instant fuzzy search with `⌘F`, local encryption storage with customizable history limits (50 to 1000 items).
* **Pin & Favorites**: One-click ⭐ favorite or 📌 pin for critical snippets.

### 2. 🤖 Multi-Model AI Powerhouse
* **Multi-Provider Support**: Out-of-the-box support for **DeepSeek**, **OpenAI (GPT-4o)**, **Anthropic (Claude 3.5)**, **Google (Gemini 1.5 Pro)**, **Ollama (local offline models)**, and custom OpenAI-compatible proxies.
* **One-Click Model Probe**: Automatically detects available models under your API key without manual typing.
* **Curated Quick Actions**: Text polish, summary bullets, grammar correction, code explanation, bug fixing, table formatting, and multi-language translation.

### 3. 🐱 AimakeX Ecosystem Integration
* Deeply integrated AimakeX AI workspace: seamlessly send rich clipboard context to AimakeX multi-agent pipelines with one click.

### 4. 🌟 100+ Prompts Center
* **4-in-1 Library**: Curated (100+), Custom Library, My Favorites, and Recent Usage.
* **Clone & Customize**: Duplicate any community preset into your private library for personalized tuning.
* **Import & Export**: Effortless JSON backup and cross-device sync.

### 5. 📸 Area Screenshot & Annotation Canvas (ScreenSnipper)
* **Global Summon**: Press `Alt+S` (or click 📸 on the title bar) to freeze the screen and capture any region.
* **Pro-Grade Annotation**: Rectangles, circles, directional arrows, freehand brush, typography, and privacy pixelation/mosaics.
* **AI Visual Intelligence**: Perform OCR text extraction, visual summarization, multi-language translation, or Q&A directly on the screenshot.

### 6. ⏱️ Health & Focus Timer
* **Dynamic Header Capsule**: Breathing countdown indicator on the top bar.
* **Science-Backed Presets**: Hydration (45 min), Stretch & Move (50 min), Meal Reminders, Classic Pomodoro (25+5 min), and 20-20-20 Eye Relaxation.
* **Chime Audio & System Notifications**: Web Audio harmonic chimes paired with native macOS/Windows Notification Center alerts (works even when the app is running in the background).

### 7. 🎨 12 Themes & Custom Wallpaper Engine
* **12 Handcrafted Themes**: iOS Liquid Glass, Linear Obsidian, Raycast Crimson, Arc Neon Mesh, Sequoia Glacier, Emerald Aurora, Sunset Amber, Hacker Matrix, Apple Ceramic White, Velvet Milk White, Alpine Blue Mist, etc.
* **Custom Wallpaper**: Upload your own image with real-time **Frosted Glass Blur** and **Dark Dimming Overlay** sliders.
* **Window Opacity**: 65% to 100% translucent background for referencing code behind the window.
* **Layout Density**: Compact, Standard, and Relaxed.

### 8. 🌐 8 Native Languages
* Full localized support for **简体中文**, **繁體中文**, **English**, **日本語**, **한국어**, **Español**, **Deutsch**, and **Français**.

---

## 🚀 Shortcuts

| Shortcut | Description |
| :--- | :--- |
| <kbd>Alt + A</kbd> (or <kbd>⌥ + A</kbd>) | **Global toggle (Show / Hide ClipAI)** |
| <kbd>Alt + S</kbd> (or <kbd>⌥ + S</kbd>) | **Summon Area Screenshot & Annotation Tool** |
| <kbd>⌘ + F</kbd> / <kbd>Ctrl + F</kbd> | Focus Search Bar |
| <kbd>⌘ + Enter</kbd> / <kbd>Ctrl + Enter</kbd> | Send / Generate in AI Chat |
| <kbd>⌘ + Q</kbd> / <kbd>Alt + F4</kbd> | Quit application and terminate background tray |

---

## 💻 Development & Build

```bash
# Clone the repository
git clone https://github.com/jasperJu111/clipai.git

# Enter directory
cd clipai

# Install dependencies
npm install

# Start local dev environment
npm run dev

# Build macOS installer (.dmg / .zip)
npm run build:mac

# Build Windows installer (.exe)
npm run build:win
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

<div align="center">
  <sub>Made with ❤️ by ClipAI Community. If you find ClipAI helpful, please give it a ⭐ Star on GitHub!</sub>
</div>
