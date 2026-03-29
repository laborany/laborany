---
domain: zhihu.com
aliases: [知乎, Zhihu]
access_strategy: cdp_preferred
verified_at: 2026-03-24
evidence_count: 8
---

## 平台特征
- SSR + CSR 混合架构，首屏有部分静态内容但完整内容需要 JS 渲染
- 回答折叠机制：长回答默认折叠，需点击"展开"才能看到全文
- 未登录状态下部分内容被遮挡，弹出登录弹窗
- 反爬策略中等：高频请求会触发验证码，静态请求能获取部分内容

## 有效模式
- 搜索：使用 zhihu.com/search?type=content&q=关键词 进行站内搜索
- 问题页：zhihu.com/question/{id} 可获取问题描述和部分回答
- 文章页：zhuanlan.zhihu.com/p/{id} 静态请求可获取大部分内容
- 回答全文：在 CDP 中点击"展开阅读全文"按钮获取完整回答
- Jina 可用于文章页（zhuanlan），但问答页效果不佳

## 已知陷阱
- [2026-03] 未登录时首页和推荐流内容受限，会弹出登录遮罩
- [2026-03] 回答排序可能因登录态不同而变化，匿名访问时高赞回答可能不在首位
- [2026-03] 部分专栏文章设置了付费墙或仅关注者可见
- [2026-03] 高频访问会触发验证码，建议控制请求频率

## 自动化配置
```json
{
  "search": {
    "mode": "search_engine",
    "entryUrl": "https://www.zhihu.com/search?type=content",
    "queryParam": "q",
    "waitSelector": ".SearchResult-Card, .List-item, .Search-item",
    "resultSelector": ".SearchResult-Card, .List-item, .Search-item",
    "titleSelectors": [".SearchItem-title", "h2", "[itemprop=\"name\"]"],
    "linkSelector": "a[href*=\"zhihu.com/question/\"], a[href*=\"zhuanlan.zhihu.com/p/\"], a[href^=\"/question/\"]",
    "snippetSelectors": [".RichText", ".SearchItem-excerpt", ".RichContent-inner", ".ContentItem-excerpt"],
    "blockedPatterns": ["请输入验证码", "验证后继续", "登录后可查看"]
  },
  "read": {
    "mode": "generic",
    "readySelector": ".Question-mainColumn, .Post-content, article, main",
    "rootSelectors": [".Question-mainColumn", ".Post-content", ".Post-RichTextContainer", "article", "main"],
    "removeSelectors": ["script", "style", "nav", "footer", "iframe", "noscript", ".Modal-wrapper", ".signFlowModal", ".Question-sideColumn", ".CornerButtons"]
  }
}
```
