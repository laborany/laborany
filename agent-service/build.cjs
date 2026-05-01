#!/usr/bin/env node
const esbuild = require('esbuild')
const { cpSync, mkdirSync } = require('fs')
const { resolve, join } = require('path')

const distDir = resolve(__dirname, 'dist')
const srcGenUiDir = resolve(__dirname, 'src/generative-ui')
const distGenUiDir = join(distDir, 'generative-ui')
const srcWebResearchDir = resolve(__dirname, 'src/web-research')
const distWebResearchDir = join(distDir, 'web-research')
const srcVisionDir = resolve(__dirname, 'src/vision')
const distVisionDir = join(distDir, 'vision')
const srcImageGenDir = resolve(__dirname, 'src/image-gen')
const distImageGenDir = join(distDir, 'image-gen')

async function main() {
  // 1. Bundle main agent service
  await esbuild.build({
    entryPoints: [resolve(__dirname, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: join(distDir, 'bundle.cjs'),
    external: ['bindings', 'express'],
    define: { 'import.meta.url': '__import_meta_url' },
    banner: { js: "const __import_meta_url = require('url').pathToFileURL(__filename).href;" },
  })

  // 2. Bundle MCP server as self-contained ESM (sidecar for packaged binary)
  await esbuild.build({
    entryPoints: [join(srcGenUiDir, 'mcp-server.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(distGenUiDir, 'mcp-server.mjs'),
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  })

  await esbuild.build({
    entryPoints: [join(srcWebResearchDir, 'mcp', 'mcp-server.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(distWebResearchDir, 'mcp', 'mcp-server.mjs'),
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  })

  await esbuild.build({
    entryPoints: [join(srcVisionDir, 'mcp', 'mcp-server.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(distVisionDir, 'mcp', 'mcp-server.mjs'),
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  })

  await esbuild.build({
    entryPoints: [join(srcImageGenDir, 'mcp', 'mcp-server.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    outfile: join(distImageGenDir, 'mcp', 'mcp-server.mjs'),
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  })

  await esbuild.build({
    entryPoints: [join(srcWebResearchDir, 'browser', 'cdp-proxy.mjs')],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: join(distWebResearchDir, 'browser', 'cdp-proxy.cjs'),
  })

  // 3. Copy guidelines to dist
  mkdirSync(join(distGenUiDir, 'guidelines'), { recursive: true })
  cpSync(join(srcGenUiDir, 'guidelines'), join(distGenUiDir, 'guidelines'), { recursive: true })

  mkdirSync(join(distWebResearchDir, 'knowledge', 'builtin-patterns'), { recursive: true })
  cpSync(
    join(srcWebResearchDir, 'knowledge', 'builtin-patterns'),
    join(distWebResearchDir, 'knowledge', 'builtin-patterns'),
    { recursive: true },
  )
}

main().catch(() => process.exit(1))
