#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         财务分析脚本                                       ║
# ║                                                                          ║
# ║  职责：分析财务报表，计算关键指标                                            ║
# ╚══════════════════════════════════════════════════════════════════════════╝

import json
import sys
from typing import Optional

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           模拟财务数据（MVP 阶段）                           │
# └──────────────────────────────────────────────────────────────────────────┘
MOCK_FINANCIALS = {
    "腾讯": {
        "revenue": {"2023": 6090, "2022": 5546, "2021": 5601},  # 亿元
        "net_profit": {"2023": 1577, "2022": 1156, "2021": 2248},
        "gross_margin": {"2023": 0.468, "2022": 0.428, "2021": 0.440},
        "net_margin": {"2023": 0.259, "2022": 0.208, "2021": 0.401},
        "roe": {"2023": 0.185, "2022": 0.142, "2021": 0.268},
        "debt_ratio": {"2023": 0.425, "2022": 0.438, "2021": 0.412},
        "current_ratio": {"2023": 1.42, "2022": 1.35, "2021": 1.48},
    },
    "阿里": {
        "revenue": {"2023": 8687, "2022": 8531, "2021": 7173},
        "net_profit": {"2023": 725, "2022": 470, "2021": 1503},
        "gross_margin": {"2023": 0.382, "2022": 0.365, "2021": 0.398},
        "net_margin": {"2023": 0.083, "2022": 0.055, "2021": 0.210},
        "roe": {"2023": 0.068, "2022": 0.045, "2021": 0.142},
        "debt_ratio": {"2023": 0.385, "2022": 0.392, "2021": 0.368},
        "current_ratio": {"2023": 1.58, "2022": 1.52, "2021": 1.65},
    },
    "茅台": {
        "revenue": {"2023": 1476, "2022": 1241, "2021": 1062},
        "net_profit": {"2023": 747, "2022": 627, "2021": 525},
        "gross_margin": {"2023": 0.918, "2022": 0.915, "2021": 0.912},
        "net_margin": {"2023": 0.506, "2022": 0.505, "2021": 0.494},
        "roe": {"2023": 0.342, "2022": 0.318, "2021": 0.298},
        "debt_ratio": {"2023": 0.218, "2022": 0.225, "2021": 0.232},
        "current_ratio": {"2023": 3.85, "2022": 3.72, "2021": 3.58},
    },
}


def analyze_financials(keyword: str) -> Optional[dict]:
    """分析财务数据"""
    keyword_lower = keyword.lower()
    for name, data in MOCK_FINANCIALS.items():
        # 支持中文名、英文名、股票代码匹配
        if (name in keyword or
            keyword_lower in name.lower() or
            "tencent" in keyword_lower and name == "腾讯" or
            "alibaba" in keyword_lower and name == "阿里" or
            "moutai" in keyword_lower and name == "茅台" or
            "0700" in keyword and name == "腾讯" or
            "9988" in keyword and name == "阿里" or
            "600519" in keyword and name == "茅台"):
            # 计算增长率
            revenue_growth = (data["revenue"]["2023"] - data["revenue"]["2022"]) / data["revenue"]["2022"]
            profit_growth = (data["net_profit"]["2023"] - data["net_profit"]["2022"]) / data["net_profit"]["2022"]

            return {
                "company": name,
                "latest_year": "2023",
                "revenue": data["revenue"]["2023"],
                "revenue_growth": f"{revenue_growth:.1%}",
                "net_profit": data["net_profit"]["2023"],
                "profit_growth": f"{profit_growth:.1%}",
                "gross_margin": f"{data['gross_margin']['2023']:.1%}",
                "net_margin": f"{data['net_margin']['2023']:.1%}",
                "roe": f"{data['roe']['2023']:.1%}",
                "debt_ratio": f"{data['debt_ratio']['2023']:.1%}",
                "current_ratio": data["current_ratio"]["2023"],
                "historical": data,
            }
    return None


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "请提供公司名称"}))
        sys.exit(1)

    keyword = sys.argv[1]
    result = analyze_financials(keyword)

    if result:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"error": f"未找到财务数据: {keyword}"}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
