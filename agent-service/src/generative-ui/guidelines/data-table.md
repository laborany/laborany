# Widget Design Guidelines — Data Table

For tabular data display with sorting and filtering.

## Table Structure

- Use semantic `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` elements.
- Set `width: 100%` and `border-collapse: collapse` on the table.
- Wrap in a `div` with `overflow-x: auto` for horizontal scroll on narrow viewports.

## Header Styling

- `<th>`: `text-align: left`, `padding: 10px 12px`, `font-size: 12px`, `font-weight: 600`.
- Color: `var(--color-text-muted)`, `text-transform: uppercase`, `letter-spacing: 0.05em`.
- Bottom border: `2px solid var(--color-border)`.

## Row Styling

- `<td>`: `padding: 10px 12px`, `font-size: 14px`, `border-bottom: 1px solid var(--color-border)`.
- Alternate row background: `nth-child(even)` with `var(--color-surface)`.
- Hover: `background: var(--color-surface)` (or slightly darker).

## Sorting

- Add clickable `<th>` headers with `cursor: pointer`.
- Show sort direction with arrow indicators: `▲` / `▼` appended to header text.
- Use `aria-sort="ascending"` or `aria-sort="descending"` on sorted column.
- Sort in JavaScript using `Array.prototype.sort()` and re-render the `<tbody>`.

## Filtering

- Place a text input above the table: `<input type="text" placeholder="Search...">`.
- Style: full width, `padding: 8px 12px`, `border: 1px solid var(--color-border)`, `border-radius: 8px`.
- Filter rows by checking if any cell content includes the search term (case-insensitive).
- Show a "No results" row when filter matches nothing.

## Numeric Columns

- Right-align numeric data: `text-align: right` on both `<th>` and `<td>`.
- Use `tabular-nums` font feature for aligned digits.
- Format large numbers with locale-appropriate separators.

## Empty State

- When the table has no data, show a centered message inside `<tbody>`.
- Use `colspan` spanning all columns, `text-align: center`, `padding: 24px`.
- Color: `var(--color-text-muted)`.
