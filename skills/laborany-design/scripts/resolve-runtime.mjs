/**
 * resolve-runtime.mjs
 *
 * laborany-design skill 的运行时依赖解析 helper：
 *   - resolveFfmpeg()      → 找 ffmpeg 路径（优先 LABORANY_FFMPEG，其次 PATH）
 *   - resolveChrome()      → 找系统 Chrome 路径（mac/win/linux 标准位置 + PATH 兜底）
 *   - launchPlaywright()   → 用本地 Chrome 启动 Playwright（不下载 Chromium）
 *
 * 设计目标：
 *   - LaborAny 用户在 Electron 里跑，ffmpeg 内置、Chrome 复用本地
 *   - 也能在开发者本地独立跑（只要装了 ffmpeg + Chrome）
 *   - 找不到依赖时给清晰错误信息 + 安装引导，绝不静默失败
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ffmpeg                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function resolveFfmpeg() {
  // 1. 环境变量（Electron 主进程注入）
  const envPath = process.env.LABORANY_FFMPEG;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2. PATH 上的 ffmpeg
  try {
    const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
    const out = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
    if (out && fs.existsSync(out)) return out;
  } catch {}

  // 3. 兜底：返回 'ffmpeg'，让 spawn 报错，然后由调用方拿到清晰错误
  return null;
}

export function requireFfmpeg() {
  const p = resolveFfmpeg();
  if (!p) {
    console.error('');
    console.error('❌ 找不到 ffmpeg。');
    console.error('   LaborAny 包内应已内置 ffmpeg；若在 dev 环境，请手动安装：');
    console.error('     macOS:  brew install ffmpeg');
    console.error('     Windows: winget install ffmpeg');
    console.error('     Linux:  apt-get install ffmpeg');
    console.error('');
    process.exit(1);
  }
  return p;
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Chrome（给 Playwright 复用，不下载 Chromium）                             │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export function resolveChrome() {
  // 1. 环境变量
  const envPath = process.env.LABORANY_CHROME || process.env.CHROME_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2. 平台标准路径
  const candidates = [];
  if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    );
  } else if (process.platform === 'win32') {
    const pf = process.env['ProgramFiles'] || 'C:\\Program Files';
    const pfx86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env['LOCALAPPDATA'] || '';
    candidates.push(
      path.join(pf, 'Google/Chrome/Application/chrome.exe'),
      path.join(pfx86, 'Google/Chrome/Application/chrome.exe'),
      path.join(local, 'Google/Chrome/Application/chrome.exe'),
      path.join(pf, 'Microsoft/Edge/Application/msedge.exe'),
      path.join(pfx86, 'Microsoft/Edge/Application/msedge.exe'),
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    );
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // 3. PATH 兜底
  try {
    const names = process.platform === 'win32'
      ? ['chrome.exe', 'msedge.exe']
      : ['google-chrome', 'chromium'];
    for (const name of names) {
      const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
      try {
        const out = execSync(cmd, { encoding: 'utf8' }).trim().split('\n')[0];
        if (out && fs.existsSync(out)) return out;
      } catch {}
    }
  } catch {}

  return null;
}

export function requireChrome() {
  const p = resolveChrome();
  if (!p) {
    console.error('');
    console.error('❌ 找不到 Chrome / Chromium 浏览器。');
    console.error('   设计大师的 PDF / PPTX / 视频导出功能依赖本地 Chrome。');
    console.error('');
    console.error('   请安装 Chrome：https://www.google.com/chrome/');
    console.error('   （或 Edge / Chromium 也可以）');
    console.error('');
    console.error('   安装后重启 LaborAny 即可。');
    console.error('');
    process.exit(1);
  }
  return p;
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  Playwright launch 快捷方法                                               │
 * └──────────────────────────────────────────────────────────────────────────┘ */
export async function launchPlaywrightChrome(opts = {}) {
  // 动态 import 保持此 helper 轻量（不强制依赖 playwright）
  const { chromium } = await import('playwright');
  const executablePath = requireChrome();
  return chromium.launch({
    executablePath,
    headless: opts.headless !== false,
    args: opts.args,
    ...opts,
  });
}
