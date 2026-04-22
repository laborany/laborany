#!/usr/bin/env node
/**
 * fetch-ffmpeg-bundles.mjs
 *
 * 把 ffmpeg 静态二进制下载到 ffmpeg-bundle-{platform}/ 目录，
 * 供 laborany-design skill 在打包后使用。
 *
 * 用法：
 *   node scripts/fetch-ffmpeg-bundles.mjs [--platform=current|all]
 *
 * 二进制来源：https://github.com/eugeneware/ffmpeg-static（BtbN builds, LGPL）
 *   - darwin-arm64  → macos-arm64
 *   - darwin-x64    → macos-x64
 *   - linux-x64     → linux-x64
 *   - win-x64       → win-x64.exe
 *
 * 设计：
 *   - 幂等：已存在就跳过
 *   - 默认只下载当前平台；CI 打包要跑 --platform=all
 *   - 下载失败给明确提示（CI 里直接 fail）
 *
 * LICENSE：ffmpeg 本体 LGPL/GPL，随 LaborAny 分发需要在发行包里保留 ffmpeg LICENSE。
 * 见 https://ffmpeg.org/legal.html
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  下载源（ffmpeg-static v5.2.0，来自 BtbN release 的 LGPL 静态编译版本）    │
 * │  这些 URL 来自 eugeneware/ffmpeg-static 的 package.json                    │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const VERSION = 'b6.1.1';
const BASE = `https://github.com/eugeneware/ffmpeg-static/releases/download/${VERSION}`;

const PLATFORMS = {
  'darwin-arm64': { url: `${BASE}/ffmpeg-darwin-arm64`, outName: 'ffmpeg',     mode: 0o755 },
  'darwin-x64':   { url: `${BASE}/ffmpeg-darwin-x64`,   outName: 'ffmpeg',     mode: 0o755 },
  'linux-x64':    { url: `${BASE}/ffmpeg-linux-x64`,    outName: 'ffmpeg',     mode: 0o755 },
  'win-x64':      { url: `${BASE}/ffmpeg-win32-x64`,    outName: 'ffmpeg.exe', mode: 0o755 },
};

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  工具函数                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function currentPlatformKey() {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64') return 'darwin-arm64';
  if (platform === 'darwin' && arch === 'x64')   return 'darwin-x64';
  if (platform === 'linux'  && arch === 'x64')   return 'linux-x64';
  if (platform === 'win32'  && arch === 'x64')   return 'win-x64';
  return null;
}

function download(url, outPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outPath);
    const req = https.get(url, { headers: { 'User-Agent': 'laborany-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(outPath);
        download(res.headers.location, outPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outPath);
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    });
    req.on('error', reject);
  });
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  主流程                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
async function fetchOne(key) {
  const spec = PLATFORMS[key];
  const dir = path.join(REPO_ROOT, `ffmpeg-bundle-${key}`);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, spec.outName);
  if (fs.existsSync(out) && fs.statSync(out).size > 1_000_000) {
    console.log(`[skip] ${key} already present at ${out}`);
    return;
  }
  console.log(`[fetch] ${key} ← ${spec.url}`);
  await download(spec.url, out);
  fs.chmodSync(out, spec.mode);
  console.log(`[done]  ${key} → ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
}

async function main() {
  const arg = process.argv.find(a => a.startsWith('--platform='));
  const target = arg ? arg.split('=')[1] : 'current';

  let keys;
  if (target === 'all') {
    keys = Object.keys(PLATFORMS);
  } else if (target === 'current') {
    const k = currentPlatformKey();
    if (!k) {
      console.error(`[error] unsupported platform ${process.platform}/${process.arch}`);
      process.exit(1);
    }
    keys = [k];
  } else if (PLATFORMS[target]) {
    keys = [target];
  } else {
    console.error(`[error] unknown platform: ${target}`);
    console.error(`  valid: current | all | ${Object.keys(PLATFORMS).join(' | ')}`);
    process.exit(1);
  }

  for (const k of keys) {
    try {
      await fetchOne(k);
    } catch (e) {
      console.error(`[fail] ${k}: ${e.message}`);
      process.exitCode = 1;
    }
  }
}

main();
