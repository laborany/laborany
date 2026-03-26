---
domain: google.com
aliases: [Google, 谷歌, google search]
access_strategy: static_ok
verified_at: 2026-03-25
evidence_count: 100
---

## 平台特征
- 全球最大搜索引擎
- 支持 site: 前缀限定搜索范围
- 搜索结果在 div.g 容器中，每个结果包含标题(h3)、链接(a href)、摘要(div.VwiC3b 或 span.aCOpRe)
- 支持时间范围过滤参数 tbs=qdr:d/w/m/y
- 支持语言参数 hl=zh-CN/en

## 有效模式
- 搜索URL：https://www.google.com/search?q={query}&hl={lang}
- site搜索：q=site:example.com+{keywords}
- 时间过滤：&tbs=qdr:d (一天内), qdr:w (一周), qdr:m (一月), qdr:y (一年)
- 结果提取选择器：div.g 内的 h3（标题）、a[href]（链接）、div.VwiC3b（摘要）
- 备选摘要选择器：span.aCOpRe, div[data-sncf] span

## 已知陷阱
- [2026-03] 频繁访问可能触发验证码（CAPTCHA），建议间隔 2-3 秒
- [2026-03] 某些地区可能需要代理才能访问
- [2026-03] 搜索结果 DOM 结构会不定期变化，选择器可能需要更新

## 自动化配置
```json
{
  "search": {
    "mode": "search_engine",
    "entryUrl": "https://www.google.com/search",
    "queryParam": "q",
    "languageParam": "hl",
    "languageMap": {
      "zh": "zh-CN",
      "en": "en"
    },
    "recencyParam": "tbs",
    "recencyMap": {
      "day": "qdr:d",
      "week": "qdr:w",
      "month": "qdr:m",
      "year": "qdr:y"
    },
    "waitSelector": "div.g, div[data-hveid] div.tF2Cxc",
    "resultSelector": "div.g, div[data-hveid] div.tF2Cxc",
    "titleSelectors": ["h3"],
    "linkSelector": "a[href^=\"http\"]",
    "snippetSelectors": ["div.VwiC3b", "span.aCOpRe", "div[data-sncf] span", "div.IsZvec"],
    "blockedPatterns": [
      "异常流量",
      "unusual traffic",
      "our systems have detected unusual traffic",
      "not a robot"
    ]
  }
}
```
