---
domain: youtu.be
aliases: [youtu.be, YouTube Short Link]
access_strategy: cdp_only
verified_at: 2026-03-25
evidence_count: 2
---

## 平台特征
- YouTube 的短链接域名，通常会跳转到 youtube.com/watch
- 需要沿着跳转后的页面结构提取视频信息

## 有效模式
- 直接打开短链接，等待跳转到 /watch
- 复用 YouTube 视频页提取逻辑

## 已知陷阱
- [2026-03] 短链接本身没有正文，必须等待跳转完成

## 自动化配置
```json
{
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
