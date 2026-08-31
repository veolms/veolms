import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientBuildDirectory = path.resolve(scriptDirectory, "../build/client");
const routeStylesheetPattern =
  /<link rel="stylesheet" href="([^"]+)" data-route-app-css="true"\/>/;
const modulePreloadMarker = '<link rel="modulepreload"';

const findHtmlFiles = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findHtmlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".html") ? [entryPath] : [];
    }),
  );
  return files.flat();
};

let optimizedFileCount = 0;

for (const htmlFile of await findHtmlFiles(clientBuildDirectory)) {
  const html = await readFile(htmlFile, "utf8");
  const stylesheetMatch = routeStylesheetPattern.exec(html);
  if (!stylesheetMatch) continue;

  const [stylesheetTag, stylesheetHref] = stylesheetMatch;
  if (!stylesheetHref) continue;

  const withoutStylesheet =
    html.slice(0, stylesheetMatch.index) +
    html.slice(stylesheetMatch.index + stylesheetTag.length);
  const firstModulePreloadIndex =
    withoutStylesheet.indexOf(modulePreloadMarker);
  if (firstModulePreloadIndex < 0) continue;

  const optimizedHtml =
    withoutStylesheet.slice(0, firstModulePreloadIndex) +
    stylesheetTag +
    withoutStylesheet.slice(firstModulePreloadIndex);

  await writeFile(htmlFile, optimizedHtml, "utf8");
  optimizedFileCount += 1;
}

console.log(
  `Prioritized prerender resources in ${optimizedFileCount} HTML files.`,
);
