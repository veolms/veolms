import codexDark from "../styles/themes/dark/codex.css?url&no-inline";
import oceanDark from "../styles/themes/dark/ocean.css?url&no-inline";
import midnightDark from "../styles/themes/dark/midnight.css?url&no-inline";
import graphiteDark from "../styles/themes/dark/graphite.css?url&no-inline";
import violetDark from "../styles/themes/dark/violet.css?url&no-inline";
import emberDark from "../styles/themes/dark/ember.css?url&no-inline";
import sunlitDark from "../styles/themes/dark/sunlit.css?url&no-inline";
import groveDark from "../styles/themes/dark/grove.css?url&no-inline";
import roseDark from "../styles/themes/dark/rose.css?url&no-inline";
import signalDark from "../styles/themes/dark/signal.css?url&no-inline";
import barbieDark from "../styles/themes/dark/barbie.css?url&no-inline";
import auroraDark from "../styles/themes/dark/aurora.css?url&no-inline";
import brainwaveDark from "../styles/themes/dark/brainwave.css?url&no-inline";
import lilacDark from "../styles/themes/dark/lilac.css?url&no-inline";
import champagneDark from "../styles/themes/dark/champagne.css?url&no-inline";
import limeDark from "../styles/themes/dark/lime.css?url&no-inline";
import codexLight from "../styles/themes/light/codex.css?url&no-inline";
import oceanLight from "../styles/themes/light/ocean.css?url&no-inline";
import midnightLight from "../styles/themes/light/midnight.css?url&no-inline";
import graphiteLight from "../styles/themes/light/graphite.css?url&no-inline";
import violetLight from "../styles/themes/light/violet.css?url&no-inline";
import emberLight from "../styles/themes/light/ember.css?url&no-inline";
import sunlitLight from "../styles/themes/light/sunlit.css?url&no-inline";
import groveLight from "../styles/themes/light/grove.css?url&no-inline";
import roseLight from "../styles/themes/light/rose.css?url&no-inline";
import signalLight from "../styles/themes/light/signal.css?url&no-inline";
import barbieLight from "../styles/themes/light/barbie.css?url&no-inline";
import auroraLight from "../styles/themes/light/aurora.css?url&no-inline";
import brainwaveLight from "../styles/themes/light/brainwave.css?url&no-inline";
import lilacLight from "../styles/themes/light/lilac.css?url&no-inline";
import champagneLight from "../styles/themes/light/champagne.css?url&no-inline";
import limeLight from "../styles/themes/light/lime.css?url&no-inline";
import paletteCatalogStylesheet from "../styles/themes/academy-theme-palettes.css?url&no-inline";
import { DEFAULT_ACADEMY_THEME } from "../themes";

export interface AcademyPaletteStyles {
  dark: string;
  light: string;
}

export const academyPaletteStylesById: Readonly<
  Record<string, AcademyPaletteStyles>
> = {
  codex: { dark: codexDark, light: codexLight },
  ocean: { dark: oceanDark, light: oceanLight },
  midnight: { dark: midnightDark, light: midnightLight },
  graphite: { dark: graphiteDark, light: graphiteLight },
  violet: { dark: violetDark, light: violetLight },
  ember: { dark: emberDark, light: emberLight },
  sunlit: { dark: sunlitDark, light: sunlitLight },
  grove: { dark: groveDark, light: groveLight },
  rose: { dark: roseDark, light: roseLight },
  signal: { dark: signalDark, light: signalLight },
  barbie: { dark: barbieDark, light: barbieLight },
  aurora: { dark: auroraDark, light: auroraLight },
  brainwave: { dark: brainwaveDark, light: brainwaveLight },
  lilac: { dark: lilacDark, light: lilacLight },
  champagne: { dark: champagneDark, light: champagneLight },
  lime: { dark: limeDark, light: limeLight },
};

/**
 * The default palette's stylesheets. The document links these directly (see
 * root.tsx), so they are ordinary parser-discovered, render-blocking
 * stylesheets for everyone who has not picked another palette.
 */
export const defaultAcademyPaletteStyles: AcademyPaletteStyles =
  academyPaletteStylesById[DEFAULT_ACADEMY_THEME]!;

/**
 * Loads the stored palette when it is not the default one. Those links are
 * created by script, which is not render-blocking by itself, so they carry
 * `blocking="render"` to keep the page from flashing the default colors.
 *
 * The default palette deliberately does not go through this path: under
 * Lighthouse a script-inserted `blocking="render"` stylesheet held the first
 * frame back by one to two seconds after everything had loaded.
 */
export function getAcademyPaletteStylesheetBootstrapScript(): string {
  return `(()=>{try{const d=${JSON.stringify(DEFAULT_ACADEMY_THEME)},p=document.documentElement.dataset.palette||d,all=${JSON.stringify(academyPaletteStylesById)},css=all[p];if(p===d||!css)return;for(const mode of ["dark","light"]){const link=document.createElement("link");link.rel="stylesheet";link.href=css[mode];link.dataset.academyPaletteStyle=p;link.dataset.academyPaletteMode=mode;link.setAttribute("blocking","render");document.head.append(link)}}catch{}})();`;
}

let paletteCatalogLoad: Promise<void> | null = null;

function loadAcademyPaletteStylesheet(
  palette: string,
  mode: "dark" | "light",
  href: string,
): Promise<void> {
  const selector = `link[data-academy-palette-style="${palette}"][data-academy-palette-mode="${mode}"]`;
  const existing = document.querySelector<HTMLLinkElement>(selector);
  if (existing?.sheet) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const link = existing ?? document.createElement("link");
    link.addEventListener("load", () => resolve(), { once: true });
    link.addEventListener(
      "error",
      () => reject(new Error(`Could not load the ${palette} ${mode} palette`)),
      { once: true },
    );
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.academyPaletteStyle = palette;
    link.dataset.academyPaletteMode = mode;
    if (!existing) document.head.append(link);
  });
}

export function ensureAcademyPaletteStylesheets(
  paletteId: string,
): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const palette = academyPaletteStylesById[paletteId]
    ? paletteId
    : DEFAULT_ACADEMY_THEME;
  if (
    document.querySelector<HTMLLinkElement>(
      "link[data-academy-palette-catalog]",
    )?.sheet
  ) {
    return Promise.resolve();
  }

  const styles =
    academyPaletteStylesById[palette] ??
    academyPaletteStylesById[DEFAULT_ACADEMY_THEME]!;
  return Promise.all([
    loadAcademyPaletteStylesheet(palette, "dark", styles.dark),
    loadAcademyPaletteStylesheet(palette, "light", styles.light),
  ]).then(() => undefined);
}

export function ensureAcademyPaletteCatalogStylesheet(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const existing = document.querySelector<HTMLLinkElement>(
    "link[data-academy-palette-catalog]",
  );
  if (existing?.sheet) return Promise.resolve();
  if (paletteCatalogLoad) return paletteCatalogLoad;

  paletteCatalogLoad = new Promise<void>((resolve, reject) => {
    const link = existing ?? document.createElement("link");
    const finish = () => resolve();
    const fail = () =>
      reject(new Error("Could not load academy theme palettes"));
    link.addEventListener("load", finish, { once: true });
    link.addEventListener("error", fail, { once: true });
    link.rel = "stylesheet";
    link.href = paletteCatalogStylesheet;
    link.dataset.academyPaletteCatalog = "true";
    if (!existing) document.head.append(link);
  }).catch((error: unknown) => {
    paletteCatalogLoad = null;
    throw error;
  });

  return paletteCatalogLoad;
}
