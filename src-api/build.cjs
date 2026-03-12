#!/usr/bin/env node
const esbuild = require('esbuild')
const { resolve } = require('path')

esbuild.build({
  entryPoints: [resolve(__dirname, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(__dirname, 'dist/bundle.cjs'),
  external: ['sql.js'],
  define: { 'import.meta.url': '__import_meta_url' },
  banner: { js: "const __import_meta_url = require('url').pathToFileURL(__filename).href;" },
}).catch(() => process.exit(1))
