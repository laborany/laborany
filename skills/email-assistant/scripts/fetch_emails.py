#!/usr/bin/env python3
"""
邮件获取模块 - 可被其他脚本导入使用

支持:
- 自动识别常用邮箱服务器
- 网易邮箱IMAP ID要求
- 纯文本和HTML邮件解析
- 凭据加密缓存（可选）
"""
import imaplib
import email
import email.header
import json
import os
from html.parser import HTMLParser
from typing import Optional, Dict

# 添加ID命令支持（网易等邮箱要求）
if 'ID' not in imaplib.Commands:
    imaplib.Commands['ID'] = ('AUTH',)

# 常用邮箱服务器配置
IMAP_SERVERS = {
    "gmail.com": {"host": "imap.gmail.com", "port": 993},
    "outlook.com": {"host": "outlook.office365.com", "port": 993},
    "qq.com": {"host": "imap.qq.com", "port": 993},
    "163.com": {"host": "imap.163.com", "port": 993},
    "126.com": {"host": "imap.126.com", "port": 993},
    "yahoo.com": {"host": "imap.mail.yahoo.com", "port": 993},
    "foxmail.com": {"host": "imap.qq.com", "port": 993},
}


class MLStripper(HTMLParser):
    """HTML标签清理器"""
    def __init__(self):
        super().__init__()
        self.convert_charrefs = True
        self.text = []

    def handle_data(self, d):
        self.text.append(d)

    def get_data(self):
        return ''.join(self.text)


def strip_tags(html):
    """去除HTML标签，保留文本内容"""
    if not html:
        return ""
    s = MLStripper()
    try:
        s.feed(html)
        return s.get_data()
    except:
        return html


def decode_header(header_value):
    """解码邮件头"""
    if not header_value:
        return ""
    decoded_parts = []
    for part, encoding in email.header.decode_header(header_value):
        if isinstance(part, bytes):
            try:
                decoded_parts.append(part.decode(encoding or 'utf-8'))
            except:
                decoded_parts.append(part.decode('utf-8', errors='ignore'))
        else:
            decoded_parts.append(str(part))
    return ''.join(decoded_parts)


def get_server_config(email_address):
    """根据邮箱地址获取服务器配置"""
    domain = email_address.split('@')[-1].lower()
    return IMAP_SERVERS.get(domain, {"host": f"imap.{domain}", "port": 993})


def extract_email_body(msg):
    """提取邮件正文（支持纯文本和HTML）"""
    body = ""
    html_body = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))

            # 优先获取纯文本
            if content_type == "text/plain" and "attachment" not in content_disposition:
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or 'utf-8'
                    body = payload.decode(charset, errors='ignore')
                    break
                except:
                    continue

            # 备用HTML
            if content_type == "text/html" and "attachment" not in content_disposition:
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or 'utf-8'
                    html_body = payload.decode(charset, errors='ignore')
                except:
                    continue
    else:
        # 非多部分邮件
        try:
            payload = msg.get_payload(decode=True)
            charset = msg.get_content_charset() or 'utf-8'
            body = payload.decode(charset, errors='ignore')
        except:
            body = str(msg.get_payload())

    # 如果没有纯文本，使用HTML（去除标签）
    if not body and html_body:
        body = strip_tags(html_body)

    # 清理多余空白
    body = '\n'.join(line.strip() for line in body.split('\n') if line.strip())

    return body


def send_imap_id(mail):
    """发送IMAP ID信息（网易等邮箱要求）"""
    try:
        args = ("name", "EmailAssistant", "version", "1.0.0",
                "vendor", "LaborAny", "support-email", "support@laborany.com")
        mail._simple_command('ID', '("' + '" "'.join(args) + '")')
    except Exception:
        pass  # 不是所有服务器都支持ID命令


def fetch_emails(email_address, password, limit=20, unread_only=True,
                 include_body=True, max_body_length=10000):
    """获取邮件

    Args:
        email_address: 邮箱地址
        password: 密码/授权码
        limit: 获取数量限制
        unread_only: 是否只获取未读邮件
        include_body: 是否包含邮件正文
        max_body_length: 正文最大长度

    Returns:
        dict: {
            'success': bool,
            'emails': list,
            'count': int,
            'error': str or None
        }
    """
    server_config = get_server_config(email_address)

    try:
        # 连接服务器
        mail = imaplib.IMAP4_SSL(server_config["host"], server_config["port"])
        mail.login(email_address, password)

        # 发送IMAP ID信息（网易要求）
        send_imap_id(mail)

        # 选择收件箱
        typ, data = mail.select('INBOX')
        if typ != 'OK':
            return {
                'success': False,
                'emails': [],
                'count': 0,
                'error': f'选择收件箱失败: {data[0] if data else "Unknown error"}'
            }

        # 搜索邮件
        search_criteria = 'UNSEEN' if unread_only else 'ALL'
        typ, data = mail.search(None, search_criteria)
        if typ != 'OK':
            return {
                'success': False,
                'emails': [],
                'count': 0,
                'error': '搜索邮件失败'
            }

        email_ids = data[0].split()
        # 限制获取数量，取最新的
        if len(email_ids) > limit:
            email_ids = email_ids[-limit:]

        emails = []
        for eid in reversed(email_ids):
            typ, msg_data = mail.fetch(eid, '(RFC822)')
            if typ == 'OK':
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                email_obj = {
                    "id": eid.decode(),
                    "from": decode_header(msg.get("From", "")),
                    "to": decode_header(msg.get("To", "")),
                    "subject": decode_header(msg.get("Subject", "")),
                    "date": msg.get("Date", ""),
                }

                # 提取发件人信息
                from_addr = email_obj["from"]
                if "<" in from_addr:
                    # 提取邮箱地址
                    import re
                    match = re.search(r'<(.+?)>', from_addr)
                    if match:
                        email_obj["from_email"] = match.group(1)
                    else:
                        email_obj["from_email"] = from_addr
                    # 提取名称
                    name_match = re.match(r'(.+?)\s*<', from_addr)
                    if name_match:
                        email_obj["from_name"] = name_match.group(1).strip('"\' ')
                    else:
                        email_obj["from_name"] = from_addr
                else:
                    email_obj["from_email"] = from_addr
                    email_obj["from_name"] = from_addr

                # 提取正文
                if include_body:
                    email_obj["body"] = extract_email_body(msg)
                    if len(email_obj["body"]) > max_body_length:
                        email_obj["body"] = email_obj["body"][:max_body_length] + "\n...(内容已截断)"

                emails.append(email_obj)

        mail.close()
        mail.logout()

        return {
            'success': True,
            'emails': emails,
            'count': len(emails),
            'error': None
        }

    except imaplib.IMAP4.error as e:
        error_msg = str(e)
        if "Unsafe Login" in error_msg or "SELECT" in error_msg:
            error_msg = "登录被拒绝，请检查：1)IMAP服务已开启 2)使用授权码而非密码 3)163邮箱需在网页端授权第三方登录"
        return {
            'success': False,
            'emails': [],
            'count': 0,
            'error': error_msg
        }
    except Exception as e:
        return {
            'success': False,
            'emails': [],
            'count': 0,
            'error': f"连接错误: {str(e)}"
        }


def save_emails_to_file(emails, filepath):
    """保存邮件到JSON文件"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(emails, f, ensure_ascii=False, indent=2)
    return filepath


def load_emails_from_file(filepath):
    """从JSON文件加载邮件"""
    if os.path.exists(filepath):
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []


# 便捷函数
def quick_fetch(email_address: str, password: str, output_file: Optional[str] = None,
                limit: int = 20, user_id: Optional[str] = None) -> dict:
    """快速获取邮件并保存到文件

    Args:
        email_address: 邮箱地址
        password: 密码/授权码
        output_file: 输出文件路径（默认为emails.json）
        limit: 获取数量
        user_id: LaborAny 用户ID（用于凭据缓存）

    Returns:
        同 fetch_emails()
    """
    result = fetch_emails(email_address, password, limit=limit)

    # 登录成功后，尝试保存到缓存
    if result['success'] and user_id:
        try:
            from scripts.credential_cache import save_credential
            save_credential(email_address, password, user_id)
            result['cached'] = True
        except Exception:
            result['cached'] = False

    if result['success'] and output_file:
        save_emails_to_file(result['emails'], output_file)
        result['saved_to'] = output_file

    return result


def fetch_with_cache(email_address: str, user_id: Optional[str] = None,
                     limit: int = 20, ask_if_missing: bool = False) -> dict:
    """使用凭据缓存获取邮件

    Args:
        email_address: 邮箱地址
        user_id: LaborAny 用户ID
        limit: 获取数量
        ask_if_missing: 如果缓存中没有凭据，是否询问用户输入

    Returns:
        {
            'success': bool,
            'emails': list,
            'count': int,
            'error': str or None,
            'from_cache': bool,  # 是否使用了缓存的凭据
            'credential_saved': bool  # 是否是本次新保存的凭据
        }
    """
    if not user_id:
        return {
            'success': False,
            'emails': [],
            'count': 0,
            'error': '未提供用户ID，无法使用凭据缓存',
            'from_cache': False,
            'credential_saved': False
        }

    try:
        from scripts.credential_cache import CredentialCache
        cache = CredentialCache(user_id)

        # 尝试从缓存加载凭据
        credential = cache.load(email_address)

        if credential:
            # 使用缓存的凭据
            result = fetch_emails(email_address, credential['password'], limit=limit)
            result['from_cache'] = True
            result['credential_saved'] = False
            return result

        elif ask_if_missing:
            # 缓存中没有，询问用户
            import getpass
            print(f"未找到 {email_address} 的已保存凭据")

            password = getpass.getpass("请输入密码或授权码: ")

            # 验证凭据
            result = fetch_emails(email_address, password, limit=limit)

            if result['success']:
                # 验证成功，保存到缓存
                cache.save(email_address, password)
                result['from_cache'] = False
                result['credential_saved'] = True
                print("✅ 凭据已加密保存")
            else:
                result['from_cache'] = False
                result['credential_saved'] = False

            return result

        else:
            return {
                'success': False,
                'emails': [],
                'count': 0,
                'error': f'未找到 {email_address} 的已保存凭据',
                'from_cache': False,
                'credential_saved': False
            }

    except ImportError:
        return {
            'success': False,
            'emails': [],
            'count': 0,
            'error': '凭据缓存模块不可用',
            'from_cache': False,
            'credential_saved': False
        }


def list_cached_credentials(user_id: str) -> list:
    """列出用户的所有已缓存邮箱

    Args:
        user_id: LaborAny 用户ID

    Returns:
        邮箱地址列表
    """
    try:
        from scripts.credential_cache import CredentialCache
        cache = CredentialCache(user_id)
        credentials = cache.list_credentials()
        return [c['email_address'] for c in credentials]
    except Exception:
        return []


def clear_cached_credential(email_address: str, user_id: str) -> bool:
    """清除指定邮箱的缓存凭据

    Args:
        email_address: 邮箱地址
        user_id: LaborAny 用户ID

    Returns:
        是否清除成功
    """
    try:
        from scripts.credential_cache import CredentialCache
        cache = CredentialCache(user_id)
        return cache.delete(email_address)
    except Exception:
        return False


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("用法: python fetch_emails.py <邮箱地址> <密码/授权码> [数量]")
        sys.exit(1)

    email_addr = sys.argv[1]
    pwd = sys.argv[2]
    lim = int(sys.argv[3]) if len(sys.argv) > 3 else 20

    result = quick_fetch(email_addr, pwd, limit=lim)

    if result['success']:
        print(f"获取到 {result['count']} 封邮件")
        for i, e in enumerate(result['emails'], 1):
            print(f"{i}. {e['from'][:30]} | {e['subject'][:40]}")
    else:
        print(f"错误: {result['error']}")
        sys.exit(1)
