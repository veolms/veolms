import type { RouteConfigEntry } from "@veolms/plugin-sdk";

/**
 * The first path segments the app's own pages use (`courses`, `settings`,
 * `login`...), lowercased and sorted, from a route tree. Layouts and index
 * routes add none of their own; a route whose first segment is a parameter
 * (`:username`) or `*` adds none either, since it matches whatever is left.
 *
 * Short links (docs/short-links.md) may not take these: the API refuses
 * them, and the website Worker never looks a link up under them.
 */
export function getAppPathSegments(
  routes: readonly RouteConfigEntry[],
): string[] {
  const segments = new Set<string>();
  const visit = (entries: readonly RouteConfigEntry[], prefix: string) => {
    for (const entry of entries) {
      const path = entry.path
        ? `${prefix}/${entry.path}`.replace(/\/+/gu, "/")
        : prefix;
      const first = path.split("/").find((part) => part.length > 0);
      if (first && !first.startsWith(":") && first !== "*") {
        segments.add(first.toLowerCase());
      }
      if (entry.children) visit(entry.children, path);
    }
  };
  visit(routes, "");
  return [...segments].sort();
}
