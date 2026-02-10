/**
 * ┌──────────────────────────────────────────────┐
 * │  patch-icon.js — afterPack 钩子              │
 * │  用缓存的 rcedit 为 Windows exe 嵌入图标     │
 * │  绕过 electron-builder 的 winCodeSign 下载    │
 * └──────────────────────────────────────────────┘
 */
const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/* ── 在 electron-builder 缓存中查找 rcedit ── */
function findRcedit() {
  const cacheBase = path.join(
    process.env.LOCALAPPDATA || '',
    'electron-builder', 'Cache', 'winCodeSign'
  )
  if (!fs.existsSync(cacheBase)) return null

  for (const dir of fs.readdirSync(cacheBase)) {
    const candidate = path.join(cacheBase, dir, 'rcedit-x64.exe')
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

/* ── afterPack 钩子入口 ── */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return

  const exe = path.join(context.appOutDir, 'LaborAny.exe')
  const ico = path.resolve(__dirname, '..', 'src-tauri', 'icons', 'icon.ico')

  if (!fs.existsSync(exe) || !fs.existsSync(ico)) {
    console.log('[patch-icon] 跳过: exe 或 ico 不存在')
    return
  }

  const rcedit = findRcedit()
  if (!rcedit) {
    console.log('[patch-icon] 未找到缓存的 rcedit，跳过')
    return
  }

  console.log('[patch-icon] 嵌入图标:', ico, '->', exe)
  execFileSync(rcedit, [exe, '--set-icon', ico], { stdio: 'inherit' })
  console.log('[patch-icon] 图标嵌入成功')
}
