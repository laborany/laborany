---
domain: mp.weixin.qq.com
aliases: [微信公众号, 公众号, WeChat Official, wechat article]
access_strategy: cdp_only
verified_at: 2026-03-24
evidence_count: 8
---

## 平台特征
- 文章页面动态渲染，静态请求只能获取页面框架，正文内容通过 JS 异步加载
- 严格防盗链机制：图片资源带有 Referer 校验，直接下载会返回防盗链占位图
- 临时链接机制：公众号文章 URL 中包含时效性参数，过期链接可能无法访问
- 文章内容加载依赖微信自有的 JS SDK

## 有效模式
- 文章阅读：在 CDP 中直接打开文章链接，等待 JS 渲染完成后提取正文
- 正文提取：内容在 #js_content 容器中，等待该元素渲染完成后获取 innerHTML
- 图片提取：从 DOM 中获取 data-src 属性（非 src），带上正确 Referer 下载
- 搜索公众号文章：通过搜狗微信搜索 (weixin.sogou.com) 或 Google site:mp.weixin.qq.com

## 已知陷阱
- [2026-03] 静态 HTTP 请求只能获取空壳 HTML，正文内容完全缺失
- [2026-03] 图片使用 data-src 懒加载，src 属性可能是占位图地址
- [2026-03] 部分老文章链接已失效，访问时会显示"该内容已被发布者删除"
- [2026-03] 公众号后台管理页面需要微信扫码登录，无法通过浏览器登录态直接访问

## 自动化配置
```json
{
  "read": {
    "mode": "generic",
    "readySelector": "#js_content",
    "rootSelectors": ["#js_content"],
    "removeSelectors": ["script", "style", "noscript", "#js_pc_qr_code", ".qr_code_pc_outer", ".rich_media_tool", ".reward_area", "#js_toobar3", ".original_area_primary", "footer"]
  }
}
```
