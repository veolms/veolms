# Theme Menu Design QA

## Source of truth

- Reference: supplied theme palette reference
- Implemented view: captured locally during design QA
- Reference dimensions: 1254 × 1254 px
- Implementation capture: 879 × 678 CSS px at 1.35 device-pixel ratio
- Captured state: `/explore-courses`, collapsed desktop sidebar, dark mode, Copper Slate selected, theme menu open

The reference is an isolated component render while the implementation capture includes the full application. Comparisons therefore use component proportions, hierarchy, material, and state treatment rather than raw whole-image pixel dimensions.

## Fidelity review

- Typography: The palette has no visible copy in the reference or implementation. Existing accessible labels and theme names remain intact.
- Spacing and layout: Preserved the 4 × 3 theme order. The implemented tray is 212 × 163 CSS px with a 20 px radius; each selected well is approximately 41 × 41 px and each key face approximately 30 × 30 px. Padding and grid rhythm match the reference's compact proportions.
- Color and tokens: Each key remains driven by its existing `--theme-swatch` token. The selected key's underside, recessed well, and glow derive from that same theme color. The tray uses the reference's warm charcoal material.
- Image and material: Added a real 512 × 512 WebP micro-grain texture at `apps/web/public/assets/theme-menu-grain.webp`; no placeholder imagery is used.
- Content: All 12 existing themes, accessible names, titles, and selection semantics are preserved.

## Interaction and runtime checks

- Pointer selection keeps the palette open.
- Arrow navigation remains reversible and follows the 4-column grid; ArrowRight and ArrowLeft were also exercised in the running app.
- Enter and Escape behavior remain covered by the focused Playwright flow.
- The focused Playwright test passed with the app fixture's console-error and page-error guards enabled.
- TypeScript typecheck and the production build passed.

## Comparison history

1. First pass: 3D lift, recessed wells, color depth, and active glow matched; the missing fine material grain was a P3 fidelity gap.
2. Fix: Generated and applied a subtle warm-charcoal micro-grain texture without changing component geometry or interaction behavior.
3. Final pass: No actionable P0, P1, or P2 visual differences remain.

## Final result

passed
