// Brings the public pages of a few courses up to date inside an existing
// production build, without building the site again. A full build renders
// every page of every course (well over a thousand); after an admin edits
// one course only that course's pages, the catalogue and the home page can
// have changed.
//
//   node scripts/refresh-course-static-pages.mjs --course-id <uuid>[,<uuid>...]
//
// (or COURSE_STATIC_COURSE_IDS). It needs the build the site was deployed
// from in build/ (client and server) and the dependencies it was built
// with. Pages are rendered by that build's own server bundle, as React
// Router's prerender renders them, so they reference the deployed assets.
//
// For each course still in the public catalogue it renders the course page,
// `/learn/<course>` and every lesson page, and removes lesson pages beyond
// the course's lesson count. A course page or lesson folder whose course is
// no longer in the catalogue (unpublished, or its slug changed) is removed.
// Then the new pages get their critical CSS and the courses their
// curriculum files, as in the full build (build-performance.mjs).
//
// In GitHub Actions it writes `changed=true|false` to GITHUB_OUTPUT.

import {
  appendFile,
  mkdir,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inlineCriticalCss } from "./inline-critical-css.mjs";
import { writeStaticCurricula } from "./write-static-curricula.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const buildDirectory = path.join(appDirectory, "build");
const clientDirectory = path.join(buildDirectory, "client");
const serverBuildPath = path.join(buildDirectory, "server", "index.js");
const renderOrigin = "http://localhost";
/** Pages rendered at once; each mostly waits on the API. */
const RENDER_CONCURRENCY = Math.max(
  1,
  Number(process.env.VEO_PRERENDER_CONCURRENCY) || 6,
);
/** As `CURRICULUM_LECTURE_COUNT_MAX` in src/learning/curriculumSize.ts. */
const LECTURE_COUNT_MAX = 1000;
/** Pages every course appears on. */
const SHARED_PAGES = ["/", "/courses"];

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) continue;
    const next = argv[index + 1];
    values.set(current.slice(2), next && !next.startsWith("--") ? next : true);
    if (next && !next.startsWith("--")) index += 1;
  }
  return values;
}

function apiBaseUrl() {
  const configured =
    process.env.STATIC_BUILD_API_URL ||
    process.env.VEO_PUBLIC_API_BASE_URL ||
    process.env.VITE_API_BASE_URL;
  if (!configured) {
    throw new Error("Set STATIC_BUILD_API_URL to the public API, with /v1.");
  }
  const normalized = configured
    .replace(/\/+$/u, "")
    .replace(/\/api\/v1$/u, "/v1");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function unwrap(payload) {
  return payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
    ? payload.data
    : payload;
}

async function fetchJson(url) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status === 404) return null;
      if (response.ok) return unwrap(await response.json());
      if (response.status < 500 || attempt >= 3) {
        throw new Error(`${url} answered ${response.status}.`);
      }
    } catch (error) {
      if (attempt >= 3) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
}

/** Every course in the public catalogue, as the full build finds them. */
async function fetchPublishedCourses(base) {
  const courses = [];
  let cursor;
  do {
    const url = new URL(`${base}/courses`);
    url.searchParams.set("limit", "60");
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await fetchJson(url);
    if (!page || !Array.isArray(page.courses)) {
      throw new Error("The public course catalogue response is invalid.");
    }
    courses.push(...page.courses);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return courses;
}

async function fetchLessonCount(base, slug) {
  const curriculum = await fetchJson(
    `${base}/courses/${encodeURIComponent(slug)}/curriculum`,
  );
  if (!curriculum) return 0;
  const count = curriculum.sections.reduce(
    (total, section) => total + (section.lessons?.length ?? 0),
    0,
  );
  return Math.min(count, LECTURE_COUNT_MAX);
}

function validateSlug(slug) {
  if (
    typeof slug !== "string" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/iu.test(slug)
  ) {
    throw new Error(`Invalid course slug: ${String(slug)}`);
  }
}

/** A file under build/client, never outside it. */
function clientPath(relativePath) {
  const result = path.resolve(clientDirectory, relativePath);
  const relative = path.relative(clientDirectory, result);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside the static build: ${relative}`);
  }
  return result;
}

/** Where React Router's prerender writes a page and its data. */
function pageFiles(pathname) {
  const page = pathname === "/" ? "" : pathname.slice(1);
  return {
    html: clientPath(path.join(page, "index.html")),
    data: clientPath(pathname === "/" ? "_.data" : `${page}.data`),
  };
}

/**
 * A page as it reads without the time it was built: a lesson page's data
 * carries `builtAt` (src/learning/staticLessonPage.ts), escaped once more
 * inside the HTML.
 */
function withoutBuildTime(contents) {
  return contents?.replace(/(builtAt(?:\\*"),)\d+/gu, "$1") ?? null;
}

async function readIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function listDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  return entries.filter((entry) => entry.isDirectory()).map(({ name }) => name);
}

/** Removes a page (or a course's folder) and says whether anything was there. */
async function removeIfPresent(target) {
  const existed = await readdir(path.dirname(target))
    .then((names) => names.includes(path.basename(target)))
    .catch(() => false);
  if (existed) await rm(target, { recursive: true, force: true });
  return existed;
}

async function mapWithConcurrency(items, concurrency, operation) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next];
        next += 1;
        await operation(item);
      }
    },
  );
  await Promise.all(workers);
}

/**
 * The pages a course's files say it had: its course page and its lesson
 * folders, by slug. Folders named like none of our pages are left alone.
 */
async function builtCourseSlugs() {
  const slugs = new Set();
  for (const name of await listDirectories(clientPath("courses"))) {
    if (await readIfExists(clientPath(`courses/${name}/overview/index.html`))) {
      slugs.add(decodeURIComponent(name));
    }
  }
  for (const name of await listDirectories(clientPath("learn"))) {
    slugs.add(decodeURIComponent(name));
  }
  return slugs;
}

async function main() {
  const args = readArguments(process.argv.slice(2));
  const requested = String(
    process.env.COURSE_STATIC_COURSE_IDS ||
      process.env.COURSE_STATIC_COURSE_ID ||
      args.get("course-id") ||
      "",
  )
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  if (requested.length === 0) {
    throw new Error("Pass --course-id <uuid>[,<uuid>...].");
  }

  // The server bundle reads its data only while building (see
  // loadAcademyStaticPageData), and React Router hands a page's data to its
  // HTML render only for build requests.
  process.env.VEO_REACT_ROUTER_BUILD = "true";
  process.env.IS_RR_BUILD_REQUEST = "yes";
  const [build, { createRequestHandler }] = await Promise.all([
    import(pathToFileURL(serverBuildPath).href),
    import("react-router"),
  ]);
  const base = apiBaseUrl();
  const published = await fetchPublishedCourses(base);
  const publishedSlugs = new Set(published.map(({ slug }) => slug));
  const courses = published.filter(({ id }) =>
    requested.includes(String(id).toLowerCase()),
  );

  let changed = false;
  // Courses no longer in the catalogue: unpublished, deleted or renamed.
  for (const slug of await builtCourseSlugs()) {
    if (publishedSlugs.has(slug)) continue;
    const encoded = encodeURIComponent(slug);
    const removed = await Promise.all([
      removeIfPresent(clientPath(`courses/${encoded}`)),
      removeIfPresent(clientPath(`learn/${encoded}`)),
      removeIfPresent(clientPath(`learn/${encoded}.data`)),
      removeIfPresent(clientPath(`static/courses/${encoded}`)),
    ]);
    if (removed.some(Boolean)) {
      changed = true;
      console.log(`Removed the pages of ${slug}: not in the catalogue`);
    }
  }

  const paths = [...SHARED_PAGES];
  for (const { slug } of courses) {
    validateSlug(slug);
    const encoded = encodeURIComponent(slug);
    const lessonCount = await fetchLessonCount(base, slug);
    paths.push(`/courses/${encoded}/overview`);
    if (lessonCount > 0) paths.push(`/learn/${encoded}`);
    for (let lesson = 1; lesson <= lessonCount; lesson += 1) {
      paths.push(`/learn/${encoded}/lecture-${lesson}`);
    }
    // Lessons the course no longer has.
    for (const name of await listDirectories(clientPath(`learn/${encoded}`))) {
      const lesson = /^lecture-(\d+)$/u.exec(name)?.[1];
      if (!lesson || Number(lesson) <= lessonCount) continue;
      await rm(clientPath(`learn/${encoded}/${name}`), {
        recursive: true,
        force: true,
      });
      await rm(clientPath(`learn/${encoded}/${name}.data`), { force: true });
      changed = true;
      console.log(`Removed /learn/${encoded}/${name}: past the last lesson`);
    }
    if (lessonCount === 0) {
      if (await removeIfPresent(clientPath(`learn/${encoded}`))) {
        await rm(clientPath(`learn/${encoded}.data`), { force: true });
        changed = true;
        console.log(`Removed /learn/${encoded}: no published lessons`);
      }
    }
    console.log(`${slug}: course page and ${lessonCount} lesson pages`);
  }

  // The server build answers only the paths it was built with; a new
  // lesson or course is added to its list.
  for (const pathname of paths) {
    if (!build.prerender.includes(pathname)) build.prerender.push(pathname);
  }
  const handler = createRequestHandler(build, "production");

  const rendered = new Map();
  await mapWithConcurrency(paths, RENDER_CONCURRENCY, async (pathname) => {
    const dataUrl = new URL(
      pathname === "/" ? "/_.data" : `${pathname}.data`,
      renderOrigin,
    );
    const dataResponse = await handler(new Request(dataUrl));
    if (dataResponse.status !== 200 && dataResponse.status !== 202) {
      throw new Error(
        `${pathname} data render failed (${dataResponse.status}).`,
      );
    }
    const data = await dataResponse.text();
    const headers = new Headers();
    const encodedData = encodeURI(data);
    if (encodedData.length < 8 * 1024) {
      headers.set("X-React-Router-Prerender-Data", encodedData);
    }
    const htmlUrl = new URL(
      `${pathname}/`.replace(/\/\/+/gu, "/"),
      renderOrigin,
    );
    const htmlResponse = await handler(new Request(htmlUrl, { headers }));
    const html = await htmlResponse.text();
    if (htmlResponse.status !== 200) {
      throw new Error(
        `${pathname} HTML render failed (${htmlResponse.status}).`,
      );
    }
    if (!html.includes("window.__reactRouterContext =")) {
      throw new Error(`Rendered HTML for ${pathname} is missing router data.`);
    }
    rendered.set(pathname, { html, data });
  });

  // Written over the old files; the old ones are kept to tell whether the
  // finished page (with its critical CSS) differs.
  const previous = new Map();
  for (const [pathname, { html, data }] of rendered) {
    const files = pageFiles(pathname);
    previous.set(pathname, {
      html: await readIfExists(files.html),
      data: await readIfExists(files.data),
    });
    await mkdir(path.dirname(files.html), { recursive: true });
    await writeFile(files.html, html, "utf8");
    await writeFile(files.data, data, "utf8");
  }

  // Only the pages written above are processed; the others already were.
  await inlineCriticalCss(clientDirectory, { quiet: true });
  await writeStaticCurricula(clientDirectory, base, {
    onlySlugs: courses.map(({ slug }) => slug),
  });

  // A course's change shows on its own pages. The catalogue and the home
  // page are deployed with them; on their own they differ only by the time
  // they were built (the home page's clock), which is no reason to deploy.
  let updatedPages = 0;
  for (const [pathname, before] of previous) {
    const files = pageFiles(pathname);
    const [html, data] = await Promise.all([
      readIfExists(files.html),
      readIfExists(files.data),
    ]);
    if (
      withoutBuildTime(html) !== withoutBuildTime(before.html) ||
      withoutBuildTime(data) !== withoutBuildTime(before.data)
    ) {
      updatedPages += 1;
      console.log(`Updated ${pathname}`);
      if (!SHARED_PAGES.includes(pathname)) changed = true;
    }
  }
  console.log(
    `${updatedPages} of ${rendered.size} pages changed for ${courses.length} of ${requested.length} requested courses.`,
  );
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
  if (!changed) console.log("No public page changes to deploy.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
