import fs from "node:fs/promises";
import path from "node:path";

/**
 * Writes `/__app-paths.json`: the first path segments the built site uses,
 * so short links (docs/short-links.md) never take one. The website Worker
 * skips its link lookup under them, and the API refuses them as link paths.
 *
 * Read from what was built, not from a list: the route tree React Router
 * wrote to its client manifest (core's routes and any extension's), and the
 * top-level files and folders of the build.
 */
export async function writeAppPaths(clientBuildDirectory) {
  const segments = new Set();

  const assetsDirectory = path.join(clientBuildDirectory, "assets");
  const manifests = (await fs.readdir(assetsDirectory)).filter((name) =>
    /^manifest-[\w-]+\.js$/u.test(name),
  );
  if (manifests.length === 0) {
    throw new Error(
      "No React Router manifest in the build: cannot list the app's paths.",
    );
  }
  for (const name of manifests) {
    const source = await fs.readFile(path.join(assetsDirectory, name), "utf8");
    const json = source
      .slice(source.indexOf("=") + 1)
      .trim()
      .replace(/;$/u, "");
    const routes = Object.values(JSON.parse(json).routes ?? {});
    const byId = new Map(routes.map((route) => [route.id, route]));
    const fullPath = (route) => {
      const parts = [];
      for (let current = route; current; current = byId.get(current.parentId)) {
        if (current.path) parts.unshift(current.path);
      }
      return parts.join("/");
    };
    for (const route of routes) {
      const first = fullPath(route)
        .split("/")
        .find((part) => part.length > 0);
      if (first && !first.startsWith(":") && first !== "*") {
        segments.add(first.toLowerCase());
      }
    }
  }

  for (const entry of await fs.readdir(clientBuildDirectory)) {
    segments.add(entry.toLowerCase());
  }
  segments.add("__app-paths.json");

  await fs.writeFile(
    path.join(clientBuildDirectory, "__app-paths.json"),
    `${JSON.stringify({ segments: [...segments].sort() })}\n`,
  );
  return segments.size;
}
