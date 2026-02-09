#!/usr/bin/env python3
"""
带缓存功能的邮件获取脚本

功能:
1. 自动检查缓存的邮箱凭据
2. 如果有缓存则直接使用，无需重复登录
3. 与 LaborAny 用户ID绑定，不同用户完全隔离
4. 密码/授权码使用 AES-256-GCM 加密存储
5. 凭据30天自动过期

使用方法:
    python scripts/fetch_with_cache.py <laborany_user_id> [email_address]

    # 首次使用 - 需要提供邮箱和密码
    python scripts/fetch_with_cache.py user_123

    # 后续使用 - 自动使用缓存
    python scripts/fetch_with_cache.py user_123

    # 指定邮箱（覆盖缓存）
    python scripts/fetch_with_cache.py user_123 other@example.com
"""
import sys
import os

# 添加 scripts 目录到路径，以便导入模块
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, script_dir)

from credential_cache import CredentialCache
from fetch_emails import fetch_emails, save_emails_to_file
import getpass  # 用于安全输入密码


def get_email_input():
    """获取用户输入的邮箱地址"""
    print("\n请问您的邮箱地址是什么? (比如 example@gmail.com)")
    email = input("> ").strip()
    return email


def get_password_input(email_address=""):
    """获取用户输入的密码/授权码"""
    # 根据邮箱类型给出提示
    domain = email_address.split('@')[-1].lower() if email_address else ""

    tips = {
        "gmail.com": "\n提示: Gmail 需要使用应用专用密码，您可以在 https://myaccount.google.com/apppasswords 生成",
        "qq.com": "\n提示: 请确保已在邮箱设置中开启 IMAP 服务",
        "163.com": "\n提示: 163邮箱必须使用授权码（而非登录密码），并确保 IMAP 服务已开启",
        "126.com": "\n提示: 126邮箱必须使用授权码（而非登录密码），并确保 IMAP 服务已开启",
    }

    tip = tips.get(domain, "")
    if tip:
        print(tip)

    print("\n请问您的邮箱密码或授权码是什么?")
    # 使用 getpass 隐藏输入
    password = getpass.getpass("> ").strip()
    return password


def fetch_with_cache(laborany_user_id, email_address=None, password=None, limit=50, auto_mode=False):
    """带缓存功能的邮件获取

    Args:
        laborany_user_id: LaborAny 用户ID，用于用户隔离
        email_address: 可选的邮箱地址，如果不提供则从缓存读取或询问用户
        password: 可选的密码，如果不提供则从缓存读取或询问用户
        limit: 获取邮件数量
        auto_mode: 是否启用自动模式（有缓存时直接使用，无缓存时失败）

    Returns:
        dict: {
            'success': bool,
            'emails': list,
            'count': int,
            'from_cache': bool,  # 凭据是否来自缓存
            'error': str or None
        }
    """
    cache = CredentialCache(laborany_user_id)
    from_cache = False

    # 首先检查是否有任何缓存的凭据
    saved_credentials = cache.list_credentials()

    # 场景1: 有缓存且用户未指定邮箱 -> 自动使用缓存
    if saved_credentials and not email_address:
        # 使用缓存的凭据，不需要用户输入
        selected = saved_credentials[0]
        email_address = selected['email_address']
        credential = cache.load(email_address)
        password = credential['password']
        from_cache = True

        if not auto_mode:
            print(f"✅ 使用已保存的凭据登录 {email_address}")

    # 场景2: 有缓存且用户指定了邮箱 -> 检查是否匹配
    elif saved_credentials and email_address:
        # 检查用户指定的邮箱是否在缓存中
        credential = cache.load(email_address)
        if credential and not password:
            # 使用缓存的凭据
            password = credential['password']
            from_cache = True
            if not auto_mode:
                print(f"✅ 使用已保存的凭据登录 {email_address}")
        else:
            # 用户提供了新密码或邮箱不在缓存中
            # 这将是一个新凭据，需要保存
            from_cache = False
            if not password:
                password = get_password_input(email_address)

    # 场景3: 无缓存 -> 必须询问用户
    elif not saved_credentials:
        # 没有缓存，询问用户输入
        if not email_address:
            email_address = get_email_input()
        if not password:
            password = get_password_input(email_address)
        from_cache = False

    # 自动模式下，如果没有缓存且没有提供凭据，返回错误
    if auto_mode and not from_cache and not (email_address and password):
        return {
            'success': False,
            'emails': [],
            'count': 0,
            'from_cache': False,
            'error': '无缓存的凭据，请先登录'
        }

    # 获取邮件
    if not auto_mode:
        print(f"\n正在连接邮箱获取邮件...")
    result = fetch_emails(email_address, password, limit=limit)

    # 核心逻辑：只有在没有缓存的情况下才保存凭据
    # from_cache=True 表示使用了缓存，不需要再次保存
    # from_cache=False 表示是用户输入的新凭据，需要保存
    if result['success'] and not from_cache:
        if cache.save(email_address, password):
            if not auto_mode:
                print(f"✅ 凭据已安全保存，下次可直接使用")

    return {
        **result,
        'from_cache': from_cache,
        'email_address': email_address
    }


def main():
    """命令行入口"""
    # 检查是否为自动模式
    auto_mode = '--auto' in sys.argv

    # 移除 --auto 参数
    clean_argv = [arg for arg in sys.argv if arg != '--auto']

    if len(clean_argv) < 2:
        print("用法: python fetch_with_cache.py <laborany_user_id> [email_address] [password] [--auto]")
        print("\n示例:")
        print("  python fetch_with_cache.py user_123")
        print("  python fetch_with_cache.py user_123 --auto")
        print("  python fetch_with_cache.py user_123 example@163.com")
        print("  python fetch_with_cache.py user_123 example@163.com your_password")
        sys.exit(1)

    laborany_user_id = clean_argv[1]
    email_address = clean_argv[2] if len(clean_argv) > 2 else None
    password = clean_argv[3] if len(clean_argv) > 3 else None

    if not auto_mode:
        print("=== 邮箱助手 - 智能邮件获取 ===")
        print(f"用户ID: {laborany_user_id}")

    result = fetch_with_cache(laborany_user_id, email_address, password, auto_mode=auto_mode)

    if result['success']:
        print(f"\n✅ 成功获取 {result['count']} 封邮件\n")

        if result['from_cache']:
            print("(使用已保存的凭据)")

        # 显示邮件摘要
        for i, e in enumerate(result['emails'][:10], 1):
            from_name = e.get('from_name', e.get('from', '?'))[:30]
            subject = e.get('subject', '(无主题)')[:50]
            print(f"{i}. {from_name} | {subject}")

        if result['count'] > 10:
            print(f"\n... 还有 {result['count'] - 10} 封邮件")

        # 保存到文件
        save_emails_to_file(result['emails'], 'emails.json')
        print(f"\n邮件已保存到: emails.json")

    else:
        print(f"\n❌ 获取失败: {result['error']}")
        sys.exit(1)


if __name__ == "__main__":
    main()
