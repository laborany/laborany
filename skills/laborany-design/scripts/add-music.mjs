#!/usr/bin/env node
/**
 * add-music.mjs — 跨平台版本的 add-music.sh
 *
 * 把 BGM 混入 MP4 视频，自动测时长、加 0.3s fade-in 和 1s fade-out。
 *
 * 用法：
 *   node add-music.mjs <input.mp4> [--mood=<name>] [--music=<path>] [--out=<path>]
 *
 * Mood 库（在 ../assets/ 下，对应 bgm-<mood>.mp3）：
 *   tech / ad / educational / educational-alt / tutorial / tutorial-alt
 *
 * Flags：
 *   --mood=<name>     从预设库选（默认 tech）
 *   --music=<path>    自定义音频（优先级高于 --mood）
 *   --out=<path>      输出路径（默认 <input-basename>-bgm.mp4）
 *
 * 依赖解析（依次尝试）：
 *   1. process.env.LABORANY_FFMPEG (Electron 注入)
 *   2. PATH 上的 ffmpeg
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireFfmpeg, resolveFfmpeg } from './resolve-runtime.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  参数解析                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function parseArgs(argv) {
  const flags = { mood: 'tech', music: null, out: null };
  const positional = [];
  for (const a of argv) {
    if (a.startsWith('--mood=')) flags.mood = a.slice(7);
    else if (a.startsWith('--music=')) flags.music = a.slice(8);
    else if (a.startsWith('--out=')) flags.out = a.slice(6);
    else positional.push(a);
  }
  const input = positional[0] || '';
  if (!flags.music && positional[1]) flags.music = positional[1];
  if (!flags.out && positional[2]) flags.out = positional[2];
  return { input, ...flags };
}

function availableMoods() {
  if (!fs.existsSync(ASSETS_DIR)) return [];
  return fs.readdirSync(ASSETS_DIR)
    .filter(f => /^bgm-.*\.mp3$/.test(f))
    .map(f => f.replace(/^bgm-/, '').replace(/\.mp3$/, ''));
}

function usage() {
  console.error('Usage: node add-music.mjs <input.mp4> [--mood=<name>] [--music=<path>] [--out=<path>]');
  console.error(`Moods available: ${availableMoods().join(' ')}`);
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ffprobe：从 ffmpeg 目录找                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
function resolveFfprobe(ffmpegPath) {
  // ffprobe 通常与 ffmpeg 同目录
  const dir = path.dirname(ffmpegPath);
  const exe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const candidate = path.join(dir, exe);
  if (fs.existsSync(candidate)) return candidate;
  // PATH 兜底
  try {
    const cmd = process.platform === 'win32' ? `where ${exe}` : `which ${exe}`;
    const out = spawnSync(cmd, { shell: true, encoding: 'utf8' }).stdout.trim().split('\n')[0];
    if (out && fs.existsSync(out)) return out;
  } catch {}
  return null;
}

function probeDuration(ffprobePath, input) {
  if (ffprobePath) {
    const r = spawnSync(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      input,
    ], { encoding: 'utf8' });
    if (r.status === 0) {
      const d = parseFloat(r.stdout.trim());
      if (Number.isFinite(d)) return d;
    }
  }
  // fallback：用 ffmpeg 扫描（慢一点但 fallback）
  const ffmpeg = resolveFfmpeg();
  if (ffmpeg) {
    const r = spawnSync(ffmpeg, ['-i', input], { encoding: 'utf8' });
    const m = (r.stderr || '').match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    if (m) return +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
  }
  return null;
}

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  主流程                                                                   │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const args = parseArgs(process.argv.slice(2));

if (!args.input || !fs.existsSync(args.input)) {
  usage();
  process.exit(1);
}

let music;
let sourceLabel;
if (args.music) {
  music = args.music;
  sourceLabel = `custom: ${music}`;
} else {
  music = path.join(ASSETS_DIR, `bgm-${args.mood}.mp3`);
  sourceLabel = `mood: ${args.mood}`;
}

if (!fs.existsSync(music)) {
  console.error(`✗ Music not found: ${music}`);
  console.error(`  Available moods: ${availableMoods().join(' ')}`);
  process.exit(1);
}

const inputAbs = path.resolve(args.input);
const inputDir = path.dirname(inputAbs);
const inputName = path.basename(args.input, path.extname(args.input));
const output = args.out || path.join(inputDir, `${inputName}-bgm.mp4`);

const ffmpegPath = requireFfmpeg();
const ffprobePath = resolveFfprobe(ffmpegPath);

const duration = probeDuration(ffprobePath, inputAbs);
if (duration == null) {
  console.error('✗ Could not read video duration');
  process.exit(1);
}
const fadeOutStart = Math.max(0, duration - 1);

console.log('▸ Mixing BGM into video');
console.log(`  input:    ${inputAbs}`);
console.log(`  music:    ${sourceLabel}`);
console.log(`  duration: ${duration.toFixed(2)}s`);
console.log(`  output:   ${output}`);

const r = spawnSync(ffmpegPath, [
  '-y', '-loglevel', 'error',
  '-i', inputAbs,
  '-i', music,
  '-filter_complex',
  `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.3,afade=t=out:st=${fadeOutStart}:d=1[a]`,
  '-map', '0:v', '-map', '[a]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest',
  output,
], { stdio: 'inherit' });

if (r.status !== 0) {
  console.error('✗ ffmpeg failed');
  process.exit(r.status || 1);
}

const size = fs.statSync(output).size;
console.log(`✓ Done: ${output} (${(size / 1024 / 1024).toFixed(1)} MB)`);
