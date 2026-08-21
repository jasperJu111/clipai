import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// macOS 的录屏权限列表读取 Electron.app 的 Info.plist，而不是运行时窗口标题。
// 开发启动前为 Electron 外壳设置独立名称与 Bundle ID，避免与安装版 ClipAI 混淆。
if (process.platform === 'darwin') {
  const candidates = [
    join(process.cwd(), 'node_modules/electron/dist/ClipAI.app'),
    join(process.cwd(), 'node_modules/electron/dist/Electron.app')
  ]
  const devAppPath = candidates.find((path) => existsSync(path))

  if (devAppPath) {
    const plistPath = join(devAppPath, 'Contents/Info.plist')
    const setPlistValue = (key, value) => {
      try {
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath])
      } catch {
        execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plistPath])
      }
    }

    setPlistValue('CFBundleName', 'ClipAI DEV')
    setPlistValue('CFBundleDisplayName', 'ClipAI DEV')
    setPlistValue('CFBundleIdentifier', 'com.clipai.app.dev')

    // Info.plist 变化后重新进行本地 ad-hoc 签名，仅供本机开发运行。
    execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', devAppPath], {
      stdio: 'inherit'
    })
    console.log('✅ 开发版系统身份已设置为 ClipAI DEV (com.clipai.app.dev)')
  }
}
