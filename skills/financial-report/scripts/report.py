#!/usr/bin/env python3
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                         研报生成脚本                                       ║
# ║                                                                          ║
# ║  职责：根据公司名称生成结构化研究报告                                         ║
# ╚══════════════════════════════════════════════════════════════════════════╝

import json
import sys
from datetime import datetime
from typing import Optional

# ┌──────────────────────────────────────────────────────────────────────────┐
# │                           模拟数据（MVP 阶段）                              │
# └──────────────────────────────────────────────────────────────────────────┘
MOCK_DATA = {
    "腾讯": {
        "stock_info": {
            "code": "0700.HK",
            "name": "腾讯控股",
            "industry": "互联网",
            "market_cap": "3.2万亿港元",
            "pe_ratio": 18.5,
            "pb_ratio": 3.2,
            "price": 320.0,
            "change": 2.5,
        },
        "financials": {
            "revenue": 6090,
            "revenue_growth": "9.8%",
            "net_profit": 1577,
            "profit_growth": "36.4%",
            "gross_margin": "46.8%",
            "net_margin": "25.9%",
            "roe": "18.5%",
            "debt_ratio": "42.5%",
            "current_ratio": 1.42,
        },
    },
    "阿里": {
        "stock_info": {
            "code": "9988.HK",
            "name": "阿里巴巴",
            "industry": "电商/云计算",
            "market_cap": "1.8万亿港元",
            "pe_ratio": 15.2,
            "pb_ratio": 1.8,
            "price": 85.0,
            "change": -1.2,
        },
        "financials": {
            "revenue": 8687,
            "revenue_growth": "1.8%",
            "net_profit": 725,
            "profit_growth": "54.3%",
            "gross_margin": "38.2%",
            "net_margin": "8.3%",
            "roe": "6.8%",
            "debt_ratio": "38.5%",
            "current_ratio": 1.58,
        },
    },
}


def find_company(keyword: str) -> Optional[tuple]:
    """根据关键词查找公司数据"""
    keyword_lower = keyword.lower()
    for name, data in MOCK_DATA.items():
        if (name in keyword or
            data["stock_info"]["code"].lower() in keyword_lower or
            "tencent" in keyword_lower and name == "腾讯" or
            "alibaba" in keyword_lower and name == "阿里" or
            "0700" in keyword and name == "腾讯" or
            "9988" in keyword and name == "阿里"):
            return name, data
    return None


def generate_report(company: str, stock_info: dict, financials: dict) -> str:
    """生成研究报告"""
    today = datetime.now().strftime("%Y年%m月%d日")
    roe_val = float(financials.get('roe', '0%').rstrip('%'))
    debt_val = float(financials.get('debt_ratio', '0%').rstrip('%'))

    return f"""# {stock_info.get('name', company)} 财务分析报告

**报告日期**：{today}
**股票代码**：{stock_info.get('code', 'N/A')}
**所属行业**：{stock_info.get('industry', 'N/A')}

---

## 一、公司概况

{stock_info.get('name', company)} 是{stock_info.get('industry', '该行业')}领域的领先企业，当前市值约 {stock_info.get('market_cap', 'N/A')}。

**估值指标**：
- 市盈率 (PE)：{stock_info.get('pe_ratio', 'N/A')}
- 市净率 (PB)：{stock_info.get('pb_ratio', 'N/A')}
- 当前股价：{stock_info.get('price', 'N/A')} 元
- 今日涨跌：{stock_info.get('change', 0):+.2f}%

---

## 二、财务分析

### 2.1 盈利能力

| 指标 | 数值 | 说明 |
|------|------|------|
| 营业收入 | {financials.get('revenue', 'N/A')} 亿元 | 同比增长 {financials.get('revenue_growth', 'N/A')} |
| 净利润 | {financials.get('net_profit', 'N/A')} 亿元 | 同比增长 {financials.get('profit_growth', 'N/A')} |
| 毛利率 | {financials.get('gross_margin', 'N/A')} | 反映产品竞争力 |
| 净利率 | {financials.get('net_margin', 'N/A')} | 反映盈利效率 |
| ROE | {financials.get('roe', 'N/A')} | 反映股东回报 |

### 2.2 偿债能力

| 指标 | 数值 | 评估 |
|------|------|------|
| 资产负债率 | {financials.get('debt_ratio', 'N/A')} | {'健康' if debt_val < 50 else '偏高'} |
| 流动比率 | {financials.get('current_ratio', 'N/A')} | {'良好' if financials.get('current_ratio', 0) > 1.5 else '一般'} |

---

## 三、风险提示

1. **市场风险**：宏观经济波动可能影响公司业绩
2. **行业风险**：行业竞争加剧可能压缩利润空间
3. **政策风险**：监管政策变化可能带来不确定性

---

## 四、投资建议

基于以上分析，{stock_info.get('name', company)} 整体财务状况{'良好' if roe_val > 15 else '一般'}，建议投资者：

- 关注公司核心业务发展
- 结合自身风险承受能力做出投资决策
- 分散投资，控制仓位

---

**免责声明**：本报告仅供参考，不构成投资建议。投资有风险，入市需谨慎。
"""


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "请提供公司名称"}))
        sys.exit(1)

    keyword = sys.argv[1]
    result = find_company(keyword)

    if result:
        name, data = result
        report = generate_report(name, data["stock_info"], data["financials"])
        print(report)
    else:
        print(json.dumps({"error": f"未找到公司数据: {keyword}"}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
