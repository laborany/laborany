# Widget Design Guidelines — Interactive

For calculators, forms, configurators, and interactive tools.

## Input Fields

```html
<div class="field">
  <label for="myInput">Label</label>
  <input type="number" id="myInput" placeholder="e.g. 1000" />
</div>
```

- Use `<label>` with `for` attribute for every input.
- Use appropriate `type`: `number`, `text`, `range`.
- Add `placeholder` with example values.
- Style inputs: full width, 10-12px padding, border with `var(--color-border)`, focus state with `var(--color-accent)`.

## Buttons

- Primary: `background: var(--color-accent)`, white text, full width for main actions.
- Hover: `opacity: 0.85`.
- Disabled: `opacity: 0.4; cursor: not-allowed`.

## Result Display

- Use a distinct result area with `var(--color-surface)` background.
- Large number display: 24-28px, font-weight 600, `var(--color-accent)`.
- Hide result area initially with `display: none`, show on calculation.

## Sliders / Range Inputs

```html
<input type="range" min="0" max="100" value="50" id="slider" />
<span id="sliderValue">50</span>
```

- Show current value next to the slider.
- Update display on `input` event (not just `change`).

## Sending Data Back

When the user completes an interaction (submits a form, makes a selection):

```js
window.sendToAgent({ type: 'result', principal: 10000, rate: 5, years: 10, total: 16288.95 });
```

Only send meaningful interaction data, not every keystroke.
