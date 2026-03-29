---
domain: youtube.com
aliases: [YouTube, youtube, 油管, yt]
access_strategy: cdp_only
verified_at: 2026-03-25
evidence_count: 4
---

## 平台特征
- SPA 架构，搜索结果和视频页都依赖前端渲染
- 已登录浏览器可直接利用订阅/历史/年龄限制上下文
- 部分视频描述、字幕和评论区是延迟加载的

## 有效模式
- 搜索：使用 YouTube 站内搜索页 results?search_query=
- 视频正文：优先提取标题、频道、发布时间、观看量、描述
- 若字幕面板已展开，可提取 transcript 片段作为补充

## 已知陷阱
- [2026-03] 未登录或风控时可能出现 Sign in / consent 提示，导致结果页不完整
- [2026-03] 字幕默认不展开，不能假设 transcript 一定存在
- [2026-03] Shorts / Live / Premiere 页面结构和普通视频略有不同

## 自动化配置
```json
{
  "search": {
    "mode": "search_engine",
    "entryUrl": "https://www.youtube.com/results",
    "queryParam": "search_query",
    "dismissSelectors": ["button[aria-label=\"Accept all\"]", "button[aria-label=\"Reject all\"]", "ytd-button-renderer tp-yt-paper-button"],
    "waitSelector": "ytd-video-renderer, ytd-rich-item-renderer",
    "resultSelector": "ytd-video-renderer, ytd-rich-item-renderer",
    "titleSelectors": ["#video-title", "a#video-title"],
    "linkSelector": "a#video-title",
    "snippetSelectors": ["#channel-name", "#metadata-line", "#description-text"],
    "blockedPatterns": ["sign in to confirm", "before you continue to youtube", "unavailable videos are hidden"]
  },
  "read": {
    "mode": "structured_video",
    "waitUrlIncludes": "/watch",
    "readySelector": "ytd-watch-metadata, #title h1",
    "rootSelector": "ytd-watch-flexy",
    "titleSelectors": ["#title h1 yt-formatted-string", "h1.ytd-watch-metadata"],
    "authorSelectors": ["ytd-watch-metadata #owner a", "#channel-name a", "#upload-info a"],
    "publishedAtSelectors": ["#info-strings yt-formatted-string", "#info span:nth-child(3)", "#info-strings"],
    "viewCountSelectors": ["#info span:nth-child(1)", "#count .view-count", "ytd-video-view-count-renderer"],
    "descriptionSelectors": ["#description-inline-expander", "#description", "ytd-expandable-video-description-body-renderer"],
    "transcriptContainerSelectors": ["ytd-transcript-renderer", "ytd-engagement-panel-section-list-renderer[target-id=\"engagement-panel-searchable-transcript\"]"],
    "transcriptSegmentSelectors": ["yt-formatted-string.segment-text", ".segment-text", ".cue-group .segment-text"]
  }
}
```
