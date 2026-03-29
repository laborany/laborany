#!/usr/bin/env node

const { spawnSync } = require('child_process')
const { existsSync, readFileSync } = require('fs')
const { join, resolve } = require('path')

const workspaceArg = (process.argv[2] || '').trim()

if (!workspaceArg) {
  console.error('[run-platform-pkg] Usage: node scripts/run-platform-pkg.js <workspace>')
  process.exit(1)
}

const rootDir = resolve(__dirname, '..')
const workspaceDir = resolve(rootDir, workspaceArg)
const packageJsonPath = join(workspaceDir, 'package.json')

if (!existsSync(packageJsonPath)) {
  console.error(`[run-platform-pkg] package.json not found: ${packageJsonPath}`)
  process.exit(1)
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
const scripts = packageJson && typeof packageJson === 'object' && packageJson.scripts && typeof packageJson.scripts === 'object'
  ? packageJson.scripts
  : {}

function getCandidateScripts() {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? ['build:pkg:mac-arm64', 'build:pkg:mac', 'build:pkg:mac-x64']
      : ['build:pkg:mac', 'build:pkg:mac-x64', 'build:pkg:mac-arm64']
  }

  if (process.platform === 'win32') {
    return ['build:pkg:win']
  }

  if (process.platform === 'linux') {
    return ['build:pkg:linux']
  }

  return ['build:pkg']
}

const selectedScript = getCandidateScripts().find(name => typeof scripts[name] === 'string' && scripts[name].trim())

if (!selectedScript) {
  console.error(`[run-platform-pkg] No platform-specific pkg script found for ${workspaceArg} on ${process.platform}/${process.arch}`)
  process.exit(1)
}

console.log(`[run-platform-pkg] ${workspaceArg}: ${process.platform}/${process.arch} -> npm run ${selectedScript}`)

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(npmCommand, ['run', selectedScript], {
  cwd: workspaceDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

if (result.error) {
  throw result.error
}

process.exit(result.status ?? 1)
