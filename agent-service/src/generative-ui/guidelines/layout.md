# Widget Design Guidelines — Layout

Common layout patterns for widget composition.

## Flexbox Layouts

- Use `display: flex` with `gap: 12px` for horizontal arrangements.
- Use `flex-direction: column` for vertical stacking.
- Use `flex-wrap: wrap` for responsive grids that reflow.
- Center content: `justify-content: center; align-items: center`.

## Grid Layouts

- Use CSS Grid for two-dimensional layouts: `display: grid`.
- Common pattern: `grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))`.
- Gap: `gap: 16px` between grid items.
- For dashboard-style layouts, use named grid areas.

## Card Layouts

- Card container: `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: 8px`, `padding: 16px`.
- Card header: 14-16px font, `font-weight: 600`, `margin-bottom: 12px`.
- Card body: 14px font, `line-height: 1.5`.
- Card footer: `border-top: 1px solid var(--color-border)`, `padding-top: 12px`, `margin-top: 12px`.

## Responsive Patterns

- Max width 600px, centered with `margin: 0 auto`.
- Use percentage widths or `minmax()` for flexible sizing.
- Stack columns vertically on narrow viewports using `flex-wrap` or grid `auto-fit`.
- Avoid fixed pixel widths for content areas.

## Spacing System

- Tight: 4-8px (between related elements like label and input).
- Normal: 12-16px (between sections or cards).
- Loose: 20-24px (container padding, major section gaps).
- Use consistent spacing throughout a single widget.

## Scroll Containers

- Use `overflow-y: auto` for content that may exceed viewport.
- Set `max-height` on scrollable areas to prevent unbounded growth.
- Add subtle `border-top` / `border-bottom` on scroll containers for visual cue.
