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
const activeThemeViewTransitions = new Set<ViewTransition>();

// Opening the appearance palette during a reveal must show the newly mounted
// menu immediately. Finishing active snapshots exposes that live UI without
// making the user wait for the reveal animation to end.
export function skipActiveThemeViewTransitions(): void {
  for (const transition of activeThemeViewTransitions) {
    try {
      transition.skipTransition();
    } catch {
      // A transition can finish between the call site and this loop.
    }
  }
}

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

// Called when a reveal starts drawing the new page (its `ready`, or its end
// when it is skipped before that).
const revealStartListeners = new Set<(kind: ThemeViewTransitionKind) => void>();

/**
 * Calls `listener` each time a reveal starts drawing. The page is not drawn
 * at all between a change and this moment (the browser holds it while it
 * captures the old and the new page), so motion meant to be seen with the
 * change starts here: started at the press, its first part played unseen
 * and it jumped (on a phone, most of the light/dark switch's slide).
 */
export function onThemeRevealStart(
  listener: (kind: ThemeViewTransitionKind) => void,
): () => void {
  revealStartListeners.add(listener);
  return () => {
    revealStartListeners.delete(listener);
  };
}

/** Whether a change of theme is revealed (and so waits for its start). */
export function themeRevealAvailable(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function applyWithThemeViewTransition(
  commit: () => void,
  kind: ThemeViewTransitionKind = "mode",
  origin?: ThemeRevealOrigin,
): ViewTransition | null {
  if (!themeRevealAvailable()) {
    commit();
    return null;
  }
  const transitionId = nextTransitionId++;
  // The tag and the origin are set in the update, after the old page has
  // been captured, together with the change itself. Both are on the root
  // (the tag also stops every other transition on the page), so set before
  // the capture they made the browser restyle the whole page once more
  // first: about 50ms of a frozen screen on a lesson page between the click
  // and the reveal. Neither changes how the old page looks.
  const transition = document.startViewTransition(() => {
    // Tag the root so the mask can pick its reveal corner; keep the tag
    // until the transition settles so the pseudo-element styles stay
    // stable.
    document.documentElement.dataset.themeTransition = kind;
    taggedTransitionId = transitionId;
    // Claim the staged origin in both cases: leaving a prior pointer
    // transition's coordinates staged would reveal this transition from
    // that pointer instead of the mask's corner fallback.
    stageRevealOrigin(transitionId, origin ?? null);
    commit();
  });
  activeThemeViewTransitions.add(transition);
  const clear = () => {
    // A newer transition may have retagged the root or restaged the origin;
    // only clear what this transition still owns, by identity rather than by
    // value (same-kind overlaps can carry identical values).
    if (taggedTransitionId === transitionId) {
      delete document.documentElement.dataset.themeTransition;
      taggedTransitionId = null;
    }
    clearStagedRevealOrigin(transitionId);
    activeThemeViewTransitions.delete(transition);
  };
  transition.finished.then(clear, clear);
  const started = () => {
    for (const listener of [...revealStartListeners]) listener(kind);
  };
  transition.ready.then(started, started);
  return transition;
}
