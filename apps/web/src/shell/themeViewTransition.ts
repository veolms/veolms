import "./theme-view-transition.css";

export type ThemeViewTransitionKind = "mode" | "palette";

// Pointer coordinates for the reveal circle. Callers pass one only when a
// specific interaction caused the change: pointer commits pass the pointer
// position, keyboard navigation passes the focused control's center, and
// OS-triggered commits pass nothing so the mask's corner fallbacks apply.
export interface ThemeRevealOrigin {
  x: number;
  y: number;
}

const revealOriginProperties = [
  "--theme-reveal-x",
  "--theme-reveal-y",
] as const;

// Overlapping transitions of the same kind share the tag value and can even
// stage identical reveal coordinates, so value comparisons can never prove
// which transition owns the root tag or the staged origin. Each transition
// instead claims a unique id; cleanup only clears what that id still owns.
let nextTransitionId = 0;
let taggedTransitionId: number | null = null;
let stagedOriginTransitionId: number | null = null;

// The center of an element's box, used as the reveal origin for keyboard
// navigation: the focused control is where the interaction happened. A
// zero-area rect (hidden or unmeasured element, e.g. in jsdom) yields no
// origin so the CSS corner fallback still applies.
export function themeRevealOriginFromElement(
  element: Element | null | undefined,
): ThemeRevealOrigin | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

// Keyboard activations (Enter/Space) and programmatic element.click() both
// dispatch click events at the viewport origin, so a non-zero coordinate is
// what proves the click came from an actual pointer. Pointer clicks reveal
// from the pointer position; keyboard and programmatic clicks reveal from
// the center of the control they activated. This keeps keyboard interactions
// attributed to the focused item instead of the last place the user clicked.
export function themeRevealOriginFromClick(event: {
  clientX: number;
  clientY: number;
  currentTarget?: EventTarget | null;
}): ThemeRevealOrigin | null {
  if (event.clientX !== 0 || event.clientY !== 0) {
    return { x: event.clientX, y: event.clientY };
  }
  return themeRevealOriginFromElement(
    event.currentTarget instanceof Element ? event.currentTarget : null,
  );
}

// Stages the reveal origin as inline custom properties on the root so the
// ::view-transition-new(root) mask inherits them. Claimed by every
// transition: one with an origin restages the coordinates, and one without
// removes any earlier pointer transition's coordinates so the mask's
// keyword fallbacks (corner origins) apply for OS-triggered changes.
function stageRevealOrigin(
  transitionId: number,
  origin: ThemeRevealOrigin | null,
): void {
  // The duration stays fixed: shortening it for center-ish clicks is what
  // made the reveal feel rushed there, while corner clicks felt smooth.
  const style = document.documentElement.style;
  if (origin) {
    style.setProperty("--theme-reveal-x", `${origin.x}px`);
    style.setProperty("--theme-reveal-y", `${origin.y}px`);
  } else {
    for (const property of revealOriginProperties) {
      style.removeProperty(property);
    }
  }
  stagedOriginTransitionId = transitionId;
}

function clearStagedRevealOrigin(transitionId: number): void {
  // A newer transition may have restaged its own origin already; only remove
  // the properties while this transition still owns them.
  if (stagedOriginTransitionId !== transitionId) return;
  const style = document.documentElement.style;
  for (const property of revealOriginProperties) {
    style.removeProperty(property);
  }
  stagedOriginTransitionId = null;
}

// Applies the committed palette to the root dataset so every CSS-driven
// palette surface swaps inside the caller's commit (view transition
// snapshot or effect sync). Lives here, outside component scope, because
// palette surfaces are owned by the shell theme layer.
export function applyRootPalette(palette: string): void {
  document.documentElement.dataset.palette = palette;
}

export function applyWithThemeViewTransition(
  commit: () => void,
  kind: ThemeViewTransitionKind = "mode",
  origin?: ThemeRevealOrigin,
): void {
  if (
    typeof document.startViewTransition !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    commit();
    return;
  }
  // Tag the root so the mask can pick its reveal corner; keep the tag until
  // the transition settles so the pseudo-element styles stay stable.
  const transitionId = nextTransitionId++;
  document.documentElement.dataset.themeTransition = kind;
  taggedTransitionId = transitionId;
  // Claim the staged origin in both cases: leaving a prior pointer
  // transition's coordinates staged would reveal this transition from that
  // pointer instead of the mask's corner fallback.
  stageRevealOrigin(transitionId, origin ?? null);
  const transition = document.startViewTransition(commit);
  const clear = () => {
    // A newer transition may have retagged the root or restaged the origin;
    // only clear what this transition still owns, by identity rather than by
    // value (same-kind overlaps can carry identical values).
    if (taggedTransitionId === transitionId) {
      delete document.documentElement.dataset.themeTransition;
      taggedTransitionId = null;
    }
    clearStagedRevealOrigin(transitionId);
  };
  transition.finished.then(clear, clear);
}
