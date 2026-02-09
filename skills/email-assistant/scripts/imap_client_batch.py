#!/usr/bin/env python3
"""
IMAP邮箱客户端 - 批处理模式
支持命令行参数传入凭据，支持网易邮箱IMAP ID要求
"""
import imaplib
import email
import email.header
import json
import sys
import os
from html.parser import HTMLParser

# 添加ID命令支持（网易等邮箱要求）
imaplib.Commands['ID'] = ('AUTH',)

# 常用邮箱服务器配置
IMAP_SERVERS = {
    "gmail.com": {"host": "imap.gmail.com", "port": 993},
    "outlook.com": {"host": "outlook.office365.com", "port": 993},
    "qq.com": {"host": "imap.qq.com", "port": 993},
    "163.com": {"host": "imap.163.com", "port": 993},
    "126.com": {"host": "imap.126.com", "port": 993},
    "yahoo.com": {"host": "imap.mail.yahoo.com", "port": 993},
}


class MLStripper(HTMLParser):
    """HTML标签清理器"""
    def __init__(self):
        super().__init__()
        self.reset()
        self.convert_charrefs = True
        self.text = []

    def handle_data(self, d):
        self.text.append(d)

    def get_data(self):
        return ''.join(self.text)


def strip_tags(html):
    """去除HTML标签"""
    s = MLStripper()
    s.feed(html)
    return s.get_data()


def decode_header(header_value):
    """解码邮件头"""
    if not header_value:
        return ""
    decoded_parts = []
    for part, encoding in email.header.decode_header(header_value):
        if isinstance(part, bytes):
            if encoding:
                try:
                    decoded_parts.append(part.decode(encoding))
                except:
                    decoded_parts.append(part.decode('utf-8', errors='ignore'))
            else:
                decoded_parts.append(part.decode('utf-8', errors='ignore'))
        else:
            decoded_parts.append(str(part))
    return ''.join(decoded_parts)


def get_server_config(email_address):
    """根据邮箱地址获取服务器配置"""
    domain = email_address.split('@')[-1].lower()
    return IMAP_SERVERS.get(domain, {"host": f"imap.{domain}", "port": 993})


def send_imap_id(mail):
    """发送IMAP ID信息（网易等邮箱要求）"""
    try:
        args = ("name", "EmailAssistant", "version", "1.0.0",
                "vendor", "LaborAny", "support-email", "support@laborany.com")
        mail._simple_command('ID', '("' + '" "'.join(args) + '")')
    except Exception:
        pass  # 不是所有服务器都支持ID命令


def extract_body(msg):
    """提取邮件正文（支持纯文本和HTML）"""
    body = ""
    html_body = ""

    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition", ""))

            if content_type == "text/plain" and "attachment" not in content_disposition:
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or 'utf-8'
                    body = payload.decode(charset, errors='ignore')
                    break
                except:
                    continue

            if content_type == "text/html" and "attachment" not in content_disposition:
                try:
                    payload = part.get_payload(decode=True)
                    charset = part.get_content_charset() or 'utf-8'
                    html_body = payload.decode(charset, errors='ignore')
                except:
                    continue
    else:
        try:
            payload = msg.get_payload(decode=True)
            charset = msg.get_content_charset() or 'utf-8'
            body = payload.decode(charset, errors='ignore')
        except:
            body = str(msg.get_payload())

    # 如果没有纯文本，使用HTML（去除标签）
    if not body and html_body:
        body = strip_tags(html_body)

    return body


def fetch_emails(email_address, password, limit=20, unread_only=True, output_file=None):
    """连接并获取邮件

    Args:
        email_address: 邮箱地址
        password: 密码/授权码
        limit: 获取数量
        unread_only: 是否只获取未读邮件
        output_file: 输出文件路径（默认为脚本目录下的emails.json）

    Returns:
        邮件列表
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
            print(f"选择收件箱失败: {data}")
            return []

        # 搜索邮件
        if unread_only:
            search_criteria = 'UNSEEN'
        else:
            search_criteria = 'ALL'

        typ, data = mail.search(None, search_criteria)
        if typ != 'OK':
            return []

        email_ids = data[0].split()
        # 限制获取数量，最新的在前
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
                    "body": ""
                }

                # 提取邮件正文
                email_obj["body"] = extract_body(msg)
                emails.append(email_obj)

        mail.close()
        mail.logout()

        # 保存到JSON
        if output_file is None:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            output_file = os.path.join(script_dir, '..', 'emails.json')
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(emails, f, ensure_ascii=False, indent=2)

        return emails

    except imaplib.IMAP4.error as e:
        print(f"IMAP错误: {e}")
        print("\n提示:")
        print("- Gmail 需要使用应用专用密码: https://myaccount.google.com/apppasswords")
        print("- QQ邮箱需要在设置中开启IMAP服务")
        print("- 163/126邮箱需要开启IMAP并使用授权码")
        return []
    except Exception as e:
        print(f"连接错误: {e}")
        return []


def main():
    """命令行入口

    用法:
        python imap_client_batch.py <邮箱地址> <密码/授权码> [数量] [--all]

    参数:
        邮箱地址: 完整的邮箱地址
        密码/授权码: 登录密码或授权码
        数量: 获取邮件数量（默认20封）
        --all: 获取所有邮件，不只是未读
    """
    if len(sys.argv) < 3:
        print("用法: python imap_client_batch.py <邮箱地址> <密码/授权码> [数量] [--all]")
        print()
        print("示例:")
        print("  python imap_client_batch.py example@gmail.com mypassword")
        print("  python imap_client_batch.py example@163.com authcode 50")
        print("  python imap_client_batch.py example@qq.com password 10 --all")
        return 1

    email_address = sys.argv[1]
    password = sys.argv[2]

    # 解析参数
    limit = 20
    unread_only = True
    for arg in sys.argv[3:]:
        if arg == "--all":
            unread_only = False
        elif arg.isdigit():
            limit = int(arg)

    print(f"正在连接 {email_address}...")

    emails = fetch_emails(email_address, password, limit=limit, unread_only=unread_only)

    if not emails:
        mail_type = "未读" if unread_only else ""
        print(f"没有{mail_type}邮件")
        return 0

    mail_type = "未读" if unread_only else ""
    print(f"获取到 {len(emails)} 封{mail_type}邮件")

    # 显示预览
    for i, e in enumerate(emails, 1):
        sender = e['from'][:30]
        subject = e['subject'][:40] if e['subject'] else '(无主题)'
        print(f"{i}. {sender} | {subject}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
