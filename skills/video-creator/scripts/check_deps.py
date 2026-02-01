#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                           依赖检查脚本                                        ║
║  检查 Remotion 视频制作所需的依赖是否已安装                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import subprocess
import sys
import shutil
import io
from dataclasses import dataclass

# 修复 Windows 控制台编码问题
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              数据结构                                        │
# └──────────────────────────────────────────────────────────────────────────────┘

@dataclass
class DependencyStatus:
    """依赖状态"""
    name: str
    installed: bool
    version: str
    required: bool
    install_hint: str


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              检查函数                                        │
# └──────────────────────────────────────────────────────────────────────────────┘

def check_node() -> DependencyStatus:
    """检查 Node.js"""
    try:
        result = subprocess.run(
            ["node", "--version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        version = result.stdout.strip()
        # 检查版本是否 >= 18
        major = int(version.lstrip("v").split(".")[0])
        return DependencyStatus(
            name="Node.js",
            installed=major >= 18,
            version=version if major >= 18 else f"{version} (需要 v18+)",
            required=True,
            install_hint="https://nodejs.org 下载 LTS 版本"
        )
    except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
        return DependencyStatus(
            name="Node.js",
            installed=False,
            version="未安装",
            required=True,
            install_hint="https://nodejs.org 下载 LTS 版本"
        )


def check_npm() -> DependencyStatus:
    """检查 npm"""
    try:
        # Windows 上 npm 是通过 npm.cmd 调用的
        cmd = ["npm.cmd", "--version"] if sys.platform == "win32" else ["npm", "--version"]
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=10,
            shell=(sys.platform == "win32")
        )
        if result.returncode == 0 and result.stdout.strip():
            return DependencyStatus(
                name="npm",
                installed=True,
                version=result.stdout.strip(),
                required=True,
                install_hint="随 Node.js 一起安装"
            )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return DependencyStatus(
        name="npm",
        installed=False,
        version="未安装",
        required=True,
        install_hint="随 Node.js 一起安装"
    )


def check_ffmpeg() -> DependencyStatus:
    """检查 ffmpeg"""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        # 提取版本号
        first_line = result.stdout.split("\n")[0]
        version = first_line.split(" ")[2] if "version" in first_line else "已安装"
        return DependencyStatus(
            name="ffmpeg",
            installed=True,
            version=version,
            required=True,
            install_hint="Windows: winget install ffmpeg\nmacOS: brew install ffmpeg"
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return DependencyStatus(
            name="ffmpeg",
            installed=False,
            version="未安装",
            required=True,
            install_hint="Windows: winget install ffmpeg\nmacOS: brew install ffmpeg"
        )


def check_chrome() -> DependencyStatus:
    """检查 Chrome 浏览器"""
    # Windows 路径
    chrome_paths = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]

    for path in chrome_paths:
        if shutil.which("chrome") or __import__("os").path.exists(path):
            return DependencyStatus(
                name="Chrome",
                installed=True,
                version="已安装",
                required=False,
                install_hint="https://www.google.com/chrome"
            )

    return DependencyStatus(
        name="Chrome",
        installed=False,
        version="未安装",
        required=False,
        install_hint="https://www.google.com/chrome (推荐安装，可提升渲染质量)"
    )


# ┌──────────────────────────────────────────────────────────────────────────────┐
# │                              主函数                                          │
# └──────────────────────────────────────────────────────────────────────────────┘

def main():
    """主函数"""
    print("=" * 60)
    print("Remotion 依赖检查")
    print("=" * 60)
    print()

    checks = [
        check_node(),
        check_npm(),
        check_ffmpeg(),
        check_chrome(),
    ]

    all_required_ok = True

    for dep in checks:
        status = "✅" if dep.installed else "❌"
        required = "[必需]" if dep.required else "[推荐]"
        print(f"{status} {dep.name} {required}")
        print(f"   版本: {dep.version}")

        if not dep.installed:
            print(f"   安装: {dep.install_hint}")
            if dep.required:
                all_required_ok = False
        print()

    print("=" * 60)

    if all_required_ok:
        print("✅ 所有必需依赖已安装，可以开始创建视频！")
        return 0
    else:
        print("❌ 缺少必需依赖，请先安装后再继续。")
        return 1


if __name__ == "__main__":
    sys.exit(main())
