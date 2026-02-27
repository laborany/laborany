#!/usr/bin/env node
/* ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    Patch @yao-pkg/pkg-fetch                              ║
 * ║                                                                          ║
 * ║  目的：规避 pkg-fetch 在并发/重入场景下 progress bar 断言崩溃               ║
 * ║  错误：AssertionError [ERR_ASSERTION]: (0, assert_1.default)(!this.bar) ║
 * ╚══════════════════════════════════════════════════════════════════════════╝ */

const { existsSync, readFileSync, writeFileSync } = require('fs')
const { join, resolve } = require('path')

const rootDir = resolve(__dirname, '..')
const targetArg = process.argv[2]

const projectDirs = targetArg
  ? [resolve(rootDir, targetArg)]
  : [join(rootDir, 'src-api'), join(rootDir, 'agent-service')]

function patchFile(filePath) {
  if (!existsSync(filePath)) return false

  const original = readFileSync(filePath, 'utf8')
  const patchedMarker = 'this.disableProgress();'
  if (original.includes(patchedMarker) && original.includes('if (this.bar) {')) {
    return false
  }

  const next = original.replace(
    '(0, assert_1.default)(!this.bar);',
    [
      'if (this.bar) {',
      '            this.disableProgress();',
      '        }',
    ].join('\n'),
  )

  if (next === original) {
    return false
  }

  writeFileSync(filePath, next, 'utf8')
  return true
}

let patchedCount = 0
for (const dir of projectDirs) {
  const filePath = join(dir, 'node_modules', '@yao-pkg', 'pkg-fetch', 'lib-es5', 'log.js')
  if (patchFile(filePath)) {
    patchedCount += 1
    console.log(`[patch-pkg-fetch] patched: ${filePath}`)
  }
}

if (patchedCount === 0) {
  console.log('[patch-pkg-fetch] no changes')
}
