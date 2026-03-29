---
domain: xiaohongshu.com
aliases: [小红书, 小红书APP, xhs]
access_strategy: cdp_only
verified_at: 2026-03-24
evidence_count: 10
---

## 平台特征
- SPA 架构，内容完全动态渲染
- 严格反爬机制，静态请求返回空壳 HTML
- xsec_token 机制：笔记链接包含时效性安全 token

## 有效模式
- 搜索：在小红书站内搜索栏输入关键词
- 笔记详情：从搜索结果列表点击进入（保留完整 URL 参数）
- 内容提取：图片从 .note-image img[src] 获取
- URL 格式：不要手动构造笔记 URL，从搜索结果中获取完整链接

## 已知陷阱
- [2026-03] 手动构造的笔记 URL 会被 xsec_token 校验拦截
- [2026-03] 不要删减 URL 中的查询参数，它们包含必要的安全 token
- [2026-03] 创作者平台需要登录态才能访问

## 自动化配置
```json
{
  "search": {
    "mode": "site_form",
    "entryUrl": "https://www.xiaohongshu.com/explore",
    "keywordAliases": ["小红书", "xiaohongshu", "xhs"],
    "dismissSelectors": ["button.reds-alert-footer__right"],
    "inputSelector": "input.search-input",
    "submitSelector": "div.search-icon",
    "waitUrlIncludes": "/search_result",
    "waitSelector": "a[href*=\"/search_result/\"][href*=\"xsec_token\"], a.cover.mask[href*=\"/search_result/\"]",
    "postSubmitDelayMs": 1500,
    "resultSelector": "a[href*=\"/search_result/\"][href*=\"xsec_token\"], a.cover.mask[href*=\"/search_result/\"]",
    "titleSelectors": [".title span", ".title"],
    "snippetFields": [
      { "selector": ".author .name" },
      { "selector": ".author .time" },
      { "selector": ".count", "prefix": "likes " }
    ]
  },
  "read": {
    "mode": "structured_note",
    "waitUrlIncludes": "/explore/",
    "readySelector": "#noteContainer #detail-title",
    "rootSelector": "#noteContainer",
    "titleSelectors": ["#detail-title"],
    "authorSelectors": [".author .name .username", ".author .name", ".author-container .name .username"],
    "publishedAtSelectors": [".bottom-container .date", ".note-content .date"],
    "bodySelectors": ["#detail-desc .note-text", "#detail-desc"],
    "tagSelectors": ["#detail-desc a.tag", "#detail-desc #hash-tag", "#detail-desc .tag"],
    "statSelectors": {
      "like": [".engage-bar .interact-container:nth-of-type(1) .count"],
      "collect": [".engage-bar .interact-container:nth-of-type(2) .count"],
      "comment": [".engage-bar .interact-container:nth-of-type(3) .count", ".comments-container .total"]
    },
    "imageSelector": ".media-container img[src], .note-image img[src]",
    "commentSelector": ".comments-container .comment-item",
    "commentAuthorSelectors": [".author .name", ".author .username", ".author"],
    "commentBodySelectors": [".content .note-text", ".content"],
    "commentMetaSelectors": [".date"],
    "replyCommentClass": "comment-item-sub",
    "commentLimit": 5
  }
}
```
