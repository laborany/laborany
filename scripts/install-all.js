const { spawnSync } = require('child_process')
const { existsSync } = require('fs')
const path = require('path')

const installMode = process.argv[2] === 'ci' ? 'ci' : 'install'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageDirs = ['.', 'shared', 'src-api', 'agent-service', 'frontend']
const rootDir = path.resolve(__dirname, '..')

function createChildEnv() {
  const nextEnv = { ...process.env }
  const blockedPatterns = [
    /^INIT_CWD$/i,
    /^npm_(command|execpath|node_execpath)$/i,
    /^npm_package_/i,
    /^npm_lifecycle_/i,
    /^npm_config_(local_prefix|global_prefix|prefix)$/i,
    /^npm_config_(global|location|workspace|workspaces)$/i,
    /^npm_config_(omit|production|only|dry-run)$/i,
    /^npm_config_(fund|audit)$/i,
  ]

  for (const key of Object.keys(nextEnv)) {
    if (blockedPatterns.some(pattern => pattern.test(key))) {
      delete nextEnv[key]
    }
  }

  // 约束子进程 npm 行为，避免 CI 环境变量导致“成功但不落地安装”。
  nextEnv.npm_config_global = 'false'
  nextEnv.npm_config_dry_run = 'false'
  nextEnv.npm_config_bin_links = 'true'
  nextEnv.npm_config_ignore_scripts = 'false'
  nextEnv.npm_config_audit = 'false'
  nextEnv.npm_config_fund = 'false'
  nextEnv.npm_config_omit = ''

  return nextEnv
}

const childEnv = createChildEnv()

const requiredArtifacts = {
  '.': ['node_modules/electron-builder/package.json'],
  'src-api': ['node_modules/esbuild/package.json', 'node_modules/dotenv/package.json'],
  'agent-service': ['node_modules/esbuild/package.json', 'node_modules/cors/package.json'],
  'frontend': ['node_modules/typescript/package.json', 'node_modules/vite/package.json'],
}

function verifyInstall(dir, cwd) {
  if (!existsSync(path.join(cwd, 'node_modules'))) {
    console.error(`[install-all] ${dir} missing node_modules directory after install`)
    process.exit(1)
  }

  const required = requiredArtifacts[dir]
  if (!required) return

  const missing = required.filter(rel => !existsSync(path.join(cwd, rel)))
  if (missing.length === 0) return

  console.error(`[install-all] ${dir} missing required packages:`)
  for (const rel of missing) {
    console.error(`  - ${rel}`)
  }
  process.exit(1)
}

for (const dir of packageDirs) {
  const cwd = path.resolve(rootDir, dir)
  const hasLockfile = existsSync(path.join(cwd, 'package-lock.json'))
  const command = installMode === 'ci' && hasLockfile ? 'ci' : 'install'
  const args = [
    command,
    '--include=dev',
    '--include=optional',
    '--bin-links=true',
    '--no-audit',
    '--no-fund',
  ]

  console.log(`\n[install-all] ${dir} -> npm ${args.join(' ')}`)

  const result = spawnSync(npmCommand, args, {
    cwd,
    stdio: 'inherit',
    env: childEnv,
  })

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }

  if (result.error) {
    throw result.error
  }

  const npmRoot = spawnSync(npmCommand, ['root'], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    env: childEnv,
  })
  if (npmRoot.status === 0) {
    console.log(`[install-all] ${dir} npm root: ${String(npmRoot.stdout || '').trim()}`)
  }

  verifyInstall(dir, cwd)
}
