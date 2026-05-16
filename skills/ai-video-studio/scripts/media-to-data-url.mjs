#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

function usage() {
  console.error('Usage: node scripts/media-to-data-url.mjs <image-file> [--out refs.json] [--role first_frame] [--max-width 1024] [--quality 5]')
  process.exit(1)
}

function readArg(name, fallback = '') {
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

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  return 'image/png'
}

const input = process.argv[2]
if (!input || input.startsWith('--')) usage()

const inputPath = path.resolve(input)
if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${input}`)
  process.exit(1)
}

const outPath = path.resolve(readArg('--out', `${path.basename(inputPath, path.extname(inputPath))}-reference.json`))
const role = readArg('--role', 'first_frame')
const maxWidth = Number(readArg('--max-width', '1024')) || 1024
const quality = Number(readArg('--quality', '5')) || 5
const tempPath = path.join(os.tmpdir(), `laborany-ref-${Date.now()}-${process.pid}.jpg`)

const ffmpeg = resolveFfmpeg()
const convert = spawnSync(ffmpeg, [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-i', inputPath,
  '-vf', `scale='min(${maxWidth},iw)':-2`,
  '-q:v', String(quality),
  tempPath,
], { encoding: 'utf8' })

const finalPath = convert.status === 0 && fs.existsSync(tempPath) ? tempPath : inputPath
const mime = finalPath === tempPath ? 'image/jpeg' : mimeFor(finalPath)
const base64 = fs.readFileSync(finalPath).toString('base64')
const payload = {
  references: [{
    url: `data:${mime};base64,${base64}`,
    role,
    type: 'image',
  }],
}

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')
if (finalPath === tempPath) {
  fs.rmSync(tempPath, { force: true })
}

console.log(`Reference JSON saved to: ${outPath}`)
console.log(`Approx data URL bytes: ${payload.references[0].url.length}`)
