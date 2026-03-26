---
domain: bing.com
aliases: [Bing, 必应, bing search]
access_strategy: static_ok
verified_at: 2026-03-25
evidence_count: 50
---

## 平台特征
- 微软搜索引擎，在中国大陆可直接访问
- 支持 site: 前缀限定搜索范围
- 搜索结果在 li.b_algo 容器中
- 作为 Google 不可用时的备选搜索引擎

## 有效模式
- 搜索URL：https://www.bing.com/search?q={query}
- site搜索：q=site:example.com+{keywords}
- 中文搜索：https://cn.bing.com/search?q={query}
- 结果提取选择器：li.b_algo 内的 h2 a（标题+链接）、p.b_lineclamp2（摘要）
- 备选摘要选择器：div.b_caption p

## 已知陷阱
- [2026-03] cn.bing.com 和 www.bing.com 返回结果可能不同
- [2026-03] 部分搜索结果可能被折叠，需要点击"更多"展开

## 自动化配置
```json
{
  "search": {
    "mode": "search_engine",
    "entryUrl": "https://www.bing.com/search",
    "queryParam": "q",
    "languageParam": "setlang",
    "languageMap": {
      "zh": "zh-Hans",
      "en": "en"
    },
    "recencyParam": "filters",
    "recencyMap": {
      "day": "ex1:\"ez1\"",
      "week": "ex1:\"ez2\"",
      "month": "ex1:\"ez3\""
    },
    "waitSelector": "li.b_algo",
    "resultSelector": "li.b_algo",
    "titleSelectors": ["h2 a"],
    "linkSelector": "h2 a",
    "snippetSelectors": ["p.b_lineclamp2", "div.b_caption p", "p"],
    "blockedPatterns": [
      "请解决以下难题以继续",
      "solve the following puzzle to continue",
      "verify you are human",
      "prove you are human"
    ]
  }
}
```
