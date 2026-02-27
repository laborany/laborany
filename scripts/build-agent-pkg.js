#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    Agent pkg Build Wrapper                               ║
 * ║                                                                          ║
 * ║  目标：                                                                   ║
 * ║  1) 构建前下载并切换到 pkg(Node20) 兼容的 better-sqlite3 二进制           ║
 * ║  2) 构建后恢复开发环境当前的 better-sqlite3，避免污染本地 dev             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const { copyFileSync, existsSync, unlinkSync } = require('fs')
const { join, resolve } = require('path')
const { tmpdir } = require('os')
const { spawnSync } = require('child_process')

function usageAndExit() {
  console.error('Usage: node scripts/build-agent-pkg.js <platform> <arch> <target> <output>')
  process.exit(1)
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  }
}

function main() {
  const [platform, arch, target, output] = process.argv.slice(2)
  if (!platform || !arch || !target || !output) usageAndExit()

  const rootDir = resolve(__dirname, '..')
  const agentDir = join(rootDir, 'agent-service')
  const fixNativeScript = join(rootDir, 'scripts', 'fix-native-modules.js')
  const nativeBinaryPath = join(
    agentDir,
    'node_modules',
    'better-sqlite3',
    'build',
    'Release',
    'better_sqlite3.node',
  )

  const backupPath = join(
    tmpdir(),
    `laborany-better-sqlite3-backup-${process.pid}-${Date.now()}.node`,
  )
  const hasNativeBinary = existsSync(nativeBinaryPath)

  try {
    if (hasNativeBinary) {
      copyFileSync(nativeBinaryPath, backupPath)
    }

    run(process.execPath, [fixNativeScript, platform, arch], rootDir)
    run('npm', ['run', 'build:bundle'], agentDir)
    run(
      'npx',
      ['@yao-pkg/pkg', 'dist/bundle.cjs', '--targets', target, '--output', output, '--config', 'pkg.json'],
      agentDir,
    )
  } finally {
    if (hasNativeBinary && existsSync(backupPath)) {
      copyFileSync(backupPath, nativeBinaryPath)
      unlinkSync(backupPath)
    }
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[build-agent-pkg] ${message}`)
  process.exit(1)
}
