#!/usr/bin/env python3
"""
IMAP邮箱客户端
支持连接IMAP服务器、获取未读邮件
支持网易邮箱的IMAP ID要求
"""
import imaplib
import email
import email.header
import json
import sys
from datetime import datetime
from getpass import getpass

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


def connect_imap(email_address, password, server_config=None):
    """连接IMAP服务器"""
    if server_config is None:
        server_config = get_server_config(email_address)

    try:
        mail = imaplib.IMAP4_SSL(server_config["host"], server_config["port"])
        mail.login(email_address, password)
        return mail
    except imaplib.IMAP4.error as e:
        print(f"登录失败: {e}")
        print("\n提示:")
        print("- Gmail 需要使用应用专用密码: https://myaccount.google.com/apppasswords")
        print("- QQ邮箱需要在设置中开启IMAP服务")
        print("- 163/126邮箱需要开启IMAP并使用授权码")
        return None
    except Exception as e:
        print(f"连接错误: {e}")
        return None


def fetch_unread_emails(mail, limit=20):
    """获取未读邮件"""
    try:
        mail.select("INBOX")
        status, messages = mail.search(None, 'UNSEEN')

        if status != 'OK':
            return []

        email_ids = messages[0].split()
        # 限制获取数量，最新的在前
        email_ids = email_ids[-limit:] if len(email_ids) > limit else email_ids

        emails = []
        for idx, eid in enumerate(reversed(email_ids)):
            status, msg_data = mail.fetch(eid, '(RFC822)')
            if status == 'OK':
                raw_email = msg_data[0][1]
                msg = email.message_from_bytes(raw_email)

                email_obj = {
                    "id": eid.decode(),
                    "from": decode_header(msg.get("From", "")),
                    "to": decode_header(msg.get("To", "")),
                    "subject": decode_header(msg.get("Subject", "")),
                    "date": msg.get("Date", ""),
                    "body": "",
                    "is_multipart": msg.is_multipart()
                }

                # 提取邮件正文
                body = ""
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
                        elif content_type == "text/html" and not body and "attachment" not in content_disposition:
                            try:
                                payload = part.get_payload(decode=True)
                                charset = part.get_content_charset() or 'utf-8'
                                body = payload.decode(charset, errors='ignore')
                            except:
                                continue
                else:
                    try:
                        payload = msg.get_payload(decode=True)
                        charset = msg.get_content_charset() or 'utf-8'
                        body = payload.decode(charset, errors='ignore')
                    except:
                        body = str(msg.get_payload())

                email_obj["body"] = body
                emails.append(email_obj)

        return emails

    except Exception as e:
        print(f"获取邮件失败: {e}")
        return []


def save_emails_json(emails, output_file="emails.json"):
    """保存邮件到JSON文件"""
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(emails, f, ensure_ascii=False, indent=2)
    return output_file


def get_password_hint(domain):
    """根据邮箱类型返回密码提示"""
    hints = {
        "gmail.com": "\n💡 Gmail需要使用应用专用密码: https://myaccount.google.com/apppasswords",
        "qq.com": "\n💡 请确保已在QQ邮箱设置中开启IMAP服务",
        "163.com": "\n💡 163邮箱需要使用授权码，而非登录密码",
        "126.com": "\n💡 126邮箱需要使用授权码，而非登录密码",
    }
    return hints.get(domain, "")


def main():
    """命令行入口"""
    print("=== 邮箱助手 ===\n")

    # 获取邮箱地址 - 使用问题形式
    email_address = input("请问您的邮箱地址是什么? ").strip()
    if not email_address or '@' not in email_address:
        print("邮箱地址格式不正确，请重新运行")
        return 1

    # 根据邮箱类型给出提示
    domain = email_address.split('@')[-1].lower()
    hint = get_password_hint(domain)

    # 获取密码 - 使用问题形式
    password = getpass(f"好的，请问您的密码或授权码是什么? {hint}\n> ")

    # 显示服务器配置
    server_config = get_server_config(email_address)
    print(f"\n连接服务器: {server_config['host']}:{server_config['port']}")

    # 连接并获取邮件
    mail = connect_imap(email_address, password, server_config)
    if not mail:
        return 1

    print("\n✅ 登录成功！")

    # 发送IMAP ID信息（网易等邮箱要求）
    try:
        args = ("name", "EmailAssistant", "version", "1.0.0", "vendor", "LaborAny", "support-email", "support@laborany.com")
        mail._simple_command('ID', '("' + '" "'.join(args) + '")')
    except:
        pass  # 不是所有服务器都支持ID命令

    # 询问获取多少邮件
    limit_input = input("\n请问您想获取最近多少封未读邮件? (直接回车默认20封) ").strip()
    limit = int(limit_input) if limit_input else 20
    emails = fetch_unread_emails(mail, limit=limit)
    mail.logout()

    if not emails:
        print("\n📬 目前没有未读邮件")
        return 0

    print(f"\n📬 已获取 {len(emails)} 封未读邮件")

    output_file = save_emails_json(emails)
    print(f"📁 邮件已保存到: {output_file}")

    # 简单摘要
    print("\n--- 邮件预览 ---")
    for i, e in enumerate(emails, 1):
        sender = e['from'][:30]
        subject = e['subject'][:40] if e['subject'] else '(无主题)'
        print(f"{i}. {sender:35} | {subject}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
