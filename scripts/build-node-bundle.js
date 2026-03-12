#!/usr/bin/env node

const { resolve } = require('path')

function parseArgs(argv) {
  const options = {
    external: [],
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--entry') {
      options.entry = argv[++i]
      continue
    }
    if (arg === '--outfile') {
      options.outfile = argv[++i]
      continue
    }
    if (arg === '--platform') {
      options.platform = argv[++i]
      continue
    }
    if (arg === '--target') {
      options.target = argv[++i]
      continue
    }
    if (arg === '--format') {
      options.format = argv[++i]
      continue
    }
    if (arg === '--external') {
      options.external.push(argv[++i])
      continue
    }
    if (arg === '--banner') {
      options.banner = argv[++i]
      continue
    }
    throw new Error(`Unknown arg: ${arg}`)
  }

  if (!options.entry || !options.outfile) {
    throw new Error('Usage: build-node-bundle.js --entry <file> --outfile <file> [--platform node] [--target node20] [--format cjs] [--external pkg] [--banner text]')
  }

  return options
}

async function main() {
  const cwd = process.cwd()
  const options = parseArgs(process.argv.slice(2))
  const esbuild = require(require.resolve('esbuild', { paths: [cwd] }))

  await esbuild.build({
    entryPoints: [resolve(cwd, options.entry)],
    bundle: true,
    platform: options.platform || 'node',
    target: options.target || 'node20',
    format: options.format || 'cjs',
    outfile: resolve(cwd, options.outfile),
    external: options.external,
    define: {
      'import.meta.url': '__import_meta_url',
    },
    banner: options.banner
      ? { js: options.banner }
      : undefined,
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
