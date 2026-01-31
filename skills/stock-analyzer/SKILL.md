---
name: 股票分析助手
description: |
  股票综合分析与可视化工具。输入股票代码或名称，自动采集K线数据、技术指标、
  新闻资讯、财报信息，生成交易策略建议，并输出可视化HTML报告。

  触发场景：
  - 用户提供股票代码/名称要求分析（如 "分析AAPL" "看看茅台"）
  - 用户询问某只股票的买卖时机
  - 用户需要股票技术面/基本面综合报告
  - 用户要求生成股票分析可视化页面

  支持市场：美股(NYSE/NASDAQ)、A股(上交所/深交所)
icon: 📊
category: 金融
---

# Stock Analyzer

股票综合分析与可视化报告生成器。

## 工作流程

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT: 股票代码/名称                                            │
│         例: "AAPL", "苹果", "600519", "茅台"                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: 识别股票                                                │
│  ├─ 解析输入，确定股票代码和市场                                   │
│  ├─ 美股: 直接使用代码 (AAPL, MSFT, GOOGL)                       │
│  └─ A股: 补全代码 (茅台 → 600519.SS)                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: K线数据采集 (核心步骤)                                   │
│  ├─ [WebFetch] 从金融数据API获取历史OHLCV数据                     │
│  ├─ 数据周期: 日K线，默认获取60-120个交易日                        │
│  └─ 数据字段: 日期/开盘/最高/最低/收盘/成交量                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: 技术指标计算 (基于K线原始数据)                           │
│  ├─ 均线系统: MA5 / MA10 / MA20 / MA60                          │
│  ├─ MACD指标: DIF / DEA / MACD柱状图                            │
│  ├─ RSI指标: RSI6 / RSI12 / RSI24                               │
│  ├─ KDJ指标: K值 / D值 / J值                                    │
│  └─ 布林带: 上轨 / 中轨 / 下轨                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 4: 辅助数据采集 (并行执行)                                  │
│  ├─ [WebSearch] 搜索近期新闻和市场情绪                            │
│  ├─ [WebSearch] 搜索财报数据和分析师评级                          │
│  └─ [WebSearch] 搜索行业动态和政策影响                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 5: 智能分析                                                │
│  ├─ 技术面: 基于计算出的指标进行趋势研判                          │
│  ├─ 基本面: PE/PB/ROE/营收增长 估值分析                           │
│  ├─ 消息面: 新闻情绪/行业动态/政策影响                            │
│  └─ 综合: 多维度交叉验证，生成交易建议                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  STEP 6: 生成可视化报告                                          │
│  ├─ 使用 assets/template.html 作为基础模板                       │
│  ├─ 填充数据: K线图/MACD图/RSI图/KDJ图/成交量图                  │
│  └─ 输出: {股票代码}_analysis.html                               │
└─────────────────────────────────────────────────────────────────┘
```

## 执行指南

### Step 1: 识别股票

根据用户输入识别目标股票：

| 输入类型 | 示例 | 处理方式 |
|---------|------|---------|
| 美股代码 | AAPL, MSFT | 直接使用 |
| 美股名称 | 苹果, 微软 | WebSearch 查询对应代码 |
| A股代码 | 600519, 000858 | 补充后缀 (.SS 上交所 / .SZ 深交所) |
| A股名称 | 茅台, 五粮液 | WebSearch 查询对应代码 |

### Step 2: K线数据采集

**这是核心步骤**，需要获取真实的历史K线数据用于后续技术指标计算。

#### 数据源选择

| 市场 | 推荐数据源 | API示例 |
|-----|-----------|---------|
| 美股 | Yahoo Finance | `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=6mo` |
| 美股 | Alpha Vantage | `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={symbol}` |
| A股 | 新浪财经 | `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol={symbol}&scale=240&ma=no&datalen=120` |
| A股 | 东方财富 | 通过 WebSearch 搜索 "{股票代码} 历史K线数据" |

#### 使用 WebFetch 获取数据

```
# 美股示例 (Yahoo Finance)
WebFetch URL: https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=3mo
Prompt: 提取JSON中的K线数据，返回格式化的OHLCV数组

# A股示例 (新浪财经)
WebFetch URL: https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=sh600519&scale=240&ma=no&datalen=120
Prompt: 提取K线数据数组，包含日期、开盘、最高、最低、收盘、成交量
```

#### K线数据结构

采集后的数据应整理为以下结构：

```javascript
const klineData = {
    dates: ["2024-01-02", "2024-01-03", ...],     // 日期数组
    open: [185.50, 186.20, ...],                   // 开盘价数组
    high: [187.30, 188.10, ...],                   // 最高价数组
    low: [184.80, 185.50, ...],                    // 最低价数组
    close: [186.80, 187.50, ...],                  // 收盘价数组
    volume: [52340000, 48920000, ...]              // 成交量数组
};
```

### Step 3: 技术指标计算

基于采集的K线原始数据，计算以下技术指标。参考 [references/technical-indicators.md](references/technical-indicators.md) 获取详细公式。

#### 3.1 移动平均线 (MA)

```javascript
// MA计算公式: MA(N) = SUM(Close, N) / N
function calculateMA(closes, period) {
    const result = [];
    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            result.push(null);
        } else {
            const sum = closes.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
            result.push(+(sum / period).toFixed(2));
        }
    }
    return result;
}

// 计算各周期均线
const ma5 = calculateMA(closes, 5);
const ma10 = calculateMA(closes, 10);
const ma20 = calculateMA(closes, 20);
const ma60 = calculateMA(closes, 60);
```

#### 3.2 MACD 指标

```javascript
// EMA计算
function calculateEMA(data, period) {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
        result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
}

// MACD计算
function calculateMACD(closes) {
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const dif = ema12.map((v, i) => +(v - ema26[i]).toFixed(4));
    const dea = calculateEMA(dif, 9);
    const macd = dif.map((v, i) => +((v - dea[i]) * 2).toFixed(4));
    return { dif, dea, macd };
}
```

#### 3.3 RSI 指标

```javascript
function calculateRSI(closes, period = 14) {
    const changes = [];
    for (let i = 1; i < closes.length; i++) {
        changes.push(closes[i] - closes[i - 1]);
    }

    const result = [null];
    for (let i = period; i <= changes.length; i++) {
        const slice = changes.slice(i - period, i);
        const gains = slice.filter(x => x > 0).reduce((a, b) => a + b, 0);
        const losses = Math.abs(slice.filter(x => x < 0).reduce((a, b) => a + b, 0));
        const rs = losses === 0 ? 100 : gains / losses;
        result.push(+(100 - 100 / (1 + rs)).toFixed(2));
    }

    // 填充前面的null
    while (result.length < closes.length) {
        result.unshift(null);
    }
    return result;
}

const rsi6 = calculateRSI(closes, 6);
const rsi12 = calculateRSI(closes, 12);
const rsi24 = calculateRSI(closes, 24);
```

#### 3.4 KDJ 指标

```javascript
function calculateKDJ(highs, lows, closes, period = 9) {
    const k = [], d = [], j = [];

    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            k.push(50); d.push(50); j.push(50);
            continue;
        }

        const highSlice = highs.slice(i - period + 1, i + 1);
        const lowSlice = lows.slice(i - period + 1, i + 1);
        const hh = Math.max(...highSlice);
        const ll = Math.min(...lowSlice);

        const rsv = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
        const kVal = i === period - 1 ? rsv : (2/3) * k[i-1] + (1/3) * rsv;
        const dVal = i === period - 1 ? kVal : (2/3) * d[i-1] + (1/3) * kVal;
        const jVal = 3 * kVal - 2 * dVal;

        k.push(+kVal.toFixed(2));
        d.push(+dVal.toFixed(2));
        j.push(+jVal.toFixed(2));
    }
    return { k, d, j };
}
```

#### 3.5 布林带 (BOLL)

```javascript
function calculateBOLL(closes, period = 20, multiplier = 2) {
    const middle = calculateMA(closes, period);
    const upper = [], lower = [];

    for (let i = 0; i < closes.length; i++) {
        if (i < period - 1) {
            upper.push(null); lower.push(null);
            continue;
        }

        const slice = closes.slice(i - period + 1, i + 1);
        const mean = middle[i];
        const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
        const std = Math.sqrt(variance);

        upper.push(+(mean + multiplier * std).toFixed(2));
        lower.push(+(mean - multiplier * std).toFixed(2));
    }
    return { upper, middle, lower };
}
```

### Step 4: 辅助数据采集

使用 WebSearch 工具并行采集辅助数据：

```
# 新闻资讯
"{股票代码} latest news {当前年份}"
"{股票名称} 最新消息 {当前年份}"

# 财报分析
"{股票代码} earnings report analysis {当前年份}"
"{股票代码} 财报 业绩 分析"

# 行业动态
"{股票代码} industry analysis {当前年份}"
"{行业名称} 政策 监管 {当前年份}"
```

### Step 5: 智能分析

基于K线数据计算的技术指标和采集的辅助数据，进行多维度分析：

#### 5.1 技术面分析

根据计算出的指标进行趋势研判：

| 指标 | 多头信号 | 空头信号 |
|-----|---------|---------|
| MA排列 | MA5 > MA10 > MA20 > MA60 | MA5 < MA10 < MA20 < MA60 |
| MACD | DIF上穿DEA (金叉) | DIF下穿DEA (死叉) |
| RSI | RSI < 30 (超卖反弹) | RSI > 70 (超买回调) |
| KDJ | K上穿D且J < 20 | K下穿D且J > 80 |
| BOLL | 价格触及下轨反弹 | 价格触及上��回落 |

**信号强度判断**：
- 强信号：3个以上指标同向
- 中等信号：2个指标同向
- 弱信号：仅1个指标

#### 5.2 基本面分析

- 估值指标：PE/PB 与行业对比
- 成长性：营收/利润增长率
- 盈利能力：ROE/毛利率/净利率

#### 5.3 消息面分析

- 新闻情绪：正面/负面/中性
- 行业动态：竞争格局变化
- 政策影响：监管/宏观政策

#### 5.4 综合建议

- 短期策略（1-2周）
- 中期策略（1-3月）
- 风险提示

### Step 6: 生成可视化报告

#### 6.1 CHART_DATA 数据结构

生成报告时，需要构建完整的图表数据对象：

```javascript
const chartData = {
    // ═══════════════════════════════════════════════════════════════
    // 基础K线数据
    // ═══════════════════════════════════════════════════════════════
    dates: ["2024-01-02", "2024-01-03", ...],

    // K线数据: [开盘, 收盘, 最低, 最高] (ECharts candlestick格式)
    kline: [
        [185.50, 186.80, 184.80, 187.30],
        [186.20, 187.50, 185.50, 188.10],
        // ...
    ],

    // 成交量
    volume: [52340000, 48920000, ...],

    // ═══════════════════════════════════════════════════════════════
    // 均线数据
    // ═══════════════════════════════════════════════════════════════
    ma5: [null, null, null, null, 186.20, 186.80, ...],
    ma10: [null, null, null, null, null, null, null, null, null, 185.90, ...],
    ma20: [...],
    ma60: [...],

    // ═══════════════════════════════════════════════════════════════
    // MACD指标
    // ═══════════════════════════════════════════════════════════════
    dif: [0, 0.12, 0.25, 0.38, ...],
    dea: [0, 0.02, 0.07, 0.13, ...],
    macd: [0, 0.20, 0.36, 0.50, ...],

    // ═══════════════════════════════════════════════════════════════
    // RSI指标
    // ═══════════════════════════════════════════════════════════════
    rsi6: [null, null, null, null, null, 55.32, 58.21, ...],
    rsi12: [...],
    rsi24: [...],

    // ═══════════════════════════════════════════════════════════════
    // KDJ指标
    // ═══════════════════════════════════════════════════════════════
    k: [50, 50, 50, 50, 50, 50, 50, 50, 52.30, 55.80, ...],
    d: [50, 50, 50, 50, 50, 50, 50, 50, 51.10, 52.67, ...],
    j: [50, 50, 50, 50, 50, 50, 50, 50, 54.70, 62.06, ...],

    // ═══════════════════════════════════════════════════════════════
    // 布林带
    // ═══════════════════════════════════════════════════════════════
    bollUpper: [null, ..., 192.50, 193.20, ...],
    bollMiddle: [null, ..., 186.80, 187.10, ...],
    bollLower: [null, ..., 181.10, 181.00, ...]
};
```

#### 6.2 模板占位符

| 占位符 | 说明 | 示例值 |
|-------|------|-------|
| `{{STOCK_CODE}}` | 股票代码 | AAPL |
| `{{STOCK_NAME}}` | 股票名称 | 苹果公司 |
| `{{CURRENT_PRICE}}` | 当前价格 | $187.50 |
| `{{PRICE_CHANGE}}` | 涨跌幅 | +2.35% |
| `{{PRICE_DIRECTION}}` | 涨跌方向CSS类 | price-up / price-down |
| `{{ANALYSIS_DATE}}` | 分析日期 | 2024-01-15 |
| `{{TECHNICAL_INDICATORS}}` | 技术指标HTML | 见下方示例 |
| `{{FUNDAMENTAL_INDICATORS}}` | 基本面指标HTML | 见下方示例 |
| `{{NEWS_LIST}}` | 新闻列表HTML | 见下方示例 |
| `{{SHORT_TERM_STRATEGY}}` | 短期策略文本 | 建议持有观望... |
| `{{MID_TERM_STRATEGY}}` | 中期策略文本 | 可逢低布局... |
| `{{RISK_WARNING}}` | 风险提示文本 | 注意市场波动... |
| `{{COMPREHENSIVE_ANALYSIS}}` | 综合分析文本 | 技术面显示... |
| `{{CHART_DATA}}` | 图表JSON数据 | 见上方结构 |

#### 6.3 指标HTML模板

```html
<!-- 技术指标项模板 -->
<div class="indicator-item">
    <div class="indicator-label">MA趋势</div>
    <div class="indicator-value signal-bullish">多头排列</div>
</div>
<div class="indicator-item">
    <div class="indicator-label">MACD</div>
    <div class="indicator-value signal-bullish">金叉 (DIF: 0.85)</div>
</div>
<div class="indicator-item">
    <div class="indicator-label">RSI(14)</div>
    <div class="indicator-value signal-neutral">55.32 (中性)</div>
</div>
<div class="indicator-item">
    <div class="indicator-label">KDJ</div>
    <div class="indicator-value signal-bearish">K:78 D:72 J:90</div>
</div>
```

#### 6.4 输出文件

保存为 `{股票代码}_analysis.html`，例如：`AAPL_analysis.html`

## 输出示例

生成的 HTML 报告包含：

1. **头部概览** - 股票名称、代码、当前价格、涨跌幅
2. **K线图表** - 交互式K线图 + MA均线叠加
3. **MACD图表** - DIF/DEA曲线 + MACD柱状图
4. **技术指标面板** - MA趋势/MACD/RSI/KDJ 信号状态
5. **基本面指标** - PE/PB/ROE等关键财务指标
6. **新闻时间线** - 近期重要新闻列表
7. **策略建议卡片** - 短期/中期操作建议 + 风险提示

## 注意事项

- 所有分析仅供参考，不构成投资建议
- K线数据来源于公开API，可能存在延迟
- 技术指标计算基于历史数据，不代表未来走势
- 建议结合其他专业工具交叉验证

