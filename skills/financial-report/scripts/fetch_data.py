#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         股票数据获取脚本                                   ║
# ║                                                                          ║
# ║  职责：获取股票基本信息、实时行情、历史数据                                   ║
# ╚══════════════════════════════════════════════════════════════════════════╝

import json
import sys
from typing import Optional

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           模拟数据（MVP 阶段）                              │
# └──────────────────────────────────────────────────────────────────────────┘
MOCK_STOCKS = {
    "腾讯": {
        "code": "0700.HK",
        "name": "腾讯控股",
        "industry": "互联网",
        "market_cap": "3.2万亿港元",
        "pe_ratio": 18.5,
        "pb_ratio": 3.2,
        "price": 320.0,
        "change": 2.5,
    },
    "阿里": {
        "code": "9988.HK",
        "name": "阿里巴巴",
        "industry": "电商/云计算",
        "market_cap": "1.8万亿港元",
        "pe_ratio": 15.2,
        "pb_ratio": 1.8,
        "price": 85.0,
        "change": -1.2,
    },
    "茅台": {
        "code": "600519.SH",
        "name": "贵州茅台",
        "industry": "白酒",
        "market_cap": "2.1万亿元",
        "pe_ratio": 28.5,
        "pb_ratio": 8.5,
        "price": 1680.0,
        "change": 0.8,
    },
}


def fetch_stock_info(keyword: str) -> Optional[dict]:
    """根据关键词获取股票信息"""
    keyword_lower = keyword.lower()
    for name, data in MOCK_STOCKS.items():
        # 支持中文名、英文名、股票代码匹配
        if (name in keyword or
            data["code"].lower() in keyword_lower or
            keyword_lower in name.lower() or
            "tencent" in keyword_lower and name == "腾讯" or
            "alibaba" in keyword_lower and name == "阿里" or
            "moutai" in keyword_lower and name == "茅台"):
            return data
    return None


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "请提供股票名称或代码"}))
        sys.exit(1)

    keyword = sys.argv[1]
    result = fetch_stock_info(keyword)

    if result:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"error": f"未找到股票: {keyword}"}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
