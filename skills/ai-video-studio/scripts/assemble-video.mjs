#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

function usage() {
  console.error('Usage: node scripts/assemble-video.mjs --manifest assembly-manifest.json [--out final-video.mp4]')
  process.exit(1)
}

function arg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index === -1) return fallback
  return process.argv[index + 1] || fallback
}

function resolveFfmpeg() {
  if (process.env.LABORANY_FFMPEG && fs.existsSync(process.env.LABORANY_FFMPEG)) {
    return process.env.LABORANY_FFMPEG
  }
  return 'ffmpeg'
}

function resolveFfprobe(ffmpeg) {
  const exe = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  const sibling = path.join(path.dirname(ffmpeg), exe)
  if (fs.existsSync(sibling)) return sibling
  return ''
}

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) {
    throw new Error(`${label} failed: cannot start ${command}. ${result.error.message}`)
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').slice(-2000)
    throw new Error(`${label} failed: ${stderr}`)
  }
}

function hasAudio(ffprobe, ffmpeg, file) {
  if (ffprobe) {
    const result = spawnSync(ffprobe, [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=index',
      '-of', 'csv=p=0',
      file,
    ], { encoding: 'utf8' })
    if (!result.error) {
      return result.status === 0 && Boolean((result.stdout || '').trim())
    }
  }

  const result = spawnSync(ffmpeg, ['-hide_banner', '-i', file], { encoding: 'utf8' })
  const streamInfo = `${result.stderr || ''}\n${result.stdout || ''}`
  return /\bAudio:/i.test(streamInfo)
}

const manifestArg = arg('--manifest')
if (!manifestArg) usage()

const manifestPath = path.resolve(manifestArg)
const manifestDir = path.dirname(manifestPath)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const clips = Array.isArray(manifest.clips) ? manifest.clips : []
if (clips.length === 0) {
  throw new Error('assembly-manifest.json must contain clips[]')
}

const format = manifest.format || {}
const width = Number(format.width || 1080)
const height = Number(format.height || 1920)
const fps = Number(format.fps || 30)
const output = path.resolve(manifestDir, arg('--out', manifest.output || 'final-video.mp4'))
const ffmpeg = resolveFfmpeg()
const ffprobe = resolveFfprobe(ffmpeg)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'laborany-assemble-'))

try {
  const normalized = []

  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index]
    const source = path.resolve(manifestDir, clip.file || clip)
    if (!fs.existsSync(source)) {
      throw new Error(`Clip not found: ${source}`)
    }

    const out = path.join(tmpDir, `clip-${String(index + 1).padStart(3, '0')}.mp4`)
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${fps},setsar=1`

    if (hasAudio(ffprobe, ffmpeg, source)) {
      run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', source,
        '-map', '0:v:0',
        '-map', '0:a:0',
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        '-shortest',
        out,
      ], `Normalize ${source}`)
    } else {
      run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', source,
        '-f', 'lavfi',
        '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-vf', vf,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-ar', '48000',
        '-ac', '2',
        '-shortest',
        out,
      ], `Normalize ${source}`)
    }

    normalized.push(out)
  }

  const concatList = path.join(tmpDir, 'concat.txt')
  fs.writeFileSync(
    concatList,
    normalized.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8',
  )

  const joined = path.join(tmpDir, 'joined.mp4')
  run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatList,
    '-c', 'copy',
    joined,
  ], 'Concat clips')

  const audio = manifest.audio || {}
  const audioFile = audio.file ? path.resolve(manifestDir, audio.file) : ''
  if (audioFile && fs.existsSync(audioFile)) {
    const volume = Number(audio.volume || 0.18)
    const mode = audio.mode || 'mix'
    if (mode === 'replace') {
      run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', joined,
        '-stream_loop', '-1',
        '-i', audioFile,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        output,
      ], 'Replace audio')
    } else {
      run(ffmpeg, [
        '-hide_banner', '-loglevel', 'error', '-y',
        '-i', joined,
        '-stream_loop', '-1',
        '-i', audioFile,
        '-filter_complex', `[0:a]volume=1.0[a0];[1:a]volume=${volume}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[a]`,
        '-map', '0:v:0',
        '-map', '[a]',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        output,
      ], 'Mix audio')
    }
  } else {
    fs.copyFileSync(joined, output)
  }

  console.log(`Final video saved to: ${output}`)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
