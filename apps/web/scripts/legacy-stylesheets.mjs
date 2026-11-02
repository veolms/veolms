import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { transformLegacyCss } from "./legacy-css.mjs";
import { LEGACY_SCRIPT_NAMES, readLegacyScript } from "./legacy-scripts.mjs";

/**
 * Writes, beside each built stylesheet, a copy for browsers from before
 * 2022: `assets/x.css` → `assets/x.legacy.css` (what changes, and why:
 * legacy-css.mjs). Only those browsers load it: the first script in the
 * page head points their stylesheet links at it
 * (src/shell/legacyBrowserSupport.ts), so every `x.css` gets its copy and
 * that script needs no list. The scripts it also loads go to `legacy/`.
 *
 * Stylesheets with layers go first: the others must outrank all of their
 * rules, as rules outside layers do in a current browser.
 */
export async function writeLegacyStylesheets(
  clientDirectory,
  { quiet = false } = {},
) {
  const root = path.resolve(clientDirectory);
  const assets = path.join(root, "assets");
  const names = (await readdir(assets)).filter(
    (name) => name.endsWith(".css") && !name.endsWith(".legacy.css"),
  );
  const sources = new Map(
    await Promise.all(
      names.map(async (name) => [
        name,
        await readFile(path.join(assets, name), "utf8"),
      ]),
    ),
  );
  const write = async (name, outsideLayersBump) => {
    const result = await transformLegacyCss(sources.get(name), {
      from: path.join(assets, name),
      outsideLayersBump,
    });
    if (result.css.includes("@layer")) {
      throw new Error(`Legacy CSS: ${name} still has @layer after rewriting`);
    }
    await writeFile(
      path.join(assets, name.replace(/\.css$/u, ".legacy.css")),
      result.css,
    );
    return result;
  };

  const layered = names.filter((name) => sources.get(name).includes("@layer"));
  const layeredResults = await Promise.all(
    layered.map((name) => write(name, 0)),
  );
  const bump =
    Math.max(0, ...layeredResults.map((result) => result.layeredBump)) + 1;
  const otherResults = await Promise.all(
    names
      .filter((name) => !layered.includes(name))
      .map((name) => write(name, bump)),
  );

  await mkdir(path.join(root, "legacy"), { recursive: true });
  for (const name of LEGACY_SCRIPT_NAMES) {
    await writeFile(
      path.join(root, "legacy", name),
      await readLegacyScript(name),
    );
  }

  if (!quiet) {
    const mixes = [...layeredResults, ...otherResults].reduce(
      (sum, result) => sum + result.mixes,
      0,
    );
    console.log(
      `Legacy CSS: ${names.length} stylesheets, ${layered.length} with layers (the others raised by ${bump}), ${mixes} colour mixes worked out`,
    );
  }
}
