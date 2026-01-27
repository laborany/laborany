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
echo "[1/4] 安装依赖..."
pnpm install

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                       步骤 2: 构建 API                                    │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[2/4] 构建 API..."
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
# │                       步骤 3: 构建前端                                    │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[3/4] 构建前端..."
cd frontend
pnpm install
pnpm build
cd ..

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                       步骤 4: 构建 Tauri 应用                             │
# └──────────────────────────────────────────────────────────────────────────┘
echo ""
echo "[4/4] 构建 Tauri 应用..."
cd src-tauri
cargo tauri build
cd ..

echo ""
echo "╔══════════════════════════════════════════════════════════════════════════╗"
echo "║                     LaborAny 构建完成                                     ║"
echo "╚══════════════════════════════════════════════════════════════════════════╝"
echo ""
echo "输出目录: src-tauri/target/release/bundle/"
