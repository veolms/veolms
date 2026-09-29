# Web CSS structure

- `styles.css` is the shared entry for Tailwind v4, resets, theme contracts,
  reading mode, and browser-wide accessibility and scrollbar behavior.
- `shell-theme.css` is linked by the academy layout. It contains the academy
  shell, navigation, shared controls, and course catalogue styling.
- Route and lazy component styles are imported by their owning modules so the
  browser fetches them when that route or feature is rendered. The learning
  player styles are grouped in `learning/learning-feature.css` to retain their
  package, player, and workspace cascade order.
- The first document request links only the active palette's dark and light
  sheets. The palette catalog is fetched when the user opens palette selection
  so previews and changes remain immediate after the picker is opened.
Tailwind remains the shared utility layer and is compiled by Tailwind v4 from
Tailwind-first; custom CSS belongs with the route or component that needs it.
Keep theme contracts, preference-driven global behavior, and the established
cascade order in their shared entries.
