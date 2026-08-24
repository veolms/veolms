# Web CSS structure

`full-app.css` remains the single application stylesheet. It imports
`styles.css`, then `shell-theme.css`, then reading-mode CSS in the same
cascade order used before the modular split.

- `base/` contains global tokens, resets, and shared controls.
- `features/` contains page- and feature-owned rules.
- `shell/` contains navigation, shell controls, cards, and responsive shell rules.
- `themes/dark/` and `themes/light/` contain one CSS file per palette.
- `themes/contracts.css` and `themes/accent-contract.css` contain behavior shared
  by multiple palettes.
- `global/` contains app-wide behavior that must remain late in the cascade.

The existing modules are intentionally assembled into one application stylesheet
for now. Do not reorder those entrypoints without visual-regression coverage:
the current UI relies on the established cascade.

New work is Tailwind-first and feature-owned. Add exceptional CSS only when
Tailwind cannot express the required browser behavior, keep it beside its
component or feature, import it from that owner, and document the browser
constraint. Global CSS is reserved for resets, theme tokens, and shared browser
workarounds; existing global rules are legacy code and should be moved only as
part of a focused, visually verified migration.
