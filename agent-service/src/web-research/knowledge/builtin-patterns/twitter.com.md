---
domain: twitter.com
aliases: [Twitter, 推特, twitter.com]
access_strategy: cdp_preferred
verified_at: 2026-03-24
evidence_count: 6
---

## 平台特征
- 完全 SPA 架构（React），内容通过 GraphQL API 动态加载
- twitter.com 会 301 重定向到 x.com，两个域名指向同一平台
- 未登录状态下可浏览公开推文和用户主页，但推荐流受限
- 部分内容（如 Spaces、Communities）需要登录才能访问

## 有效模式
- 用户主页：x.com/{username} 或 twitter.com/{username}
- 单条推文：x.com/{username}/status/{tweet_id}
- 搜索：x.com/search?q=关键词&src=typed_query
- 内容提取：推文正文在 [data-testid="tweetText"] 元素中
- 推文时间：从 time[datetime] 元素获取 ISO 时间戳
- 图片提取：媒体在 [data-testid="tweetPhoto"] img[src] 中

## 已知陷阱
- [2026-03] twitter.com 链接自动跳转到 x.com，匹配时需同时考虑两个域名
- [2026-03] 高级搜索需要登录态，未登录只能使用基础搜索
- [2026-03] 推文线程（thread）需要滚动加载完整对话链
- [2026-03] 嵌入的引用推文和转推可能需要额外点击展开

## 自动化配置
```json
{
  "search": {
    "mode": "search_engine",
    "entryUrl": "https://x.com/search",
    "queryParam": "q",
    "waitSelector": "[data-testid=\"tweet\"], article",
    "resultSelector": "[data-testid=\"tweet\"], article",
    "titleSelectors": ["[data-testid=\"tweetText\"]"],
    "linkSelector": "a[href*=\"/status/\"]",
    "snippetSelectors": ["[data-testid=\"User-Name\"]", "time"],
    "blockedPatterns": ["something went wrong", "sign in", "join today", "登录"]
  },
  "read": {
    "mode": "generic",
    "readySelector": "[data-testid=\"tweetText\"], article, main",
    "rootSelectors": ["main [data-testid=\"primaryColumn\"]", "article", "main"],
    "removeSelectors": ["script", "style", "nav", "footer", "iframe", "noscript", "aside", "[data-testid=\"sidebarColumn\"]"]
  }
}
```
