import postcss, {
  type AtRule,
  type ChildNode,
  type Declaration,
  type Rule,
} from "postcss";
import type { Plugin } from "vite";

/**
 * Better stand-ins for `color-mix()` where a browser cannot mix colours
 * (Safari before 16.2, so every iPhone left on iOS 15).
 *
 * Tailwind writes each declaration that mixes a colour twice: once for those
 * browsers, then again inside `@supports (color: color-mix(in lab, red,
 * red))`. Where the colour is only known in the browser (a theme variable,
 * `currentColor`), it cannot work the mix out ahead of time and puts the
 * first colour in its place, whole. A faint tint is then drawn at full
 * strength: `color-mix(in srgb, var(--accent) 12%, transparent)` became a
 * solid block of the accent (the learner home's glow, a goal button with its
 * icon lost in a square of its own colour, white progress tracks).
 *
 * This works each of those first copies out again from the mix itself, and
 * leaves alone the ones Tailwind could work out (they are no longer the
 * first colour alone). A colour mixed with `transparent` is kept, at full
 * strength, only if it makes up at least half of the mix; below that it is
 * left out (`transparent`), since a tint that cannot be drawn faintly is
 * better not drawn. Between two colours, the larger share wins.
 */
export function colorMixFallbackPlugin(): Plugin {
  return {
    name: "veo-color-mix-fallbacks",
    transform(code, id) {
      if (!/\.css(?:$|\?)/u.test(id)) return null;
      if (!SUPPORTS_TEST.test(code)) return null;
      let root;
      try {
        root = postcss.parse(code, { from: id.split("?")[0] });
      } catch {
        return null;
      }
      let changed = false;
      root.walkAtRules("supports", (supports) => {
        if (!SUPPORTS_TEST.test(`(${supports.params})`)) return;
        for (const [fallback, mixed, ownRule] of fallbackPairs(supports)) {
          const value = isFirstColourStandIn(fallback.value, mixed.value)
            ? withoutMixes(mixed.value)
            : fallback.value;
          if (value !== fallback.value) {
            fallback.value = value;
            changed = true;
          } else {
            // Set again for nothing (see `fallbackPairs`).
            ownRule?.remove();
          }
        }
      });
      return changed ? { code: root.toString(), map: null } : null;
    },
  };
}

const SUPPORTS_TEST =
  /\(\s*color\s*:\s*color-mix\(\s*in lab\s*,\s*red\s*,\s*red\s*\)\s*\)/u;

/**
 * The declarations inside the `@supports` block, each with the copy before
 * it. Before Tailwind's optimiser runs (the dev server) the block is nested
 * in the rule, just after the copy; after it (a build) the block follows a
 * rule that holds the copy, alone or merged with other selectors. A merged
 * copy is set again in a rule of its own, handed back third, which the
 * caller removes if it is left unchanged.
 */
function* fallbackPairs(
  supports: AtRule,
): Generator<[Declaration, Declaration, Rule?]> {
  const parent = supports.parent;
  if (parent?.type === "rule") {
    for (const mixed of declarations(supports)) {
      const fallback = previousDeclaration(supports, mixed.prop);
      if (fallback) yield [fallback, mixed];
    }
    return;
  }
  let sibling = supports.prev();
  while (sibling?.type === "comment") sibling = sibling.prev();
  if (sibling?.type !== "rule") return;
  const copied = splitTopLevel(sibling.selector).map((part) => part.trim());
  for (const inner of supports.nodes ?? []) {
    if (inner.type !== "rule" || !copied.includes(inner.selector)) continue;
    for (const mixed of declarations(inner)) {
      const fallback = declarations(sibling)
        .reverse()
        .find((declaration) => declaration.prop === mixed.prop);
      if (!fallback) continue;
      if (inner.selector === sibling.selector) {
        yield [fallback, mixed];
        continue;
      }
      // The optimiser merged the copy into a rule shared with other
      // selectors (`.bg-current,.bg-current\/6{...}`): this selector's copy
      // is set again in a rule of its own, after the shared one.
      const own = postcss.rule({ selector: inner.selector });
      own.append(fallback.clone());
      supports.before(own);
      yield [own.first as Declaration, mixed, own];
    }
  }
}

function declarations(container: { nodes?: ChildNode[] }) {
  return (container.nodes ?? []).filter(
    (node): node is Declaration => node.type === "decl",
  );
}

function previousDeclaration(node: ChildNode, prop: string) {
  let sibling = node.prev();
  while (sibling) {
    if (sibling.type === "decl" && sibling.prop === prop) return sibling;
    sibling = sibling.prev();
  }
  return undefined;
}

/** Whether the copy is the mix with each `color-mix()` put as its first colour. */
function isFirstColourStandIn(fallback: string, mixed: string) {
  return normalise(fallback) === normalise(replaceMixes(mixed, firstColour));
}

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/\s*([(),/])\s*/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim();
}

function withoutMixes(value: string) {
  return replaceMixes(value, standIn);
}

type Mix = { colour: string; share: number | null }[];

/** Puts `replace(mix)` in the place of each `color-mix()`, innermost first. */
function replaceMixes(value: string, replace: (mix: Mix) => string): string {
  const start = value.toLowerCase().indexOf("color-mix(");
  if (start === -1) return value;
  const open = start + "color-mix".length;
  const close = matchingParenthesis(value, open);
  if (close === -1) return value;
  const args = splitTopLevel(value.slice(open + 1, close)).slice(1);
  const mix = args.map((arg) => {
    const inner = replaceMixes(arg.trim(), replace);
    const share =
      /^(?<colour>.*?)\s+(?<share>[\d.]+)%$/su.exec(inner) ??
      /^(?<share>[\d.]+)%\s+(?<colour>.*)$/su.exec(inner);
    return share?.groups
      ? { colour: share.groups.colour!, share: Number(share.groups.share) }
      : { colour: inner, share: null };
  });
  return (
    value.slice(0, start) +
    replace(mix) +
    replaceMixes(value.slice(close + 1), replace)
  );
}

function firstColour(mix: Mix) {
  return mix[0]?.colour ?? "transparent";
}

function standIn(mix: Mix) {
  const [first, second] = mix;
  if (!first || !second) return first?.colour ?? "transparent";
  // Shares left out are what the other leaves, or half each.
  const firstShare =
    first.share ?? (second.share === null ? 50 : 100 - second.share);
  const secondShare = second.share ?? 100 - firstShare;
  const isClear = (colour: string) => colour.toLowerCase() === "transparent";
  if (isClear(first.colour) || isClear(second.colour)) {
    const [colour, share] = isClear(first.colour)
      ? [second.colour, secondShare]
      : [first.colour, firstShare];
    return share * 2 >= firstShare + secondShare ? colour : "transparent";
  }
  return firstShare >= secondShare ? first.colour : second.colour;
}

function matchingParenthesis(value: string, open: number) {
  let depth = 0;
  for (let index = open; index < value.length; index += 1) {
    if (value[index] === "(") depth += 1;
    else if (value[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(value: string) {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) {
      parts.push(value.slice(from, index));
      from = index + 1;
    }
  }
  parts.push(value.slice(from));
  return parts;
}
