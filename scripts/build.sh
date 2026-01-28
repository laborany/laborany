#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                     LaborAny 构建脚本                                     ║
# ║                                                                          ║
# ║  用法：./scripts/build.sh [platform]                                     ║
# ║  平台：windows | macos | linux | all                                     ║
# ╚══════════════════════════════════════════════════════════════════════════╝

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

PLATFORM=${1:-all}

echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                     LaborAny 构建开始                                     ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                       步骤 1: 安装依赖                                    │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[1/5] 安装依赖..."
pnpm install

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                       步骤 2: 打包 CLI 和 uv                              │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[2/5] 打包 CLI Bundle 和 uv..."

# 打包 CLI Bundle
case $PLATFORM in
  windows)
    node scripts/bundle-cli.js win
    node scripts/bundle-uv.js win
    ;;
  macos)
    node scripts/bundle-cli.js mac
    node scripts/bundle-uv.js mac
    ;;
  linux)
    node scripts/bundle-cli.js linux
    node scripts/bundle-uv.js linux
    ;;
  all)
    # 默认打包当前平台
    node scripts/bundle-cli.js
    node scripts/bundle-uv.js
    ;;
esac

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                       步骤 3: 构建 API                                    │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[3/5] 构建 API..."
cd src-api
pnpm install
pnpm build

# 根据平台打包
case $PLATFORM in
  windows)
    echo "打包 Windows 版本..."
    npx @yao-pkg/pkg dist/index.js --targets node20-win-x64 --output dist/laborany-api-x86_64-pc-windows-msvc.exe
    ;;
  macos)
    echo "打包 macOS 版本..."
    npx @yao-pkg/pkg dist/index.js --targets node20-macos-x64 --output dist/laborany-api-x86_64-apple-darwin
    npx @yao-pkg/pkg dist/index.js --targets node20-macos-arm64 --output dist/laborany-api-aarch64-apple-darwin
    ;;
  linux)
    echo "打包 Linux 版本..."
    npx @yao-pkg/pkg dist/index.js --targets node20-linux-x64 --output dist/laborany-api-x86_64-unknown-linux-gnu
    ;;
  all)
    echo "打包所有平台..."
    npx @yao-pkg/pkg dist/index.js --targets node20-win-x64 --output dist/laborany-api-x86_64-pc-windows-msvc.exe
    npx @yao-pkg/pkg dist/index.js --targets node20-macos-x64 --output dist/laborany-api-x86_64-apple-darwin
    npx @yao-pkg/pkg dist/index.js --targets node20-macos-arm64 --output dist/laborany-api-aarch64-apple-darwin
    npx @yao-pkg/pkg dist/index.js --targets node20-linux-x64 --output dist/laborany-api-x86_64-unknown-linux-gnu
    ;;
esac

cd ..

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                       步骤 4: 构建前端                                    │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[4/5] 构建前端..."
cd frontend
pnpm install
pnpm build
cd ..

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                       步骤 5: 构建 Tauri 应用                             │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[5/5] 构建 Tauri 应用..."
cd src-tauri
cargo tauri build
cd ..

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                     LaborAny 构建完成                                     ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "输出目录: src-tauri/target/release/bundle/"
