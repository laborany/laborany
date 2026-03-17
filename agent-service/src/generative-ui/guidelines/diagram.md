# Widget Design Guidelines — Diagram

For flowcharts, state diagrams, tree structures, and process visualizations.

## Approach

Use inline SVG for all diagrams. No external libraries.

## Flowchart Pattern

```html
<svg viewBox="0 0 500 400" style="width:100%;max-width:500px">
  <!-- Node -->
  <rect x="180" y="20" width="140" height="44" rx="8"
    fill="var(--color-surface, #fff)" stroke="var(--color-border, #ddd)" />
  <text x="250" y="47" text-anchor="middle" font-size="13"
    fill="var(--color-text, #333)">Start</text>

  <!-- Arrow -->
  <line x1="250" y1="64" x2="250" y2="100"
    stroke="var(--color-text-muted, #999)" stroke-width="1.5"
    marker-end="url(#arrow)" />

  <!-- Arrow marker definition -->
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
      markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-text-muted, #999)" />
    </marker>
  </defs>
</svg>
```

## Node Styles

- Rectangle nodes: `rx="8"`, fill `var(--color-surface)`, stroke `var(--color-border)`.
- Decision diamonds: use `<polygon>` or rotated `<rect>`.
- Start/End nodes: use `rx="22"` for pill shape.
- Highlighted nodes: fill `var(--color-accent)` with white text.

## Arrows

- Use `<line>` or `<path>` with `marker-end`.
- Stroke: `var(--color-text-muted)`, width 1.5px.
- For curved arrows, use `<path>` with cubic bezier.

## Labels

- Node text: 13px, centered with `text-anchor="middle"`.
- Arrow labels: 11px, `var(--color-text-muted)`, positioned at midpoint.

## Layout Tips

- Vertical flow (top to bottom) is default.
- Space nodes 60-80px apart vertically.
- Center the diagram in the viewBox.
- Keep viewBox proportional to content.
