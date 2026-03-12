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

for (const dir of packageDirs) {
  const cwd = path.resolve(rootDir, dir)
  const hasLockfile = existsSync(path.join(cwd, 'package-lock.json'))
  const command = installMode === 'ci' && hasLockfile ? 'ci' : 'install'
  const args = [
    '--prefix',
    cwd,
    command,
    '--include=dev',
    '--include=optional',
    '--no-audit',
    '--no-fund',
  ]

  console.log(`\n[install-all] ${dir} -> npm ${args.join(' ')}`)

  const result = spawnSync(npmCommand, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: childEnv,
  })

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }

  if (result.error) {
    throw result.error
  }
}
