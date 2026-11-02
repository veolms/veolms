import cascadeLayers from "@csstools/postcss-cascade-layers";
import mediaMinmax from "@csstools/postcss-media-minmax";
import hasPseudo from "css-has-pseudo";
import postcss from "postcss";
import nesting from "postcss-nesting";

/**
 * Rewrites a stylesheet for browsers from before 2022 (Chrome 98, Firefox
 * 96, Safari 15.3 and older; measured in Chrome 91). They load these copies
 * instead of the real stylesheets (src/shell/legacyBrowserSupport.ts), so
 * nothing here reaches a current browser. Each gap they have, and its stand-in:
 *
 * - `@layer`: everything inside an unknown layer is dropped.
 *   `@csstools/postcss-cascade-layers` gives each layer's rules the same
 *   priority through added specificity (`:not(#\#)`) instead. Rules outside
 *   layers must still beat every layered rule, also those in other files
 *   (the sidebar's and dock's raised look lives in shell-theme.css), so the
 *   unlayered files get more of that specificity than the layered one has:
 *   `outsideLayersBump`, from `layeredBump` of the layered file.
 * - `:has()`: encoded by `css-has-pseudo`; its browser script, loaded with
 *   these copies, marks the elements. The attributes the selectors test are
 *   listed in `--legacy-has-attributes` for that script to watch.
 * - `color-mix()`: worked out exactly. Every colour custom property also
 *   gets its channels (`--x-r`, `--x-g`, `--x-b`, `--x-a`), and a mix
 *   becomes `rgba(calc(…), …)` of those. What cannot be read that way
 *   (`currentColor`) falls back to a rough stand-in.
 * - `lab()`, `lch()`, `oklab()`, `oklch()` (Tailwind's own colours):
 *   converted to sRGB.
 * - `translate`, `scale`, `rotate` (Chrome 104): one `transform` built from
 *   non-inherited `--legacy-*` properties.
 * - `dvh`, `svh`, `lvh` and their widths: the plain viewport units.
 * - `infinity` in `calc()` (Chrome 116): a large number.
 * - An absolutely placed button set to fill the width between its sides
 *   (Chrome 116, `stretchButtons`).
 * - `mask-*`: a `-webkit-mask-*` twin where there is none.
 * - `::backdrop` does not inherit custom properties (Chrome 122): its
 *   `var()` colours get a plain dim instead.
 * - Nesting (Chrome 112) and range queries like `(width >= 40rem)` (Chrome
 *   104): the dev server sends Tailwind's CSS with both (the build lowers
 *   them already), and a nested `@supports` held the real colour of many
 *   utilities, so they are flattened and rewritten to `min-width` /
 *   `max-width`, container queries included.
 * Container queries are left to `container-query-polyfill` at run time.
 */
export async function transformLegacyCss(
  source,
  { from, outsideLayersBump = 0 } = {},
) {
  const hasLayers = source.includes("@layer");
  const state = { attributes: new Set(), mixes: 0 };
  const result = await postcss([
    nesting(),
    mediaMinmax(),
    containerMinmax(),
    collectHasAttributes(state),
    hasPseudo({ preserve: false }),
    ...(hasLayers ? [cascadeLayers()] : []),
    legacyValues(state),
    ...(hasLayers || outsideLayersBump <= 0
      ? []
      : [bumpOutsideLayers(outsideLayersBump)]),
    keepHasPrefix(),
  ]).process(source, { from });
  let css = result.css;
  if (state.attributes.size) {
    css += `:root{--legacy-has-attributes:"${[...state.attributes].sort().join(" ")}"}`;
  }
  return {
    css,
    hasLayers,
    mixes: state.mixes,
    layeredBump: hasLayers ? maxIdSpecificity(result.root) : 0,
  };
}

// ---------------------------------------------------------------------------
// Container query ranges

const CONTAINER_RANGE =
  /\(\s*(width|height|inline-size|block-size)\s*(>=|>|<=|<)\s*([^)]+?)\s*\)/gu;

/** `(width >= 40rem)` → `(min-width: 40rem)`; `<` and `>` lose the edge. */
function containerMinmax() {
  return {
    postcssPlugin: "veo-legacy-container-minmax",
    AtRule: {
      container(rule) {
        rule.params = rule.params.replace(
          CONTAINER_RANGE,
          (_, feature, operator, value) =>
            `(${operator.startsWith(">") ? "min" : "max"}-${feature}: ${value})`,
        );
      },
    },
  };
}

// ---------------------------------------------------------------------------
// :has()

function collectHasAttributes(state) {
  return {
    postcssPlugin: "veo-legacy-has-attributes",
    Rule(rule) {
      if (!rule.selector.includes(":has(")) return;
      for (const match of rule.selector.matchAll(/\[\s*([\w-]+)/gu)) {
        state.attributes.add(match[1]);
      }
    },
  };
}

const HAS_PREFIX = /^\.js-has-pseudo((?::not\(#\\#\))+)\s+/u;
const ID_BUMP = ":not(#\\#)";

/**
 * The cascade layer rewrite raises a selector on its first part, which for a
 * rewritten `:has()` is `.js-has-pseudo `: css-has-pseudo removes that prefix
 * only as it is, so the rule waited for a class nothing sets. The raise goes
 * to the end instead.
 */
function keepHasPrefix() {
  return {
    postcssPlugin: "veo-legacy-has-prefix",
    OnceExit(root) {
      root.walkRules((rule) => {
        if (!rule.selector.includes(".js-has-pseudo:not(")) return;
        rule.selectors = rule.selectors.map((selector) => {
          const match = HAS_PREFIX.exec(selector);
          if (!match) return selector;
          return `.js-has-pseudo ${bumpSelector(
            selector.slice(match[0].length),
            match[1].length / ID_BUMP.length,
          )}`;
        });
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Specificity outside layers

const ID_IN_SELECTOR = /#(?:\\#|[A-Za-z_\\-][\w\\-]*)/gu;

function maxIdSpecificity(root) {
  let max = 0;
  root.walkRules((rule) => {
    if (isKeyframesRule(rule)) return;
    for (const selector of rule.selectors ?? []) {
      max = Math.max(max, (selector.match(ID_IN_SELECTOR) ?? []).length);
    }
  });
  return max;
}

function isKeyframesRule(rule) {
  return (
    rule.parent?.type === "atrule" && /keyframes$/iu.test(rule.parent.name)
  );
}

/** Raises a selector by `count` ids, before any pseudo-element. */
function bumpSelector(selector, count) {
  return insertBeforePseudoElement(selector, ID_BUMP.repeat(count));
}

function insertBeforePseudoElement(selector, text) {
  const pseudoElement = /::|:(?:before|after|first-line|first-letter)\b/u.exec(
    selector,
  );
  if (!pseudoElement) return selector + text;
  return (
    selector.slice(0, pseudoElement.index) +
    text +
    selector.slice(pseudoElement.index)
  );
}

function bumpOutsideLayers(count) {
  return {
    postcssPlugin: "veo-legacy-outside-layers",
    OnceExit(root) {
      // Collected first: the copies made below must not be walked again.
      const rules = [];
      root.walkRules((rule) => {
        if (!isKeyframesRule(rule)) rules.push(rule);
      });
      for (const rule of rules) {
        // An important declaration in a layer beats an unlayered one, so
        // the important ones keep their own specificity in a copy.
        const important = rule.nodes.filter(
          (node) => node.type === "decl" && node.important,
        );
        if (important.length) {
          const copy = rule.clone({ nodes: [] });
          for (const decl of important) copy.append(decl.clone());
          rule.after(copy);
          for (const decl of important) decl.remove();
        }
        rule.selectors = rule.selectors.map((selector) =>
          bumpSelector(selector, count),
        );
        if (!rule.nodes.length) rule.remove();
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Values

const CONTAINER_UNIT = /\d(?:cqw|cqh|cqi|cqb|cqmin|cqmax)\b/u;
// Relative colours (`oklch(from …)`) are not worked out, so their checks stay.
const COLOR_SUPPORTS =
  /^\(color:(?:color-mix\(inlab,red,red\)|(?:ok)?lab\((?!from)[^)]*\)|(?:ok)?lch\((?!from)[^)]*\))\)$/u;
const TRANSFORM_PROPERTIES = new Set(["translate", "scale", "rotate"]);
const MASK_PROPERTIES = new Set([
  "mask",
  "mask-image",
  "mask-size",
  "mask-position",
  "mask-repeat",
  "mask-origin",
  "mask-clip",
  "mask-mode",
  "mask-composite",
]);
const WEBKIT_COMPOSITE = {
  add: "source-over",
  subtract: "source-out",
  intersect: "source-in",
  exclude: "xor",
};
const LEGACY_TRANSFORM =
  "translate(var(--legacy-tx), var(--legacy-ty)) rotate(var(--legacy-r)) scale(var(--legacy-sx), var(--legacy-sy))";

function legacyValues(state) {
  return {
    postcssPlugin: "veo-legacy-values",
    OnceExit(root) {
      root.walkAtRules("supports", (rule) => {
        if (COLOR_SUPPORTS.test(rule.params.replace(/\s+/gu, ""))) {
          rule.replaceWith(rule.nodes ?? []);
        }
      });

      let usesTransforms = false;
      root.walkDecls((decl) => {
        let value = decl.value;
        if (/(?:^|[^\w-])(?:ok)?(?:lab|lch)\(/u.test(value)) {
          value = replaceFunctions(
            value,
            /(?:ok)?(?:lab|lch)\(/u,
            (call) => render(resolveColor(call)) ?? call,
          );
        }
        if (value.includes("color-mix(")) {
          value = replaceFunctions(value, /color-mix\(/u, (call) => {
            state.mixes += 1;
            return render(resolveColor(call)) ?? roughMix(call);
          });
        }
        if (CONTAINER_UNIT.test(value)) {
          // container-query-polyfill rewrites `cq*` units inside functions
          // only; one left in `(100cqi - 68rem) / 2` made the whole value
          // invalid. `calc()` is the same group as a function.
          value = value.replace(/(^|[^\w-])\(/gu, "$1calc(");
        }
        if (value.includes("infinity")) {
          // Tailwind's `rounded-full` is `calc(infinity * 1px)` (Chrome 116).
          value = value.replace(/(^|[\s(*/+-])infinity\b/gu, "$199999");
        }
        value = value
          .replace(/(\d)(?:dvh|svh|lvh|dvb|svb|lvb)\b/gu, "$1vh")
          .replace(/(\d)(?:dvw|svw|lvw|dvi|svi|lvi)\b/gu, "$1vw")
          .replace(/(\d)(?:dv|sv|lv)(min|max)\b/gu, "$1v$2");
        if (/^--tw-scale-[xyz]$/u.test(decl.prop)) {
          // These end up in `transform: scale()`, which takes no percentage.
          value = value.replace(
            /^(-?[\d.]+)%$/u,
            (_, percent) => `${Number(percent) / 100}`,
          );
        }
        decl.value = value;

        if (decl.prop.startsWith("--") && !/-[rgba]$/u.test(decl.prop)) {
          const channels = resolveColor(decl.value);
          if (channels) {
            ["r", "g", "b", "a"].forEach((channel, index) => {
              decl.cloneAfter({
                prop: `${decl.prop}-${channel}`,
                value: channelText(channels[index]),
                important: false,
              });
            });
          }
        }

        if (TRANSFORM_PROPERTIES.has(decl.prop)) {
          usesTransforms = true;
          replaceTransformProperty(decl);
        } else if (MASK_PROPERTIES.has(decl.prop)) {
          addWebkitMask(decl);
        } else if (decl.prop === "transition-property") {
          if (
            /\b(?:translate|scale|rotate)\b/u.test(decl.value) &&
            !/\btransform\b/u.test(decl.value)
          ) {
            decl.value += ", transform";
          }
        }

        if (
          decl.parent?.type === "rule" &&
          decl.parent.selector.includes("::backdrop") &&
          decl.value.includes("var(") &&
          /^background(?:-color)?$/u.test(decl.prop)
        ) {
          decl.value = "rgba(0, 0, 0, 0.5)";
        }
      });

      stretchButtons(root);

      if (usesTransforms) {
        root.prepend(
          postcss.parse(
            [
              ["tx", "0px"],
              ["ty", "0px"],
              ["r", "0deg"],
              ["sx", "1"],
              ["sy", "1"],
            ]
              .map(
                ([name, initial]) =>
                  `@property --legacy-${name}{syntax:"*";inherits:false;initial-value:${initial}}`,
              )
              .join(""),
          ),
        );
      }
    },
  };
}

const ZERO_LENGTH = /^(?:0(?:px)?|calc\(var\(--spacing\)\s*\*\s*0\))$/u;

/**
 * An absolutely placed button with both sides at 0 kept its own width in
 * Chrome 91 instead of filling the space between them (a card's whole-cover
 * play button was 72px wide); Chrome 116 fills it. Each rule that sets both
 * sides to 0 gets a copy for buttons that fills that width, as weak as the
 * rule itself, so a width given later still wins.
 */
function stretchButtons(root) {
  const rules = [];
  root.walkRules((rule) => {
    if (isKeyframesRule(rule) || rule.selector.includes("::")) return;
    const values = {};
    for (const node of rule.nodes) {
      if (node.type === "decl") values[node.prop] = node.value.trim();
    }
    if ("width" in values || "inline-size" in values) return;
    const inset = values.inset && splitTopLevel(values.inset, "space");
    const inline =
      values["inset-inline"] && splitTopLevel(values["inset-inline"], "space");
    const zero = (value) => value !== undefined && ZERO_LENGTH.test(value);
    if (
      (inset &&
        zero(inset[1] ?? inset[0]) &&
        zero(inset[3] ?? inset[1] ?? inset[0])) ||
      (inline && zero(inline[0]) && zero(inline[1] ?? inline[0])) ||
      (zero(values.left) && zero(values.right))
    ) {
      rules.push(rule);
    }
  });
  for (const rule of rules) {
    const copy = rule.clone({ nodes: [] });
    copy.selectors = rule.selectors.map((selector) =>
      insertBeforePseudoElement(selector, ":where(button)"),
    );
    copy.append({ prop: "width", value: "-webkit-fill-available" });
    rule.after(copy);
  }
}

function replaceTransformProperty(decl) {
  const parts = splitTopLevel(decl.value, "space");
  const none = decl.value.trim() === "none";
  const sets = [];
  if (decl.prop === "translate") {
    sets.push(["tx", none ? "0px" : (parts[0] ?? "0px")]);
    sets.push(["ty", none ? "0px" : (parts[1] ?? "0px")]);
  } else if (decl.prop === "scale") {
    sets.push(["sx", none ? "1" : (parts[0] ?? "1")]);
    sets.push(["sy", none ? "1" : (parts[1] ?? parts[0] ?? "1")]);
  } else {
    // `rotate: x 45deg` style axes are left as a plain rotation.
    sets.push(["r", none ? "0deg" : (parts.at(-1) ?? "0deg")]);
  }
  for (const [name, value] of sets) {
    decl.cloneBefore({ prop: `--legacy-${name}`, value });
  }
  const hasOwnTransform = decl.parent?.nodes?.some(
    (node) => node.type === "decl" && node.prop === "transform",
  );
  if (hasOwnTransform) decl.remove();
  else
    decl.replaceWith(
      decl.clone({ prop: "transform", value: LEGACY_TRANSFORM }),
    );
}

function addWebkitMask(decl) {
  const webkitProp = `-webkit-${decl.prop}`;
  const hasTwin = decl.parent?.nodes?.some(
    (node) => node.type === "decl" && node.prop === webkitProp,
  );
  if (hasTwin) return;
  const value =
    decl.prop === "mask-composite"
      ? decl.value.replace(
          /\b(add|subtract|intersect|exclude)\b/gu,
          (word) => WEBKIT_COMPOSITE[word],
        )
      : decl.value;
  decl.cloneBefore({ prop: webkitProp, value });
}

// ---------------------------------------------------------------------------
// Colours. A colour is four channels, r g b in 0–255 and a in 0–1, each a
// number or a CSS expression (without the `calc(` around it).

function resolveColor(text) {
  const value = text.trim();
  const lower = value.toLowerCase();
  if (lower === "transparent") return [0, 0, 0, 0];
  if (lower === "white") return [255, 255, 255, 1];
  if (lower === "black") return [0, 0, 0, 1];
  const hex = /^#([0-9a-f]{3,8})$/iu.exec(value);
  if (hex) return hexChannels(hex[1]);
  const call = /^([a-z-]+)\((.*)\)$/isu.exec(value);
  if (!call) return null;
  const [, name, inner] = call;
  switch (name.toLowerCase()) {
    case "var": {
      const variable = /^\s*(--[\w-]+)/u.exec(inner);
      if (!variable) return null;
      // `var(--a, var(--b))` falls back channel by channel too: without it
      // the sidebar's resize line mixed into grey instead of the shell.
      const [, fallbackText] = splitTopLevel(inner, ",");
      const fallback = (fallbackText && resolveColor(fallbackText)) || [
        128, 128, 128, 1,
      ];
      return ["r", "g", "b", "a"].map(
        (channel, index) =>
          `var(${variable[1]}-${channel}, ${fallback[index]})`,
      );
    }
    case "rgb":
    case "rgba":
      return rgbChannels(inner);
    case "lab":
    case "lch":
    case "oklab":
    case "oklch":
      return labLikeChannels(name.toLowerCase(), inner);
    case "color-mix":
      return mixChannels(inner);
    default:
      return null;
  }
}

function hexChannels(digits) {
  const full =
    digits.length <= 4 ? [...digits].map((d) => d + d).join("") : digits;
  const channels = [0, 2, 4].map((at) => parseInt(full.slice(at, at + 2), 16));
  const alpha =
    full.length === 8 ? round(parseInt(full.slice(6, 8), 16) / 255) : 1;
  return [...channels, alpha];
}

function rgbChannels(inner) {
  const [colorPart, alphaPart] = splitTopLevel(inner, "/");
  const parts = colorPart.includes(",")
    ? splitTopLevel(colorPart, ",")
    : splitTopLevel(colorPart, "space");
  if (alphaPart !== undefined) parts[3] = alphaPart;
  if (parts.length < 3) return null;
  return parts
    .slice(0, 4)
    .map((part, index) => {
      const percentage = /^(-?\d*\.?\d+)%$/u.exec(part);
      if (percentage) {
        const share = Number(percentage[1]) / 100;
        return index === 3 ? share : round(share * 255);
      }
      if (/^-?\d*\.?\d+$/u.test(part)) return Number(part);
      if (/^calc\((.*)\)$/su.test(part)) return part.slice(5, -1);
      return part;
    })
    .concat(parts.length === 3 ? [1] : []);
}

function labLikeChannels(name, inner) {
  const [colorPart, alphaPart] = splitTopLevel(inner, "/");
  const parts = splitTopLevel(colorPart, "space");
  if (
    parts.length !== 3 ||
    parts.some((part) => !/^-?\d*\.?\d+(?:%|deg)?$/u.test(part))
  ) {
    return null;
  }
  const number = (part, percentScale) =>
    part.endsWith("%")
      ? (Number(part.slice(0, -1)) / 100) * percentScale
      : parseFloat(part);
  let rgb;
  if (name === "lab" || name === "lch") {
    const lightness = number(parts[0], 100);
    let a = number(parts[1], 125);
    let b = number(parts[2], 125);
    if (name === "lch") {
      const chroma = number(parts[1], 150);
      const hue = (parseFloat(parts[2]) * Math.PI) / 180;
      a = chroma * Math.cos(hue);
      b = chroma * Math.sin(hue);
    }
    rgb = labToSrgb(lightness, a, b);
  } else {
    const lightness = number(parts[0], 1);
    let a = number(parts[1], 0.4);
    let b = number(parts[2], 0.4);
    if (name === "oklch") {
      const chroma = number(parts[1], 0.4);
      const hue = (parseFloat(parts[2]) * Math.PI) / 180;
      a = chroma * Math.cos(hue);
      b = chroma * Math.sin(hue);
    }
    rgb = oklabToSrgb(lightness, a, b);
  }
  let alpha = 1;
  if (alphaPart !== undefined) {
    alpha = alphaPart.endsWith("%")
      ? Number(alphaPart.slice(0, -1)) / 100
      : Number(alphaPart);
  }
  return [...rgb, round(alpha)];
}

function labToSrgb(lightness, a, b) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  const fy = (lightness + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const xr = fx ** 3 > epsilon ? fx ** 3 : (116 * fx - 16) / kappa;
  const yr = lightness > kappa * epsilon ? fy ** 3 : lightness / kappa;
  const zr = fz ** 3 > epsilon ? fz ** 3 : (116 * fz - 16) / kappa;
  const d50 = [
    (xr * 0.3457) / 0.3585,
    yr,
    (zr * (1 - 0.3457 - 0.3585)) / 0.3585,
  ];
  const d65 = multiply(
    [
      [0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
      [-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
      [0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
    ],
    d50,
  );
  return linearToSrgb(
    multiply(
      [
        [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
        [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
        [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
      ],
      d65,
    ),
  );
}

function oklabToSrgb(lightness, a, b) {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return linearToSrgb([
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]);
}

function multiply(matrix, vector) {
  return matrix.map((row) =>
    row.reduce((sum, value, index) => sum + value * vector[index], 0),
  );
}

function linearToSrgb(channels) {
  return channels.map((value) => {
    const clamped = Math.min(1, Math.max(0, value));
    const encoded =
      clamped <= 0.0031308
        ? 12.92 * clamped
        : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255);
  });
}

function mixChannels(inner) {
  const parts = splitTopLevel(inner, ",");
  if (parts.length < 3) return null;
  const first = parseStop(parts[1]);
  const second = parseStop(parts[2]);
  const one = resolveColor(first.color);
  const two = resolveColor(second.color);
  if (!one || !two) return null;
  let p1 = first.share;
  let p2 = second.share;
  // A share worked out at run time (`calc(34% * var(--strength))`, the
  // sidebar's resize line): the other colour takes the rest.
  if (typeof p1 === "string" || typeof p2 === "string") {
    if (p1 !== null && p2 !== null) return null;
    const share = `${p1 ?? p2} / 100`;
    const [w1, w2] =
      p1 === null ? [`1 - ${share}`, share] : [share, `1 - ${share}`];
    if (one[3] === 0) return [...two.slice(0, 3), scale(two[3], w2)];
    if (two[3] === 0) return [...one.slice(0, 3), scale(one[3], w1)];
    return [0, 1, 2, 3].map((index) => combine(one[index], w1, two[index], w2));
  }
  if (p1 === null && p2 === null) [p1, p2] = [50, 50];
  else if (p1 === null) p1 = 100 - p2;
  else if (p2 === null) p2 = 100 - p1;
  const sum = p1 + p2;
  if (sum <= 0) return null;
  const alphaScale = sum < 100 ? sum / 100 : 1;
  const w1 = p1 / sum;
  const w2 = p2 / sum;
  // A mix with full transparency keeps the other colour, fainter.
  if (one[3] === 0) return [...two.slice(0, 3), scale(two[3], w2 * alphaScale)];
  if (two[3] === 0) return [...one.slice(0, 3), scale(one[3], w1 * alphaScale)];
  return [0, 1, 2, 3].map((index) => {
    const mixed = combine(one[index], w1, two[index], w2);
    return index === 3 ? scale(mixed, alphaScale) : mixed;
  });
}

function parseStop(text) {
  let share = null;
  const color = [];
  for (const token of splitTopLevel(text, "space")) {
    const percentage = /^(-?\d*\.?\d+)%$/u.exec(token);
    if (percentage && share === null) share = Number(percentage[1]);
    else if (share === null && /^calc\(.*%.*\)$/u.test(token)) {
      // In percent, as text: `calc(34% * var(--s))` → `(34 * var(--s))`.
      share = `(${token.slice(5, -1).replace(/(\d*\.?\d+)%/gu, "$1")})`;
    } else color.push(token);
  }
  return { color: color.join(" "), share };
}

function combine(x, wx, y, wy) {
  if ([x, wx, y, wy].every((value) => typeof value === "number")) {
    return round(x * wx + y * wy);
  }
  return `${term(x)} * ${weight(wx)} + ${term(y)} * ${weight(wy)}`;
}

function scale(x, factor) {
  if (factor === 1) return x;
  if (typeof x === "number" && typeof factor === "number") {
    return round(x * factor);
  }
  return `${term(x)} * ${weight(factor)}`;
}

/** A mix weight: a number, or text worked out at run time. */
function weight(w) {
  return typeof w === "number" ? String(round(w)) : `(${w})`;
}

function term(x) {
  return typeof x === "number" ||
    /^var\([^()]*(?:\([^()]*\))?[^()]*\)$/u.test(x)
    ? String(x)
    : `(${x})`;
}

function channelText(channel) {
  if (typeof channel === "number") return String(channel);
  return /^var\(/u.test(channel) && !/[*+]/u.test(channel)
    ? channel
    : `calc(${channel})`;
}

function render(channels) {
  if (!channels) return null;
  if (channels.every((channel) => typeof channel === "number")) {
    const [r, g, b, a] = channels;
    const rgb = [r, g, b].map((v) => Math.min(255, Math.max(0, Math.round(v))));
    return a >= 1
      ? `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`
      : `rgba(${rgb.join(", ")}, ${round(Math.max(0, a))})`;
  }
  return `rgba(${channels.map(channelText).join(", ")})`;
}

/** Stand-in for a mix that cannot be worked out (`currentColor`). */
function roughMix(call) {
  const parts = splitTopLevel(call.slice("color-mix(".length, -1), ",");
  if (parts.length < 3) return parts.at(-1) ?? "transparent";
  const first = parseStop(parts[1]);
  const second = parseStop(parts[2]);
  let p1 = first.share ?? (second.share === null ? 50 : 100 - second.share);
  let p2 = second.share ?? 100 - p1;
  const clear = (color) => /^transparent$/iu.test(color);
  if (clear(first.color) || clear(second.color)) {
    const [color, share] = clear(second.color)
      ? [first.color, p1]
      : [second.color, p2];
    if (share >= 50) return color;
    return `rgba(128, 128, 128, ${round(Math.min(0.5, (share / 100) * 1.6))})`;
  }
  return p1 >= p2 ? first.color : second.color;
}

// ---------------------------------------------------------------------------
// Text helpers

/** Replaces each call matched by `start` (ending in "("), innermost first. */
function replaceFunctions(value, start, replace) {
  let out = "";
  let index = 0;
  for (;;) {
    const match = new RegExp(start.source, "u").exec(value.slice(index));
    if (!match) return out + value.slice(index);
    const begin = index + match.index;
    if (begin > 0 && /[\w-]/u.test(value[begin - 1])) {
      out += value.slice(index, begin + match[0].length);
      index = begin + match[0].length;
      continue;
    }
    const open = begin + match[0].length - 1;
    const close = matchingParen(value, open);
    if (close < 0) return out + value.slice(index);
    const inner = replaceFunctions(
      value.slice(open + 1, close),
      start,
      replace,
    );
    out +=
      value.slice(index, begin) +
      replace(value.slice(begin, open + 1) + inner + ")");
    index = close + 1;
  }
}

function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** Splits at `separator` (a character, or "space") outside parentheses. */
function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    const splits =
      depth === 0 &&
      (separator === "space" ? /\s/u.test(char) : char === separator);
    if (splits) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function round(number) {
  return Math.round(number * 1000) / 1000;
}
