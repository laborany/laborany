# Widget Design Guidelines — Chart

For bar charts, line charts, pie charts, and data visualizations.

## Approach

Use inline SVG or Canvas API. No external charting libraries.

## SVG Charts

Preferred for simple bar/pie/line charts.

### Bar Chart Pattern

```html
<svg viewBox="0 0 400 250" style="width:100%;max-width:400px">
  <!-- Y axis -->
  <line x1="50" y1="20" x2="50" y2="220" stroke="var(--color-border, #ddd)" />
  <!-- X axis -->
  <line x1="50" y1="220" x2="380" y2="220" stroke="var(--color-border, #ddd)" />
  <!-- Bars -->
  <rect x="70" y="80" width="40" height="140" fill="var(--color-accent, #7c3aed)" rx="4" />
  <!-- Labels -->
  <text x="90" y="238" text-anchor="middle" font-size="12" fill="var(--color-text-muted, #666)">Jan</text>
</svg>
```

### Pie Chart Pattern

Use `<circle>` with `stroke-dasharray` and `stroke-dashoffset` for segments.

## Canvas Charts

Use for complex or animated charts.

```js
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
// Set canvas size for retina
canvas.width = canvas.offsetWidth * 2;
canvas.height = canvas.offsetHeight * 2;
ctx.scale(2, 2);
```

## Data Labels

- Always label axes.
- Show values on hover or directly on bars/points.
- Use `var(--color-text-muted)` for axis labels.
- Use `var(--color-text)` for data values.

## Colors for Multiple Series

Use opacity variants of accent:
- Series 1: `var(--color-accent)`
- Series 2: `var(--color-accent)` with `opacity: 0.6`
- Series 3: `var(--color-accent)` with `opacity: 0.3`

Or use semantic colors: `var(--color-success)`, `var(--color-warning)`, `var(--color-danger)`.
