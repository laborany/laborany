#!/usr/bin/env node
/**
 * convert-formats.mjs — 跨平台版本的 convert-formats.sh
 *
 * 把 MP4 动画转成 60fps MP4 + 调色优化的 GIF。
 *
 * 用法：
 *   node convert-formats.mjs <input.mp4> [gif_width] [--minterpolate]
 *
 * 产物（和输入同目录）：
 *   <name>-60fps.mp4   (1920x1080, 60fps，默认帧复制)
 *   <name>.gif         (指定宽度, 15fps, palette 优化)
 *
 * --minterpolate：启用 motion-compensated 插帧（高质量，但 QuickTime/Safari 兼容性有坑，谨慎）
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireFfmpeg } from './resolve-runtime.mjs';

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  参数解析                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const argv = process.argv.slice(2);
let input = '';
let gifWidth = '960';
let useMinterpolate = false;
for (const a of argv) {
  if (a === '--minterpolate') useMinterpolate = true;
  else if (a.startsWith('--')) {
    console.error(`Unknown flag: ${a}`);
    process.exit(1);
  } else if (!input) input = a;
  else gifWidth = a;
}
if (!input) {
  console.error('Usage: node convert-formats.mjs <input.mp4> [gif_width] [--minterpolate]');
  process.exit(1);
}

const inputAbs = path.resolve(input);
const dir = path.dirname(inputAbs);
const base = path.basename(input, path.extname(input));
const out60 = path.join(dir, `${base}-60fps.mp4`);
const outGif = path.join(dir, `${base}.gif`);
const pal = path.join(dir, `.palette-${base}.png`);

const ffmpeg = requireFfmpeg();

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  60fps MP4                                                                │
 * └──────────────────────────────────────────────────────────────────────────┘ */
const vfilter = useMinterpolate
  ? 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1'
  : 'fps=60';

console.log(`▸ 60fps ${useMinterpolate ? 'interpolate (minterpolate, high quality)' : 'frame-duplicate (compat mode)'}: ${out60}`);

let r = spawnSync(ffmpeg, [
  '-y', '-loglevel', 'error',
  '-i', inputAbs,
  '-vf', vfilter,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
  '-profile:v', 'high', '-level', '4.0',
  '-crf', '18', '-preset', 'medium',
  '-movflags', '+faststart',
  out60,
], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`  ✓ ${(fs.statSync(out60).size / 1024 / 1024).toFixed(1)} MB`);

/* ┌──────────────────────────────────────────────────────────────────────────┐
 * │  GIF (palette 优化两遍法)                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘ */
console.log(`▸ GIF (${gifWidth}w, 15fps, palette-optimized): ${outGif}`);

r = spawnSync(ffmpeg, [
  '-y', '-loglevel', 'error',
  '-i', inputAbs,
  '-vf', `fps=15,scale=${gifWidth}:-1:flags=lanczos,palettegen=stats_mode=diff`,
  pal,
], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);

r = spawnSync(ffmpeg, [
  '-y', '-loglevel', 'error',
  '-i', inputAbs,
  '-i', pal,
  '-lavfi', `fps=15,scale=${gifWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  outGif,
], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);

try { fs.unlinkSync(pal); } catch {}
console.log(`  ✓ ${(fs.statSync(outGif).size / 1024 / 1024).toFixed(1)} MB`);
