# Linear Design Guide for RSS News Aggregator

This document outlines the design principles and implementation details for the HTML report styling, inspired by Linear's minimalist aesthetic.

## Design Philosophy

Linear's design is characterized by:
- **Clarity**: Clean typography and generous whitespace
- **Simplicity**: Minimal visual elements, focus on content
- **Consistency**: Unified color palette and spacing system
- **Performance**: Lightweight, fast-loading interfaces

## Color Palette

### Light Mode
```css
--bg-primary: #f7f8f9      /* Main background (light gray) */
--bg-secondary: #ffffff     /* Card background (white) */
--text-primary: #16171a     /* Primary text (dark gray) */
--text-secondary: #6e7781   /* Secondary text (medium gray) */
--border-color: #e6e8eb     /* Borders (light gray) */
--accent-blue: #5e6ad2      /* Primary accent (blue) */
--accent-purple: #8b5cf6    /* Secondary accent (purple) */
```

### Dark Mode
```css
--bg-primary: #16171a       /* Main background (dark) */
--bg-secondary: #1f2023     /* Card background (slightly lighter) */
--text-primary: #e6e8eb     /* Primary text (light) */
--text-secondary: #9ca3af   /* Secondary text (medium) */
--border-color: #2d2f33     /* Borders (dark gray) */
```

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'SF Pro', sans-serif;
```

### Font Sizes
- **Heading 1**: 2.5rem (40px)
- **Heading 2**: 1.5rem (24px)
- **Card Title**: 1.1rem (17.6px)
- **Body**: 0.95rem (15.2px)
- **Meta**: 0.85rem (13.6px)
- **Badge**: 0.75rem (12px)

### Font Weights
- **Headings**: 600 (Semi-bold)
- **Body**: 400 (Regular)
- **Badge**: 600 (Semi-bold)

## Layout

### Grid System
```css
display: grid;
grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
gap: 1.5rem;
```

- **Responsive**: Automatically adjusts columns based on viewport width
- **Minimum card width**: 360px
- **Gap**: 1.5rem (24px) between cards

### Spacing
- **Container padding**: 2rem (32px) vertical, 1rem (16px) horizontal
- **Card padding**: 1.5rem (24px)
- **Section margin**: 3rem (48px) bottom
- **Element gaps**: 0.5rem - 1rem

## Card Design

### Structure
```
┌─────────────────────────────┐
│ [4px blue border on hover]  │
│                              │
│ Card Title (link)            │
│ Source | Time | Quality      │
│                              │
│ Summary text...              │
│                              │
└─────────────────────────────┘
```

### Visual Effects
- **Border**: 1px solid var(--border-color)
- **Border radius**: 8px
- **Shadow (default)**: 0 1px 3px rgba(0,0,0,0.08)
- **Shadow (hover)**: 0 4px 12px rgba(0,0,0,0.12)
- **Transform (hover)**: translateY(-2px)
- **Left border (hover)**: 4px blue accent, opacity transition

### Quality Badges

**High Quality (≥80)**:
- Light mode: `background: #dcfce7; color: #166534` (green)
- Dark mode: `background: #166534; color: #dcfce7`

**Medium Quality (60-79)**:
- Light mode: `background: #fef3c7; color: #92400e` (yellow)
- Dark mode: `background: #92400e; color: #fef3c7`

**Low Quality (<60)**:
- Light mode: `background: #fee2e2; color: #991b1b` (red)
- Dark mode: `background: #991b1b; color: #fee2e2`

## Interactions

### Hover States
- **Card**: Lift up 2px, increase shadow
- **Link**: Change color to accent blue
- **Left border**: Fade in from opacity 0 to 1

### Transitions
```css
transition: all 0.2s ease;
```

All interactive elements use smooth 200ms transitions.

## Responsive Design

### Breakpoints
- **Desktop**: > 768px (multi-column grid)
- **Mobile**: ≤ 768px (single column)

### Mobile Adjustments
```css
@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
  h1 {
    font-size: 2rem;
  }
}
```

## Dark Mode

Implemented using CSS custom properties and `prefers-color-scheme`:

```css
@media (prefers-color-scheme: dark) {
  :root {
    /* Override color variables */
  }
}
```

Automatically switches based on system preference, no JavaScript required.

## Accessibility

- **Semantic HTML**: Proper use of `<header>`, `<main>`, `<section>`, `<article>`
- **Link targets**: `target="_blank" rel="noopener"` for external links
- **Color contrast**: WCAG AA compliant (4.5:1 for normal text)
- **Focus states**: Inherit from browser defaults

## Performance

- **No external dependencies**: All styles inline
- **No JavaScript**: Pure CSS implementation
- **Optimized selectors**: Minimal specificity
- **Hardware acceleration**: Use of `transform` for animations

## Implementation Notes

1. **All styles must be inline**: No external CSS files
2. **Use CSS variables**: For easy theme switching
3. **Mobile-first**: Design for small screens, enhance for large
4. **Progressive enhancement**: Works without JavaScript
5. **Print-friendly**: Consider print styles if needed

## Example Card HTML

```html
<article class="card">
  <h3 class="card-title">
    <a href="..." target="_blank" rel="noopener">Article Title</a>
  </h3>
  <div class="card-meta">
    <span>🔗 source.com</span>
    <span>⏰ 2 hours ago</span>
    <span class="quality-badge quality-high">95/100</span>
  </div>
  <p class="card-summary">Article summary text...</p>
</article>
```

## References

- Linear Design System: https://linear.app
- Inter Font: https://rsms.me/inter/
- CSS Custom Properties: https://developer.mozilla.org/en-US/docs/Web/CSS/--*
