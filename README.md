# Cup13

A KoLmafia relay override that replaces the three ingredient selectors on the **Cup of 13s** use page with a single sortable, filterable, searchable [Tabulator](https://tabulator.info/) table.

## Features

- **Search** across name, effect, Adv, and quantity.
- **Filter** by exact/at-least Adv, stat bonus, or Runneth effect — Runneth options are labeled with the actual effect (e.g. "Superhuman Cold Resistance (+5)") rather than just the buff name.
- **Sortable columns** (Name, Qty, Adv, Effect) with favorites always pinned to the top.
- **Favorites** (★ toggle per row), persisted in `localStorage`.
- **Slot picker**: choose which of the three original `<select>`s (slot 1/2/3) a double-click on a row should fill.
- Effect column is color-coded by stat/Runneth type, and shows Runneth effects by what they actually do instead of just their name.
- Original `<select>` elements are left in the DOM and kept in sync — the override is purely additive.

## Installation

git checkout MattiasKro/KoL-Cup13

