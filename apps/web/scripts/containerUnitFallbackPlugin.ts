import postcss from "postcss";
import type { Plugin } from "vite";

/**
 * Stand-ins for container query units (`cqw` and the rest) where a browser
 * does not know them (Safari before 16, so every iPhone left on iOS 15).
 *
 * Such a browser loses whatever a declaration with one of them set: the
 * home's side gutters and the size of its greeting were gone on an iPhone
 * 13 on iOS 15. Each such declaration is written in viewport units instead
 * (`cqw` as `vw`, and so on), and the original is set again after it inside
 * `@supports (width: 1cqw)`. The page is most of the viewport on a phone,
 * so the stand-in comes close there; on a wider screen a container is
 * narrower than the viewport, which the clamps most of these values sit in
 * keep within bounds.
 *
 * Two copies in a row would not do: Safari takes a value with `var()` in it
 * on trust, so the second copy won and was then thrown away when the
 * variable was filled in (measured on iOS 15.5: no gutter at all).
 *
 * The original goes in a nested block, which the build's minifier lowers to
 * a rule of its own for the CSS targets (see `build.cssTarget`). Custom
 * properties are left alone: a variable is filled in only where it is used.
 */
export function containerUnitFallbackPlugin(): Plugin {
  return {
    name: "veo-container-unit-fallbacks",
    transform(code, id) {
      if (!/\.css(?:$|\?)/u.test(id)) return null;
      if (!CONTAINER_UNIT.test(code)) return null;
      let root;
      try {
        root = postcss.parse(code, { from: id.split("?")[0] });
      } catch {
        return null;
      }
      let changed = false;
      root.walkDecls((declaration) => {
        // Only declarations of a rule (not those this has just set again in
        // a block of their own).
        if (declaration.parent?.type !== "rule") return;
        if (declaration.prop.startsWith("--")) return;
        if (!CONTAINER_UNIT.test(declaration.value)) return;
        const original = declaration.value;
        declaration.value = original.replace(
          CONTAINER_UNITS,
          (_, number: string, unit: string) =>
            `${number}${VIEWPORT_UNITS[unit as keyof typeof VIEWPORT_UNITS]}`,
        );
        declaration.after(
          postcss.atRule({
            name: "supports",
            params: "(width: 1cqw)",
            nodes: [declaration.clone({ value: original })],
          }),
        );
        changed = true;
      });
      return changed ? { code: root.toString(), map: null } : null;
    },
  };
}

const VIEWPORT_UNITS = {
  cqw: "vw",
  cqi: "vw",
  cqh: "vh",
  cqb: "vh",
  cqmin: "vmin",
  cqmax: "vmax",
};

const CONTAINER_UNIT = /\d(?:cqw|cqi|cqh|cqb|cqmin|cqmax)\b/u;
const CONTAINER_UNITS = /(\d)(cqw|cqi|cqh|cqb|cqmin|cqmax)\b/gu;
