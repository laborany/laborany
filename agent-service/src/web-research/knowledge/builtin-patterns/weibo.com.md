---
domain: weibo.com
aliases: [微博, Weibo, 新浪微博, Sina Weibo]
access_strategy: cdp_preferred
verified_at: 2026-03-24
evidence_count: 6
---

## 平台特征
- SPA + SSR 混合架构，首屏部分内容可静态获取，但完整交互需 JS 渲染
- 强制登录墙：未登录用户浏览一定数量内容后弹出登录弹窗遮挡页面
- 多域名体系：weibo.com（主站）、m.weibo.cn（移动版）、s.weibo.com（搜索）
- 移动版 m.weibo.cn 反爬较弱，部分场景可作为替代入口

## 有效模式
- 用户主页：weibo.com/u/{uid} 或 weibo.com/{custom_domain}
- 单条微博：weibo.com/{uid}/{mid} 格式
- 搜索：s.weibo.com/weibo?q=关键词 （需要登录态才能获取完整结果）
- 移动版替代：m.weibo.cn/detail/{mid} 可在未登录时获取单条微博内容
- 内容提取：微博正文在 .detail_wbtext_4CRf9 或 [node-type="feed_list_content"] 中
- 图片提取：原图 URL 将 thumbnail 替换为 large 即可获取高清图

## 已知陷阱
- [2026-03] PC 版未登录时会弹出登录遮罩，阻断内容获取
- [2026-03] 搜索功能强制要求登录，未登录直接跳转登录页
- [2026-03] 长微博需要点击"展开全文"才能获取完整内容
- [2026-03] 图片防盗链：直接引用图片 URL 需要带正确 Referer 头
- [2026-03] 微博视频内容需要在 CDP 中通过 video 元素获取播放地址

## 自动化配置
```json
{
  "search": {
    "mode": "search_engine",
    "entryUrl": "https://s.weibo.com/weibo",
    "queryParam": "q",
    "waitSelector": ".card-wrap",
    "resultSelector": ".card-wrap",
    "titleSelectors": ["[node-type=\"feed_list_content\"]", ".detail_wbtext_4CRf9", ".txt"],
    "linkSelector": ".from a[href], a[href*=\"/detail/\"], a[href*=\"/status/\"]",
    "snippetSelectors": [".from", "[node-type=\"feed_list_content\"]", ".detail_wbtext_4CRf9", ".txt"],
    "blockedPatterns": ["请先登录", "登录后查看更多", "验证码"]
  },
  "read": {
    "mode": "generic",
    "readySelector": "[node-type=\"feed_list_content\"], .detail_wbtext_4CRf9, .weibo-text",
    "rootSelectors": [".WB_detail", ".detail", "article", "main"],
    "removeSelectors": ["script", "style", "nav", "footer", "iframe", "noscript", ".WB_minibtn", ".login-box", ".woo-modal-main", ".WB_handle", ".WB_row_line"]
  }
}
```
