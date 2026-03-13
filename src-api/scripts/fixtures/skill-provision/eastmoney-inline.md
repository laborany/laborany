请为我安装如下skill：

## name:

==eastmoney_financial_search (东方财富资讯搜索skill)==

## description:

本 skill 基于东方财富妙想搜索能力，基于金融场景进行信源智能筛选，用于获取涉及时效性信息或特定事件信息的任务，包括新闻、公告、研报、政策、交易规则、具体事件、各种影响分析，以及需要检索外部数据的非常识信息等。

# 东方财富资讯搜索 skill (eastmoney_financial_search)

根据用户问句搜索相关金融资讯，获取与问句相关的资讯信息，并返回可读文本。

## 使用方式

1. 需要用户在东方财富 Skills 页面获取 apikey。
2. 将 apikey 存到环境变量，命名为 `EASTMONEY_APIKEY`。
3. 使用 post 请求如下接口，务必使用 post 请求。

```bash
curl -X POST --location 'https://mkapi2.dfcfs.com/finskillshub/api/claw/news-search' \
--header 'Content-Type: application/json' \
--header 'apikey:demo_key' \
--data '{"query":"立讯精密的资讯"}'
```

## 返回说明

| 字段路径 | 简短释义 |
| --- | --- |
| `title` | 信息标题 |
| `secuList` | 关联证券列表 |
| `trunk` | 信息核心正文 |
