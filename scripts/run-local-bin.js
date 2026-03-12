#!/usr/bin/env node

const { spawnSync } = require('child_process')
const { existsSync } = require('fs')
const { join } = require('path')

const argv = process.argv.slice(2)
const tool = argv[0]
const args = argv.slice(1)

if (!tool) {
  console.error('[run-local-bin] Usage: node scripts/run-local-bin.js <tool> [...args]')
  process.exit(1)
}

const cwd = process.cwd()
const candidates = process.platform === 'win32'
  ? [
      join(cwd, 'node_modules', '.bin', `${tool}.cmd`),
      join(cwd, 'node_modules', '.bin', tool),
    ]
  : [join(cwd, 'node_modules', '.bin', tool)]

const binary = candidates.find(p => existsSync(p))
if (!binary) {
  console.error(`[run-local-bin] Cannot find local tool "${tool}" in ${cwd}/node_modules/.bin`)
  process.exit(1)
}

const result = spawnSync(binary, args, {
  cwd,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
