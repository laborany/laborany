const { spawnSync } = require('child_process')
const { existsSync } = require('fs')
const path = require('path')

const installMode = process.argv[2] === 'ci' ? 'ci' : 'install'
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const packageDirs = ['.', 'shared', 'src-api', 'agent-service', 'frontend']

for (const dir of packageDirs) {
  const cwd = path.resolve(__dirname, '..', dir)
  const hasLockfile = existsSync(path.join(cwd, 'package-lock.json'))
  const command = installMode === 'ci' && hasLockfile ? 'ci' : 'install'
  const args = [command, '--no-audit', '--no-fund']

  console.log(`\n[install-all] ${dir} -> npm ${args.join(' ')}`)

  const result = spawnSync(npmCommand, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
  })

  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status)
  }

  if (result.error) {
    throw result.error
  }
}
