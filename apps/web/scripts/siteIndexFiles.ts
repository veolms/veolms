import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * `sitemap.xml` and `robots.txt` for the built site
 * (creator-features/39-sales-page-sections-plan.md): the public pages
 * search engines should find, under the site's own address.
 *
 * Written by the full build (react-router.config.ts `buildEnd`) and again
 * by the per-course refresh (scripts/refresh-course-static-pages.mjs), so a
 * newly published course is listed without a full rebuild. Both need the
 * site's public address (`VITE_SITE_URL`); without it nothing is written
 * and the plain robots.txt from public/ stays.
 *
 * Plain TypeScript (no enums, no parameter properties) so Node runs it as
 * it is from the .mjs refresh script.
 */

/** The public pages besides the courses: home, catalogue, legal pages. */
const PUBLIC_PAGES = [
  "/",
  "/courses",
  "/about",
  "/contact",
  "/terms",
  "/privacy",
  "/policies",
  "/community-guidelines",
];

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");
}

/** The site's origin from `VITE_SITE_URL`, or null when unset or invalid. */
export function siteOriginFrom(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function buildSitemapXml(
  origin: string,
  courseSlugs: readonly string[],
): string {
  const paths = [
    ...PUBLIC_PAGES,
    ...[...courseSlugs]
      .sort()
      .map((slug) => `/courses/${encodeURIComponent(slug)}/overview`),
  ];
  const urls = paths
    .map(
      (pathname) =>
        `  <url><loc>${escapeXml(`${origin}${pathname}`)}</loc></url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(origin: string): string {
  // The rules of public/robots.txt, plus where the sitemap is.
  return [
    "User-agent: *",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");
}

async function writeIfChanged(
  file: string,
  contents: string,
): Promise<boolean> {
  const before = await readFile(file, "utf8").catch(() => null);
  if (before === contents) return false;
  await writeFile(file, contents, "utf8");
  return true;
}

/**
 * Writes both files into the client build folder. Returns whether either
 * changed (the refresh deploys only when something did).
 */
export async function writeSiteIndexFiles({
  clientDirectory,
  siteUrl,
  courseSlugs,
}: {
  clientDirectory: string;
  siteUrl: string | undefined;
  courseSlugs: readonly string[];
}): Promise<boolean> {
  const origin = siteOriginFrom(siteUrl);
  if (!origin) return false;
  const [sitemap, robots] = await Promise.all([
    writeIfChanged(
      path.join(clientDirectory, "sitemap.xml"),
      buildSitemapXml(origin, courseSlugs),
    ),
    writeIfChanged(
      path.join(clientDirectory, "robots.txt"),
      buildRobotsTxt(origin),
    ),
  ]);
  return sitemap || robots;
}
