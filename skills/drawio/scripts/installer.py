"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                         Draw.io CLI 安装模块                                  ║
║                                                                              ║
║  自动检测和安装 draw.io CLI 工具                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import os
import platform
import shutil
import stat
import subprocess
import urllib.request
import json
from pathlib import Path
from typing import Optional, Tuple


# ═══════════════════════════════════════════════════════════════════════════════
#  常量定义
# ═══════════════════════════════════════════════════════════════════════════════

INSTALL_DIR = Path.home() / ".laborany" / "tools" / "drawio"
GITHUB_API = "https://api.github.com/repos/jgraph/drawio-desktop/releases/latest"


# ═══════════════════════════════════════════════════════════════════════════════
#  公开接口
# ═══════════════════════════════════════════════════════════════════════════════

def ensure_drawio_cli() -> Optional[str]:
    """
    确保 draw.io CLI 可用

    返回:
        CLI 可执行文件路径，失败返回 None
    """
    # 1. 检查系统已安装
    system_path = check_system_installed()
    if system_path:
        return system_path

    # 2. 检查本地安装
    local_path = check_local_installed()
    if local_path:
        return local_path

    # 3. 尝试自动安装
    return install_drawio()


def check_drawio_installed() -> Optional[str]:
    """
    检查 draw.io 是否已安装

    返回:
        CLI 路径，未安装返回 None
    """
    return check_system_installed() or check_local_installed()


def get_platform_info() -> Tuple[str, str]:
    """
    获取平台信息

    返回:
        (操作系统, 架构)
    """
    system = platform.system().lower()
    machine = platform.machine().lower()

    # 标准化操作系统名称
    if system == "darwin":
        os_name = "darwin"
    elif system == "windows":
        os_name = "windows"
    else:
        os_name = "linux"

    # 标准化架构名称
    if machine in ("x86_64", "amd64"):
        arch = "x64"
    elif machine in ("arm64", "aarch64"):
        arch = "arm64"
    else:
        arch = "x64"  # 默认

    return os_name, arch


# ═══════════════════════════════════════════════════════════════════════════════
#  检测函数
# ═��═════════════════════════════════════════════════════════════════════════════

def check_system_installed() -> Optional[str]:
    """检查系统级安装"""
    os_name, _ = get_platform_info()

    if os_name == "darwin":
        # macOS: 检查 /Applications
        app_path = "/Applications/draw.io.app/Contents/MacOS/draw.io"
        if Path(app_path).exists():
            return app_path

    elif os_name == "windows":
        # Windows: 检查常见安装路径
        paths = [
            Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "draw.io" / "draw.io.exe",
            Path(os.environ.get("PROGRAMFILES", "")) / "draw.io" / "draw.io.exe",
            Path(os.environ.get("PROGRAMFILES(X86)", "")) / "draw.io" / "draw.io.exe",
        ]
        for p in paths:
            if p.exists():
                return str(p)

    else:
        # Linux: 检查 PATH
        drawio_path = shutil.which("drawio")
        if drawio_path:
            return drawio_path

    return None


def check_local_installed() -> Optional[str]:
    """检查本地安装"""
    os_name, _ = get_platform_info()

    if os_name == "windows":
        exe_path = INSTALL_DIR / "draw.io.exe"
    elif os_name == "linux":
        exe_path = INSTALL_DIR / "drawio.AppImage"
    else:
        # macOS 使用系统安装
        return None

    if exe_path.exists():
        return str(exe_path)

    return None


# ═══════════════════════════════════════════════════════════════════════════════
#  安装函数
# ═══════════════════════════════════════════════════════════════════════════════

def install_drawio() -> Optional[str]:
    """
    自动安装 draw.io CLI

    返回:
        安装后的 CLI 路径，失败返回 None
    """
    os_name, arch = get_platform_info()

    # 获取最新版本信息
    version, assets = get_latest_release()
    if not version:
        return None

    # 选择下载文件
    asset_name = select_asset(os_name, arch, assets)
    if not asset_name:
        return None

    download_url = assets.get(asset_name)
    if not download_url:
        return None

    # 创建安装目录
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)

    # 下载并安装
    if os_name == "windows":
        return install_windows(download_url)
    elif os_name == "linux":
        return install_linux(download_url)
    elif os_name == "darwin":
        return install_macos_hint()

    return None


def get_latest_release() -> Tuple[Optional[str], dict]:
    """获取最新版本信息"""
    try:
        req = urllib.request.Request(
            GITHUB_API,
            headers={"User-Agent": "laborany-drawio-installer"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())

        version = data.get("tag_name", "").lstrip("v")
        assets = {}

        for asset in data.get("assets", []):
            name = asset.get("name", "")
            url = asset.get("browser_download_url", "")
            if name and url:
                assets[name] = url

        return version, assets

    except Exception:
        return None, {}


def select_asset(os_name: str, arch: str, assets: dict) -> Optional[str]:
    """选择合适的下载文件"""
    patterns = {
        ("windows", "x64"): ["windows-no-installer.exe", "win32-x64"],
        ("windows", "arm64"): ["windows-no-installer.exe", "win32-x64"],  # 兼容
        ("linux", "x64"): ["x86_64.AppImage", "amd64.AppImage"],
        ("linux", "arm64"): ["arm64.AppImage", "aarch64.AppImage"],
        ("darwin", "x64"): ["mac-x64.dmg"],
        ("darwin", "arm64"): ["mac-arm64.dmg"],
    }

    search_patterns = patterns.get((os_name, arch), [])

    for pattern in search_patterns:
        for name in assets:
            if pattern in name:
                return name

    return None


# ─────────────────────────────────────────────────────────────────────────────
#  平台特定安装
# ─────────────────────────────────────────────────────────────────────────────

def install_windows(url: str) -> Optional[str]:
    """Windows 安装（portable exe）"""
    exe_path = INSTALL_DIR / "draw.io.exe"

    try:
        download_file(url, exe_path)
        return str(exe_path)
    except Exception:
        return None


def install_linux(url: str) -> Optional[str]:
    """Linux 安装（AppImage）"""
    appimage_path = INSTALL_DIR / "drawio.AppImage"

    try:
        download_file(url, appimage_path)

        # 添加执行权限
        appimage_path.chmod(appimage_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        return str(appimage_path)
    except Exception:
        return None


def install_macos_hint() -> Optional[str]:
    """macOS 安装提示"""
    # macOS 需要用户手动安装或使用 brew
    # 检查 brew 是否可用
    if shutil.which("brew"):
        try:
            subprocess.run(
                ["brew", "install", "--cask", "drawio"],
                capture_output=True,
                timeout=300,
            )
            return "/Applications/draw.io.app/Contents/MacOS/draw.io"
        except Exception:
            pass

    # 返回 None，提示用户手动安装
    return None


def download_file(url: str, dest: Path):
    """下载文件"""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "laborany-drawio-installer"}
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(8192)
                if not chunk:
                    break
                f.write(chunk)
