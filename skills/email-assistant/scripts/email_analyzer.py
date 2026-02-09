#!/usr/bin/env python3
"""
邮件分析工具
提取邮件中的关键信息：待办事项、会议邀请、重要日期等
"""
import re
import json
import sys
from datetime import datetime, timedelta
from typing import List, Dict, Any


def extract_action_items(text: str) -> List[Dict[str, str]]:
    """提取待办事项"""
    action_items = []

    # 待办关键词
    action_patterns = [
        r'(?:请|麻烦|帮我|需要|要求|请于|请你)\s*([^。！？\n]{3,50})[。！？]?',
        r'(?:TODO|待办|to[\-]?do)[:：]\s*([^\n]+)',
        r'(?:action\s+item|行动项)[:：]\s*([^\n]+)',
    ]

    for pattern in action_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            item = match.group(1).strip()
            if len(item) > 2:
                action_items.append({
                    "content": item,
                    "type": "action"
                })

    return action_items


def extract_meetings(text: str) -> List[Dict[str, str]]:
    """提取会议信息"""
    meetings = []

    # 会议关键词
    meeting_keywords = ['会议', '会面', '讨论', 'review', 'meeting', 'call', '演示']
    time_patterns = [
        r'(\d{1,2})[:：](\d{2})',  # 时间
        r'(今天|明天|后天|本周|下周|周[一二三四五六七日])',
        r'(\d{4})[年\-](\d{1,2})[月\-](\d{1,2})',
    ]

    has_keyword = any(kw in text.lower() for kw in meeting_keywords)
    if has_keyword:
        # 尝试提取具体时间
        for pattern in time_patterns:
            matches = re.finditer(pattern, text)
            for match in matches:
                time_str = match.group(0)
                meetings.append({
                    "time_mention": time_str,
                    "context": text[max(0, match.start()-30):match.end()+30]
                })
                break

    return meetings


def extract_dates(text: str) -> List[Dict[str, str]]:
    """提取日期和截止时间"""
    dates = []

    # 截止时间关键词
    deadline_patterns = [
        r'(?:截止|到期|deadline|due|之前|前完成)(?:[^。！？\n]{0,20})?[:：]?\s*([^\n。！？]{3,40})',
        r'(?:今天|明天|后天|(\d{1,2})月(\d{1,2})日)[前|前完成|前截止]',
    ]

    for pattern in deadline_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            dates.append({
                "type": "deadline",
                "mention": match.group(0),
                "detail": match.group(1) if match.lastindex else match.group(0)
            })

    return dates


def extract_importance(email: Dict[str, Any]) -> Dict[str, Any]:
    """判断邮件重要性"""
    indicators = {
        "high": ['紧急', '重要', 'urgent', 'important', 'asap', '尽快', '请立即', '请马上'],
        "medium": ['请确认', '请回复', 'please review', '需要反馈', '等待回复'],
    }

    subject = email.get('subject', '').lower()
    body = email.get('body', '').lower()

    for keyword in indicators['high']:
        if keyword in subject or keyword in body:
            return {"level": "high", "reason": f"包含关键词: {keyword}"}

    for keyword in indicators['medium']:
        if keyword in subject or keyword in body:
            return {"level": "medium", "reason": f"包含关键词: {keyword}"}

    return {"level": "normal", "reason": "无明显优先级标记"}


def analyze_email(email: Dict[str, Any]) -> Dict[str, Any]:
    """分析单封邮件"""
    body = email.get('body', '')

    return {
        "id": email.get('id'),
        "from": email.get('from'),
        "subject": email.get('subject'),
        "importance": extract_importance(email),
        "action_items": extract_action_items(body),
        "meetings": extract_meetings(body),
        "dates": extract_dates(body),
        "summary_needs_reply": needs_reply(email)
    }


def needs_reply(email: Dict[str, Any]) -> bool:
    """判断是否需要回复"""
    subject = email.get('subject', '').lower()
    body = email.get('body', '').lower()

    reply_indicators = [
        '?', '？',  # 问号
        '请回复', 'please reply', '请确认', 'please confirm',
        '期待回复', 'look forward to hearing',
        '有任何问题', 'if you have any questions',
        '请告知', 'please let me know'
    ]

    return any(indicator in subject or indicator in body for indicator in reply_indicators)


def analyze_emails_batch(emails_json: str, output_file: str = None) -> str:
    """批量分析邮件"""
    with open(emails_json, 'r', encoding='utf-8') as f:
        emails = json.load(f)

    results = [analyze_email(email) for email in emails]

    # 统计汇总
    summary = {
        "total": len(emails),
        "needs_reply": sum(1 for r in results if r['summary_needs_reply']),
        "high_priority": sum(1 for r in results if r['importance']['level'] == 'high'),
        "action_items_count": sum(len(r['action_items']) for r in results),
        "meetings_count": sum(len(r['meetings']) for r in results),
    }

    output = {
        "summary": summary,
        "emails": results
    }

    if output_file is None:
        output_file = emails_json.replace('.json', '_analyzed.json')

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"分析完成，结果保存到: {output_file}")
    print(f"\n汇总: {summary['total']}封邮件, {summary['needs_reply']}封需回复, {summary['high_priority']}封高优先级")

    return output_file


def print_summary(analyzed_json: str):
    """打印分析摘要"""
    with open(analyzed_json, 'r', encoding='utf-8') as f:
        data = json.load(f)

    summary = data['summary']
    emails = data['emails']

    print("\n" + "="*60)
    print("邮件分析摘要")
    print("="*60)
    print(f"总邮件数: {summary['total']}")
    print(f"需要回复: {summary['needs_reply']}")
    print(f"高优先级: {summary['high_priority']}")
    print(f"待办事项: {summary['action_items_count']}")
    print(f"会议相关: {summary['meetings_count']}")

    print("\n--- 需要回复的邮件 ---")
    for i, email in enumerate(emails, 1):
        if email['summary_needs_reply']:
            priority = email['importance']['level']
            mark = "🔴" if priority == "high" else "🟡" if priority == "medium" else "⚪"
            print(f"{mark} {email['from'][:30]:30} | {email['subject'][:30]}")

    print("\n--- 待办事项 ---")
    count = 0
    for email in emails:
        for item in email['action_items']:
            count += 1
            print(f"{count}. {item['content'][:60]}")
            if count >= 10:
                print(f"... 还有 {summary['action_items_count'] - 10} 项")
                break

    print("\n--- 可能的会议/日程 ---")
    count = 0
    for email in emails:
        for meeting in email['meetings']:
            count += 1
            print(f"{count}. {meeting.get('time_mention', '时间未明确')} - {meeting.get('context', '')[:50]}")
            if count >= 5:
                break


def main():
    """命令行入口"""
    if len(sys.argv) < 2:
        print("用法: python email_analyzer.py <emails.json> [output.json]")
        print("     python email_analyzer.py --summary <analyzed.json>")
        return 1

    if sys.argv[1] == '--summary':
        print_summary(sys.argv[2])
    else:
        input_file = sys.argv[1]
        output_file = sys.argv[2] if len(sys.argv) > 2 else None
        analyze_emails_batch(input_file, output_file)

    return 0


if __name__ == "__main__":
    sys.exit(main())
