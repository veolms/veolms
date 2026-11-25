import type { SystemBarColors } from "../native-bridge";
import { lookAhead, type LayerAhead } from "./layerLookahead";

/**
 * The colours of the page right next to the phone's status bar (top edge) and
 * navigation bar (bottom edge), read from what the browser has computed. It
 * holds no theme or palette colours of its own, so every theme, palette and
 * light/dark mode, including ones added later, is covered as it is drawn.
 *
 * At each edge it looks at the boxes drawn at one point and keeps those that
 * span the whole width, the way a bar does, and that stay where they are
 * while the page scrolls:
 *
 * 1. fixed or sticky layers (the bottom tab bar, a sheet, a dialog's
 *    dimming backdrop);
 * 2. page surfaces that fill the whole screen;
 * 3. boxes outside any scrolling area (a lesson's video player).
 *
 * Content scrolling past (cards, sections, a hero image) is left out, so
 * scrolling never changes a colour. While a dialog is open the page behind it
 * is inert, which the browser's hit testing skips, so that page is found by
 * walking its boxes instead; the dialog's backdrop then dims it as drawn.
 *
 * Translucent boxes are blended over the boxes below them, as drawn without
 * their blur. Native bars are opaque, so the result is opaque `#rrggbb`, or
 * `null` (the app's default) when nothing could be read.
 *
 * While a layer slides towards or away from an edge without covering it (a
 * bottom sheet on its way in or out), that edge keeps `current`'s colour:
 * reads cannot tell exactly when the sheet reaches the edge on screen, and a
 * colour from between (the tab bar under the dimming backdrop) would show as
 * a blink. Once the slide stops, the edge is read again.
 */
export function readSystemBarColors(
  current?: SystemBarColors | null,
): SystemBarColors {
  const x = Math.floor(window.innerWidth / 2);
  const bottom = window.innerHeight - 1;
  // Fades and slides under way, as they will be when the colours show.
  const ahead = lookAhead(fixedLayerAnimations());
  return {
    statusBar:
      current && slidingOutside(ahead, x, 0)
        ? (current.statusBar ?? null)
        : colorAt(x, 0, ahead),
    navigationBar:
      current && slidingOutside(ahead, x, bottom)
        ? (current.navigationBar ?? null)
        : colorAt(x, bottom, ahead),
  };
}

/** Each sliding layer's position at the previous read, to tell its direction. */
const lastSlidePositions = new WeakMap<Element, DOMRect>();

/**
 * Whether a sliding layer is coming towards this edge from off screen, not
 * covering the point yet (a sheet on its way in). One leaving (a closing
 * sheet past the edge) does not hold: the edge then takes what is under it at
 * once, a single step.
 */
function slidingOutside(ahead: Ahead, x: number, y: number): boolean {
  let holding = false;
  for (const [layer, future] of ahead) {
    if (!future.sliding) continue;
    const rect = layer.getBoundingClientRect();
    const last = lastSlidePositions.get(layer);
    if (y > 0) lastSlidePositions.set(layer, rect);
    if (contains(rect, x, y)) continue;
    if (y > 0 && rect.top >= y) {
      // Below the bottom edge: coming in unless it moved down since.
      if (!last || rect.top <= last.top) holding = true;
    } else if (y === 0 && rect.bottom <= 0) {
      // Above the top edge: coming in unless it moved up since.
      if (!last || rect.bottom >= last.bottom) holding = true;
    }
  }
  return holding;
}

type Rgba = readonly [red: number, green: number, blue: number, alpha: number];

type Ahead = Map<Element, LayerAhead>;

function colorAt(x: number, y: number, ahead: Ahead): string | null {
  const layers: Rgba[] = [];
  for (const layer of drawnAt(x, y, ahead)) {
    const color =
      layer instanceof Backdrop
        ? backdropOf(layer.dialog)
        : isBarSurface(layer, ahead)
          ? backgroundOf(layer, ahead)
          : null;
    if (!color) continue;
    layers.push(color);
    if (color[3] === 1) break;
  }
  const opaque = layers.at(-1);
  if (!opaque || opaque[3] !== 1) return null;
  let [red, green, blue] = opaque;
  for (let index = layers.length - 2; index >= 0; index -= 1) {
    const [r, g, b, alpha] = layers[index]!;
    red = r * alpha + red * (1 - alpha);
    green = g * alpha + green * (1 - alpha);
    blue = b * alpha + blue * (1 - alpha);
  }
  return toHex(red, green, blue);
}

/**
 * The `::backdrop` of a box in the top layer (a modal `<dialog>` or an open
 * popover), which hit testing does not return.
 */
class Backdrop {
  constructor(dialog: Element) {
    this.dialog = dialog;
  }
  readonly dialog: Element;
}

/**
 * What is drawn at a point, top-most first: the browser's hit test, with the
 * backdrop of each top-layer dialog below the dialog's own boxes, and the
 * boxes of inert parts of the page (behind an open dialog) put back in above
 * the body.
 *
 * While a view transition runs (the theme reveal), its overlay covers the
 * page and the hit test finds only the root, so the page's boxes are walked
 * instead: the page under the overlay already has its new colours.
 */
function drawnAt(x: number, y: number, ahead: Ahead): (Element | Backdrop)[] {
  const tested = document.elementsFromPoint(x, y);
  if (
    tested.every(
      (element) =>
        element === document.body || element === document.documentElement,
    )
  ) {
    return withBackdrops([
      ...boxesAt(document.body, x, y, true),
      document.documentElement,
    ]);
  }
  const hits: (Element | Backdrop)[] = withBackdrops(
    withMovingLayers(tested, x, y, ahead),
  );
  const inertRoots = [...document.querySelectorAll("[inert]")].filter(
    (element) =>
      !element.parentElement?.closest("[inert]") &&
      !hits.includes(element) &&
      contains(element.getBoundingClientRect(), x, y),
  );
  if (inertRoots.length === 0) return hits;
  const behind = inertRoots.flatMap((root) => boxesAt(root, x, y));
  const below = hits.findIndex(
    (element) =>
      element === document.body || element === document.documentElement,
  );
  const at = below === -1 ? hits.length : below;
  return [...hits.slice(0, at), ...behind, ...hits.slice(at)];
}

/**
 * Puts back fixed layers that are fading or sliding and cover the point but
 * that the hit test skips: a closing sheet's backdrop stops taking pointer
 * events at once while it is still drawn fading out.
 */
function withMovingLayers(
  hits: Element[],
  x: number,
  y: number,
  ahead: Ahead,
): Element[] {
  let layers = hits;
  for (const layer of ahead.keys()) {
    if (
      !layers.includes(layer) &&
      contains(layer.getBoundingClientRect(), x, y)
    ) {
      layers = placeLayer(layers, layer);
    }
  }
  return layers;
}

/** Puts a layer into a top-most-first list where it paints. */
function placeLayer(layers: Element[], layer: Element): Element[] {
  const level = stackLevel(layer);
  // Above every box that stacks lower, and above boxes of the same level
  // that come before it in the page or contain it (it paints over those).
  const at = layers.findIndex((element) => {
    const other = stackLevel(element);
    return (
      other < level ||
      (other === level &&
        (element.compareDocumentPosition(layer) &
          (Node.DOCUMENT_POSITION_FOLLOWING |
            Node.DOCUMENT_POSITION_CONTAINED_BY)) !==
          0)
    );
  });
  const placed = [...layers];
  placed.splice(at === -1 ? placed.length : at, 0, layer);
  return placed;
}

/** Puts each top-layer dialog's backdrop right below its own boxes (the dialogs above all else). */
function withBackdrops(hits: Element[]): (Element | Backdrop)[] {
  const dialogs = [...document.querySelectorAll("dialog, [popover]")].filter(
    (dialog) => matches(dialog, ":modal") || matches(dialog, ":popover-open"),
  );
  if (dialogs.length === 0) return hits;
  // The last opened is on top; its boxes and backdrop come first.
  const layers: (Element | Backdrop)[] = [];
  for (const dialog of dialogs.reverse()) {
    layers.push(...hits.filter((element) => dialog.contains(element)));
    layers.push(new Backdrop(dialog));
  }
  layers.push(
    ...hits.filter((element) => !dialogs.some((d) => d.contains(element))),
  );
  return layers;
}

/** `element.matches`, false where the browser does not know the selector. */
function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

/**
 * The boxes under `root` that contain the point, top-most first, by an
 * approximation of paint order: the top layer (open dialogs and popovers)
 * first, then by the z-index of the outermost positioned box around each,
 * fixed and sticky layers above the rest, and later boxes above earlier ones.
 */
function boxesAt(
  root: Element,
  x: number,
  y: number,
  whole = false,
): Element[] {
  const found: Element[] = [];
  const visit = (element: Element) => {
    found.push(element);
    for (const child of element.children) {
      const rect = child.getBoundingClientRect();
      // With `whole`, every visible box is entered: a fixed layer can cover
      // the point from inside a wrapper that does not.
      if (
        contains(rect, x, y) ||
        (whole && getComputedStyle(child).display !== "none")
      ) {
        visit(child);
      }
      // A box with no area of its own (a portal's wrapper, `display:
      // contents`) can still hold fixed layers; a hidden one cannot.
      else if (
        (rect.width === 0 || rect.height === 0) &&
        getComputedStyle(child).display !== "none"
      ) {
        visit(child);
      }
    }
  };
  visit(root);
  const layered = found
    .filter(
      (element) =>
        element === root || contains(element.getBoundingClientRect(), x, y),
    )
    .map((element, order) => ({
      element,
      order,
      stack: stackLevel(element),
      fixed: inFixedLayer(element, getComputedStyle(element)),
    }));
  layered.sort(
    (a, b) =>
      b.stack - a.stack ||
      Number(b.fixed) - Number(a.fixed) ||
      b.order - a.order,
  );
  return layered
    .map(({ element }) => element)
    .filter((element) => contains(element.getBoundingClientRect(), x, y));
}

/**
 * How high the element's outermost stacking box sits: infinite in the top
 * layer, else the z-index of the outermost positioned box around it (the one
 * that decides its order among the page's layers), else 0.
 */
function stackLevel(element: Element): number {
  let level = 0;
  for (
    let current: Element | null = element;
    current && current !== document.body;
    current = current.parentElement
  ) {
    if (matches(current, ":modal") || matches(current, ":popover-open")) {
      return Number.POSITIVE_INFINITY;
    }
    const style = getComputedStyle(current);
    const zIndex = Number.parseInt(style.zIndex, 10);
    if (style.position !== "static" && !Number.isNaN(zIndex)) level = zIndex;
  }
  return level;
}

function contains(rect: DOMRect, x: number, y: number): boolean {
  return rect.left <= x && rect.right > x && rect.top <= y && rect.bottom > y;
}

/** A box that can sit next to a bar (see `readSystemBarColors`). */
function isBarSurface(element: Element, ahead: Ahead): boolean {
  if (element === document.documentElement || element === document.body) {
    return true;
  }
  const rect = element.getBoundingClientRect();
  if (rect.left > 0.5 || rect.right < window.innerWidth - 0.5) return false;
  const style = getComputedStyle(element);
  if (groupOpacity(element, ahead) === 0 || style.visibility === "hidden") {
    return false;
  }
  return (
    coversViewport(rect) ||
    inFixedLayer(element, style) ||
    !scrollsWithContent(element)
  );
}

function coversViewport(rect: DOMRect): boolean {
  return rect.top <= 0.5 && rect.bottom >= window.innerHeight - 0.5;
}

/** Whether the element or a box around it is fixed or sticky, so stays put while the page scrolls. */
function inFixedLayer(element: Element, style: CSSStyleDeclaration): boolean {
  let current: Element | null = element;
  let currentStyle = style;
  while (current && current !== document.body) {
    if (currentStyle.position === "fixed" || currentStyle.position === "sticky")
      return true;
    current = current.parentElement;
    if (current) currentStyle = getComputedStyle(current);
  }
  return false;
}

/** Whether the element is inside an area that scrolls (a scrolling box, or the page itself). */
function scrollsWithContent(element: Element): boolean {
  for (
    let parent = element.parentElement;
    parent && parent !== document.body;
    parent = parent.parentElement
  ) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) {
      return true;
    }
  }
  const page = document.scrollingElement ?? document.documentElement;
  return page.scrollHeight > page.clientHeight + 1;
}

/** The element's own background, with its own opacity (a fading backdrop). */
/** The element's own background, with its own opacity (a backdrop). */
function backgroundOf(element: Element, ahead: Ahead): Rgba | null {
  const style = getComputedStyle(element);
  const color = toRgba(
    ahead.get(element)?.backgroundColor ?? style.backgroundColor,
  );
  if (!color) return null;
  const alpha = color[3] * groupOpacity(element, ahead);
  return alpha > 0 ? [color[0], color[1], color[2], alpha] : null;
}

/**
 * The opacity the element is drawn with: its own times that of every box
 * around it, since CSS fades a box together with all it holds (a fading
 * sheet with opaque content). Blending each box with this product, rather
 * than the group as one, is exact for the usual case of one opaque box
 * inside a fading layer.
 */
function groupOpacity(element: Element, ahead: Ahead): number {
  let opacity = 1;
  for (
    let current: Element | null = element;
    current && current !== document.documentElement;
    current = current.parentElement
  ) {
    const value =
      ahead.get(current)?.opacity ?? getComputedStyle(current).opacity;
    opacity *= Number(value || 1);
    if (opacity === 0) return 0;
  }
  return opacity;
}

function backdropOf(dialog: Element): Rgba | null {
  const style = getComputedStyle(dialog, "::backdrop");
  const color = toRgba(style.backgroundColor);
  if (!color) return null;
  const alpha = color[3] * Number(style.opacity || 1);
  return alpha > 0 ? [color[0], color[1], color[2], alpha] : null;
}

/**
 * The running fades and slides of fixed layers (a sheet, a dialog, a
 * backdrop, the bottom tab bar), during which the bars are read every frame.
 * Animations that never end (loading skeletons) do not count.
 */
export function fixedLayerAnimations(): Animation[] {
  return document.getAnimations().filter((animation) => {
    const effect = animation.effect;
    if (
      !(effect instanceof KeyframeEffect) ||
      animation.playState !== "running" ||
      !Number.isFinite(Number(effect.getComputedTiming().endTime))
    ) {
      return false;
    }
    const target = effect.target;
    if (!target || target === document.documentElement) return false;
    return (
      effect.pseudoElement === "::backdrop" ||
      getComputedStyle(target).position === "fixed"
    );
  });
}

let paintContext: CanvasRenderingContext2D | null | undefined;

/**
 * Any CSS colour the browser computed (`rgb()`, `color(srgb ...)`, the result
 * of `color-mix()`) as sRGB bytes and alpha, by painting one pixel.
 */
function toRgba(cssColor: string): Rgba | null {
  if (!cssColor || cssColor === "transparent") return null;
  paintContext ??= createPaintContext();
  if (!paintContext) return null;
  paintContext.clearRect(0, 0, 1, 1);
  paintContext.fillStyle = "rgba(0, 0, 0, 0)";
  paintContext.fillStyle = cssColor;
  paintContext.fillRect(0, 0, 1, 1);
  const [red = 0, green = 0, blue = 0, alpha = 0] = paintContext.getImageData(
    0,
    0,
    1,
    1,
  ).data;
  return [red, green, blue, alpha / 255];
}

function createPaintContext(): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.getContext("2d", { willReadFrequently: true });
}

function toHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) =>
      Math.round(Math.min(255, Math.max(0, channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
