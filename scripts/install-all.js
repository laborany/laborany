const { spawnSync } = require('child_process')
const { existsSync } = require('fs')
const path = require('path')

const installMode = process.argv[2] === 'ci' ? 'ci' : 'install'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageDirs = ['.', 'shared', 'src-api', 'agent-service', 'frontend']
const rootDir = path.resolve(__dirname, '..')

function createChildEnv() {
  const nextEnv = { ...process.env }
  for (const key of Object.keys(nextEnv)) {
    if (
      key === 'INIT_CWD' ||
      key === 'npm_command' ||
      key === 'npm_execpath' ||
      key === 'npm_node_execpath' ||
      key === 'npm_config_local_prefix' ||
      key === 'npm_config_prefix' ||
      key === 'npm_config_global_prefix' ||
      key.startsWith('npm_package_') ||
      key.startsWith('npm_lifecycle_')
    ) {
      delete nextEnv[key]
    }
  }
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

  verifyInstall(dir, cwd)
}
