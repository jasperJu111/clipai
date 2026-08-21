const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  // Universal builds first create temporary x64 and arm64 apps. Signing those
  // before the merge makes their CodeResources differ and breaks the merge.
  if (context.appOutDir.endsWith('-temp')) return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  // Without a paid Developer ID certificate, electron-builder otherwise leaves
  // the outer app bundle unsigned. A stable ad-hoc signature is still required
  // so macOS TCC can associate Screen Recording permission with com.clipai.app.
  execFileSync('/usr/bin/codesign', [
    '--force',
    '--deep',
    '--sign',
    '-',
    '--identifier',
    context.packager.appInfo.id,
    appPath
  ], { stdio: 'inherit' })

  execFileSync('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    appPath
  ], { stdio: 'inherit' })
}
