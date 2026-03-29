import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import { homedir, platform } from 'os'
import { join } from 'path'

const DEBUG_PAGE_URL = 'chrome://inspect/#remote-debugging'

export function getResearchBrowserProfileDir(dataDir: string): string {
  return join(dataDir, 'web-research', 'browser-profiles', 'chrome-research')
}

export function resolveChromeExecutable(): string | null {
  const configuredPath = (process.env.LABORANY_CHROME_PATH || '').trim()
  if (configuredPath && existsSync(configuredPath)) {
    return configuredPath
  }

  const os = platform()
  const home = homedir()

  const candidates = os === 'win32'
    ? [
        join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.ProgramW6432 || process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Chromium', 'Application', 'chrome.exe'),
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Chromium', 'Application', 'chrome.exe'),
      ]
    : os === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
          join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium',
        ]

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return resolveChromeFromPath()
}

export function openChromeDebugPage(): {
  platform: NodeJS.Platform
  executable: string
  url: string
} {
  const executable = resolveChromeExecutable()
  if (!executable) {
    throw new Error(buildChromeNotFoundMessage())
  }

  spawnDetached(executable, [DEBUG_PAGE_URL])
  return {
    platform: platform(),
    executable,
    url: DEBUG_PAGE_URL,
  }
}

export function launchResearchBrowser(dataDir: string): {
  platform: NodeJS.Platform
  executable: string
  profileDir: string
  port: number
} {
  const executable = resolveChromeExecutable()
  if (!executable) {
    throw new Error(buildChromeNotFoundMessage())
  }

  const profileDir = getResearchBrowserProfileDir(dataDir)
  mkdirSync(profileDir, { recursive: true })

  spawnDetached(executable, [
    `--user-data-dir=${profileDir}`,
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-session-crashed-bubble',
    'about:blank',
  ])

  return {
    platform: platform(),
    executable,
    profileDir,
    port: 9222,
  }
}

function resolveChromeFromPath(): string | null {
  const os = platform()
  const whichCommand = os === 'win32' ? 'where' : 'which'
  const names = os === 'win32'
    ? ['chrome.exe', 'chrome', 'chromium.exe', 'chromium']
    : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

  for (const name of names) {
    try {
      const result = spawnSync(whichCommand, [name], {
        encoding: 'utf-8',
        windowsHide: true,
      })
      if (result.status !== 0) continue

      const candidates = String(result.stdout || '')
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean)

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          return candidate
        }
      }
    } catch {
      // ignore and keep trying
    }
  }

  return null
}

function spawnDetached(command: string, args: string[]): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  })
  child.unref()
}

function buildChromeNotFoundMessage(): string {
  const os = platform()
  if (os === 'win32') {
    return '未找到 Chrome 可执行文件。请安装 Google Chrome，或设置环境变量 LABORANY_CHROME_PATH 指向 chrome.exe。'
  }
  if (os === 'darwin') {
    return '未找到 Google Chrome。请安装 Chrome，或设置环境变量 LABORANY_CHROME_PATH 指向 Chrome 可执行文件。'
  }
  return '未找到 Google Chrome / Chromium。请安装 Chrome，或设置环境变量 LABORANY_CHROME_PATH 指向浏览器可执行文件。'
}
