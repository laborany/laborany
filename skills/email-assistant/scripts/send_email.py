#!/usr/bin/env python3
"""
邮件发送模块 - 支持使用缓存的凭据

功能:
1. 支持SMTP发送邮件
2. 自动识别常用邮箱SMTP服务器
3. 集成凭据缓存，无需重复输入密码
4. 支持纯文本和HTML邮件
5. 支持抄送、密送
"""
import smtplib
import json
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate
from typing import Optional, Dict, List
from pathlib import Path


# 常用邮箱SMTP服务器配置
SMTP_SERVERS = {
    "gmail.com": {"host": "smtp.gmail.com", "port": 587, "use_tls": True},
    "outlook.com": {"host": "smtp.office365.com", "port": 587, "use_tls": True},
    "qq.com": {"host": "smtp.qq.com", "port": 587, "use_tls": True},
    "163.com": {"host": "smtp.163.com", "port": 465, "use_ssl": True},
    "126.com": {"host": "smtp.126.com", "port": 465, "use_ssl": True},
    "yahoo.com": {"host": "smtp.mail.yahoo.com", "port": 587, "use_tls": True},
    "foxmail.com": {"host": "smtp.qq.com", "port": 587, "use_tls": True},
    "sina.com": {"host": "smtp.sina.com", "port": 465, "use_ssl": True},
    "sohu.com": {"host": "smtp.sohu.com", "port": 465, "use_ssl": True},
}


def get_smtp_config(email_address):
    """根据邮箱地址获取SMTP服务器配置"""
    domain = email_address.split('@')[-1].lower()
    return SMTP_SERVERS.get(domain, {"host": f"smtp.{domain}", "port": 587, "use_tls": True})


def send_email(
    from_email: str,
    password: str,
    to_emails: List[str],
    subject: str,
    body: str,
    cc_emails: List[str] = None,
    bcc_emails: List[str] = None,
    is_html: bool = False,
    from_name: str = None
) -> Dict:
    """发送邮件

    Args:
        from_email: 发件人邮箱
        password: 密码或授权码
        to_emails: 收件人邮箱列表
        subject: 邮件主题
        body: 邮件正文
        cc_emails: 抄送邮箱列表（可选）
        bcc_emails: 密送邮箱列表（可选）
        is_html: 是否为HTML格式
        from_name: 发件人名称（可选）

    Returns:
        {
            'success': bool,
            'message': str,
            'error': str or None
        }
    """
    smtp_config = get_smtp_config(from_email)

    try:
        # 创建邮件
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = formataddr((from_name, from_email)) if from_name else from_email
        msg['To'] = ', '.join(to_emails)
        if cc_emails:
            msg['Cc'] = ', '.join(cc_emails)
        msg['Date'] = formatdate(localtime=True)

        # 添加正文
        mime_type = 'html' if is_html else 'plain'
        msg.attach(MIMEText(body, mime_type, 'utf-8'))

        # 所有收件人（包括抄送和密送）
        all_recipients = to_emails[:]
        if cc_emails:
            all_recipients.extend(cc_emails)
        if bcc_emails:
            all_recipients.extend(bcc_emails)

        # 连接SMTP服务器
        if smtp_config.get('use_ssl'):
            # 使用SSL连接（端口465）
            server = smtplib.SMTP_SSL(smtp_config['host'], smtp_config['port'], timeout=30)
        else:
            # 使用TLS连接（端口587）
            server = smtplib.SMTP(smtp_config['host'], smtp_config['port'], timeout=30)
            if smtp_config.get('use_tls', True):
                server.starttls()

        # 登录
        server.login(from_email, password)

        # 发送
        server.send_message(msg)

        # 关闭连接
        server.quit()

        return {
            'success': True,
            'message': f'邮件已成功发送到 {len(all_recipients)} 位收件人',
            'error': None
        }

    except smtplib.SMTPAuthenticationError:
        return {
            'success': False,
            'message': '发送失败',
            'error': '认证失败，请检查密码/授权码是否正确'
        }
    except smtplib.SMTPException as e:
        return {
            'success': False,
            'message': '发送失败',
            'error': f'SMTP错误: {str(e)}'
        }
    except Exception as e:
        return {
            'success': False,
            'message': '发送失败',
            'error': f'连接错误: {str(e)}'
        }


def send_email_with_cache(
    user_id: str,
    from_email: str,
    to_emails: List[str],
    subject: str,
    body: str,
    cc_emails: List[str] = None,
    bcc_emails: List[str] = None,
    is_html: bool = False,
    from_name: str = None,
    ask_password: bool = False
) -> Dict:
    """使用缓存的凭据发送邮件

    Args:
        user_id: LaborAny 用户ID
        from_email: 发件人邮箱
        to_emails: 收件人邮箱列表
        subject: 邮件主题
        body: 邮件正文
        cc_emails: 抄送邮箱列表（可选）
        bcc_emails: 密送邮箱列表（可选）
        is_html: 是否为HTML格式
        from_name: 发件人名称（可选）
        ask_password: 如果缓存中没有凭据，是否询问用户输入

    Returns:
        {
            'success': bool,
            'message': str,
            'error': str or None,
            'from_cache': bool,  # 是否使用了缓存的凭据
            'credential_saved': bool  # 是否是本次新保存的凭据
        }
    """
    try:
        from scripts.credential_cache import CredentialCache

        cache = CredentialCache(user_id)
        credential = cache.load(from_email)

        password = None
        from_cache = False
        credential_saved = False

        if credential:
            # 使用缓存的凭据
            password = credential['password']
            from_cache = True
        elif ask_password:
            # 缓存中没有，询问用户
            import getpass
            print(f"未找到 {from_email} 的已保存凭据")
            password = getpass.getpass("请输入密码或授权码: ")

            # 验证凭据（尝试发送一封测试邮件，这里先不验证，让send_email验证）
            credential_saved = True  # 标记为新输入的凭据
            from_cache = False
        else:
            return {
                'success': False,
                'message': '发送失败',
                'error': f'未找到 {from_email} 的已保存凭据，请先使用邮箱助手登录',
                'from_cache': False,
                'credential_saved': False
            }

        # 发送邮件
        result = send_email(
            from_email=from_email,
            password=password,
            to_emails=to_emails,
            subject=subject,
            body=body,
            cc_emails=cc_emails,
            bcc_emails=bcc_emails,
            is_html=is_html,
            from_name=from_name
        )

        # 如果发送成功且是新输入的凭据，保存到缓存
        if result['success'] and credential_saved:
            cache.save(from_email, password)
            result['credential_saved'] = True
        else:
            result['credential_saved'] = False

        result['from_cache'] = from_cache
        return result

    except ImportError:
        return {
            'success': False,
            'message': '发送失败',
            'error': '凭据缓存模块不可用',
            'from_cache': False,
            'credential_saved': False
        }


def load_draft(draft_file: str) -> Dict:
    """从文件加载邮件草稿"""
    try:
        with open(draft_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"加载草稿失败: {e}")
        return None


def send_draft(draft_file: str, user_id: str = None, password: str = None) -> Dict:
    """发送草稿文件中的邮件

    Args:
        draft_file: 草稿文件路径
        user_id: LaborAny 用户ID（用于从缓存获取密码）
        password: 直接指定的密码（优先级高于缓存）

    Returns:
        发送结果
    """
    draft = load_draft(draft_file)
    if not draft:
        return {
            'success': False,
            'message': '发送失败',
            'error': '无法加载草稿文件'
        }

    # 确定发件人和密码
    from_email = draft.get('from')
    if not from_email:
        return {
            'success': False,
            'message': '发送失败',
            'error': '草稿中缺少发件人信息'
        }

    # 如果直接提供了密码，使用直接密码
    if password:
        result = send_email(
            from_email=from_email,
            password=password,
            to_emails=[draft['to']] if isinstance(draft.get('to'), str) else draft.get('to', []),
            subject=draft.get('subject', ''),
            body=draft.get('body', ''),
            is_html=False
        )
        result['from_cache'] = False
        result['credential_saved'] = False
        return result

    # 否则尝试使用缓存
    if user_id:
        return send_email_with_cache(
            user_id=user_id,
            from_email=from_email,
            to_emails=[draft['to']] if isinstance(draft.get('to'), str) else draft.get('to', []),
            subject=draft.get('subject', ''),
            body=draft.get('body', ''),
            is_html=False
        )

    return {
        'success': False,
        'message': '发送失败',
        'error': '请提供 user_id 或 password',
        'from_cache': False,
        'credential_saved': False
    }


def main():
    """命令行入口"""
    if len(sys.argv) < 2:
        print("用法:")
        print("  发送草稿: python send_email.py --draft <草稿文件> --user <用户ID>")
        print("  直接发送: python send_email.py --from <发件人> --to <收件人> --subject <主题> --user <用户ID>")
        print()
        print("示例:")
        print("  python send_email.py --draft draft.json --user Axel")
        print("  python send_email.py --from me@163.com --to you@example.com --subject '测试' --user Axel")
        return 1

    # 简单命令行参数解析
    args = sys.argv[1:]
    kwargs = {}
    i = 0
    while i < len(args):
        if args[i] == '--draft' and i + 1 < len(args):
            kwargs['draft_file'] = args[i + 1]
            i += 2
        elif args[i] == '--user' and i + 1 < len(args):
            kwargs['user_id'] = args[i + 1]
            i += 2
        elif args[i] == '--from' and i + 1 < len(args):
            kwargs['from_email'] = args[i + 1]
            i += 2
        elif args[i] == '--to' and i + 1 < len(args):
            kwargs['to_email'] = args[i + 1]
            i += 2
        elif args[i] == '--subject' and i + 1 < len(args):
            kwargs['subject'] = args[i + 1]
            i += 2
        elif args[i] == '--body' and i + 1 < len(args):
            kwargs['body'] = args[i + 1]
            i += 2
        else:
            i += 1

    # 发送草稿
    if 'draft_file' in kwargs:
        result = send_draft(
            draft_file=kwargs['draft_file'],
            user_id=kwargs.get('user_id')
        )
    # 直接发送
    elif 'from_email' in kwargs and 'to_email' in kwargs:
        result = send_email_with_cache(
            user_id=kwargs.get('user_id'),
            from_email=kwargs['from_email'],
            to_emails=[kwargs['to_email']],
            subject=kwargs.get('subject', ''),
            body=kwargs.get('body', ''),
            ask_password=True
        )
    else:
        print("参数错误")
        return 1

    if result['success']:
        print(f"✅ {result['message']}")
        if result.get('from_cache'):
            print("   使用已保存的凭据")
        if result.get('credential_saved'):
            print("   凭据已加密保存")
        return 0
    else:
        print(f"❌ {result['error']}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
