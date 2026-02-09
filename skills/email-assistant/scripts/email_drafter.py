#!/usr/bin/env python3
"""
邮件拟稿工具
根据原始邮件和用户意图生成回复草稿
"""
import json
import sys
import re
from email.utils import parseaddr
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr, formatdate


def extract_sender_name(from_header):
    """提取发件人姓名"""
    name, email_addr = parseaddr(from_header)
    return name if name else email_addr.split('@')[0] if email_addr else "发件人"


def generate_reply_template(original_email, reply_type="agree", user_notes=""):
    """生成回复模板

    reply_type:
    - agree: 同意/接受
    - decline: 拒绝/婉拒
    - question: 提问/需要更多信息
    - confirm: 确认收到
    - custom: 自定义
    """
    sender = extract_sender_name(original_email.get('from', ''))
    subject = original_email.get('subject', '')
    body = original_email.get('body', '')

    # 清理主题前缀
    clean_subject = subject
    for prefix in ['Re: ', 'RE: ', '回复: ']:
        if clean_subject.startswith(prefix):
            clean_subject = clean_subject[len(prefix):]
            break
    reply_subject = f"Re: {clean_subject}"

    templates = {
        "agree": f"""Hi {sender},

感谢你的邮件。

关于你提到的内容，我没有意见/表示同意。

{user_notes}

Best regards""",

        "decline": f"""Hi {sender},

感谢你的邮件/邀请。

很抱歉，由于时间冲突/其他安排，我恐怕无法参加/接受。

{user_notes}

Best regards""",

        "question": f"""Hi {sender},

感谢你的邮件。

关于你提到的内容，我有几个问题想确认：

{user_notes if user_notes else "[请添加你的问题]"}

Best regards""",

        "confirm": f"""Hi {sender},

收到，感谢通知。

{user_notes}

Best regards""",

        "custom": f"""Hi {sender},

{user_notes if user_notes else "[请输入回复内容]"}

Best regards"""
    }

    body_content = templates.get(reply_type, templates["custom"])

    return {
        "to": original_email.get('to', ''),
        "from": "",  # 用户需要填写
        "subject": reply_subject,
        "body": body_content,
        "original_message_id": original_email.get('id', '')
    }


def create_email_draft(draft_data, output_file="draft.json"):
    """保存草稿为JSON"""
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(draft_data, f, ensure_ascii=False, indent=2)
    return output_file


def print_draft_preview(draft_data):
    """打印草稿预览"""
    print("\n" + "="*60)
    print("邮件草稿预览")
    print("="*60)
    print(f"收件人: {draft_data['to']}")
    print(f"主题: {draft_data['subject']}")
    print("-"*60)
    print(draft_data['body'])
    print("="*60)


def interactive_draft(original_emails_json):
    """交互式拟稿"""
    with open(original_emails_json, 'r', encoding='utf-8') as f:
        emails = json.load(f)

    print(f"\n找到 {len(emails)} 封邮件")
    print("\n请选择要回复的邮件:")

    for i, email in enumerate(emails, 1):
        print(f"  {i}. {email['from'][:30]:30} | {email['subject'][:30]}")

    choice = input("\n输入邮件编号 (或按取消): ").strip()
    if not choice.isdigit() or int(choice) < 1 or int(choice) > len(emails):
        print("取消")
        return

    selected = emails[int(choice) - 1]

    print(f"\n原始邮件:")
    print(f"  发件人: {selected['from']}")
    print(f"  主题: {selected['subject']}")
    print(f"  正文预览: {selected['body'][:200]}...")

    print("\n选择回复类型:")
    print("  1. 同意/接受")
    print("  2. 拒绝/婉拒")
    print("  3. 提问/确认")
    print("  4. 确认收到")
    print("  5. 自定义")

    type_choice = input("输入选项 (1-5): ").strip()
    type_map = {"1": "agree", "2": "decline", "3": "question", "4": "confirm", "5": "custom"}
    reply_type = type_map.get(type_choice, "custom")

    user_notes = input("\n添加补充内容 (可选，按回车跳过): ").strip()

    draft = generate_reply_template(selected, reply_type, user_notes)
    print_draft_preview(draft)

    save = input("\n是否保存草稿? (y/n): ").strip().lower()
    if save == 'y':
        output_file = f"draft_{selected['id']}.json"
        create_email_draft(draft, output_file)
        print(f"草稿已保存到: {output_file}")
        return output_file


def main():
    """命令行入口"""
    if len(sys.argv) < 2:
        print("用法: python email_drafter.py <emails.json>")
        return 1

    interactive_draft(sys.argv[1])
    return 0


if __name__ == "__main__":
    sys.exit(main())
