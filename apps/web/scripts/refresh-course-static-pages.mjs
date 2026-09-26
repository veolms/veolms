import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const buildDirectory = path.join(appDirectory, "build");
const clientDirectory = path.join(buildDirectory, "client");
const serverBuildPath = path.join(buildDirectory, "server", "index.js");
const DEFAULT_RENDER_ORIGIN = "https://static-prerender.invalid";
const MAX_INLINE_PRERENDER_DATA_LENGTH = 8 * 1024;

function readArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) continue;
    const next = argv[index + 1];
    values.set(argument.slice(2), next && !next.startsWith("--") ? next : true);
    if (next && !next.startsWith("--")) index += 1;
  }
  return values;
}

function getApiBaseUrl() {
  const configured =
    process.env.VEO_PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL;
  if (!configured || configured.startsWith("/")) {
    throw new Error(
      "Set VEO_PUBLIC_API_BASE_URL to the absolute public API base URL (including /api/v1).",
    );
  }

  const url = new URL(configured);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("VEO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }
  return url.href.endsWith("/") ? url : new URL(`${url.href}/`);
}

function apiUrl(baseUrl, pathname) {
  return new URL(pathname.replace(/^\/+/, ""), baseUrl);
}

async function fetchPublishedCourses(baseUrl) {
  const courses = [];
  let cursor;

  do {
    const url = apiUrl(baseUrl, "courses");
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(
        `Unable to list published courses (${response.status} ${response.statusText}).`,
      );
    }

    const page = await response.json();
    if (!Array.isArray(page.courses)) {
      throw new Error("The public course catalogue response is invalid.");
    }
    courses.push(...page.courses);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return courses;
}

async function resolveCourseSlug(baseUrl, courseId) {
  const response = await fetch(
    apiUrl(baseUrl, `courses/${encodeURIComponent(courseId)}/overview`),
    { headers: { Accept: "application/json" } },
  );
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(
      `Unable to resolve course ${courseId} (${response.status} ${response.statusText}).`,
    );
  }
  const overview = await response.json();
  const slug = overview?.course?.slug;
  if (typeof slug !== "string" || !slug.trim()) {
    throw new Error(`The overview response for ${courseId} has no slug.`);
  }
  return slug;
}

function validateSlug(slug) {
  if (
    typeof slug !== "string" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/i.test(slug)
  ) {
    throw new Error(`Invalid course slug: ${String(slug)}`);
  }
}

function outputPathFor(pathname, extension) {
  const relativePath = `${pathname.slice(1)}${extension}`;
  const outputPath = path.resolve(clientDirectory, relativePath);
  const relativeToClient = path.relative(clientDirectory, outputPath);
  if (relativeToClient.startsWith("..") || path.isAbsolute(relativeToClient)) {
    throw new Error(`Refusing to write outside the static build: ${pathname}`);
  }
  return outputPath;
}

async function writePairAtomically(files) {
  const nonce = randomUUID();
  const staged = [];
  try {
    for (const [outputPath, contents] of files) {
      await mkdir(path.dirname(outputPath), { recursive: true });
      const temporaryPath = `${outputPath}.${nonce}.tmp`;
      await writeFile(temporaryPath, contents, "utf8");
      staged.push([temporaryPath, outputPath]);
    }
    for (const [temporaryPath, outputPath] of staged) {
      await rename(temporaryPath, outputPath);
    }
  } catch (error) {
    await Promise.all(
      staged.map(([temporaryPath]) => rm(temporaryPath, { force: true })),
    );
    throw error;
  }
}

async function main() {
  const args = readArguments(process.argv.slice(2));
  const isAll = args.has("all");
  const courseId = process.env.COURSE_STATIC_COURSE_ID || args.get("course-id");
  const requestedSlug =
    process.env.COURSE_STATIC_COURSE_SLUG || args.get("course-slug");

  if (!isAll && typeof courseId !== "string") {
    throw new Error("Pass --course-id <id> or --all.");
  }

  const [build, { createRequestHandler }] = await Promise.all([
    import(pathToFileURL(serverBuildPath).href),
    import("react-router"),
  ]);
  if (!Array.isArray(build.prerender)) {
    throw new Error(
      "The React Router server build has no prerender path list.",
    );
  }

  const publicPaths = ["/catalogue"];
  let coursesToRender = [];
  const baseUrl = getApiBaseUrl();
  if (isAll) {
    coursesToRender = await fetchPublishedCourses(baseUrl);
  } else {
    const slug =
      typeof requestedSlug === "string"
        ? requestedSlug
        : await resolveCourseSlug(baseUrl, courseId);
    if (slug) coursesToRender = [{ id: courseId, slug }];
  }

  for (const course of coursesToRender) {
    validateSlug(course.slug);
    publicPaths.push(`/catalogue/${encodeURIComponent(course.slug)}/overview`);
  }
  for (const publicPath of publicPaths) {
    if (!build.prerender.includes(publicPath)) build.prerender.push(publicPath);
  }

  const handler = createRequestHandler(build, "production");

  async function renderRoute(pathname) {
    const apiSnapshots = new Map();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input);
      const snapshot = apiSnapshots.get(requestUrl);
      if (snapshot) {
        return new Response(snapshot.body.slice(0), {
          status: snapshot.status,
          statusText: snapshot.statusText,
          headers: snapshot.headers,
        });
      }

      const response = await originalFetch(input, init);
      if (requestUrl.startsWith(baseUrl.href) && response.ok) {
        const headers = new Headers(response.headers);
        headers.delete("content-encoding");
        headers.delete("content-length");
        apiSnapshots.set(requestUrl, {
          body: await response.clone().arrayBuffer(),
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    };

    try {
      const dataUrl = new URL(`${pathname}.data`, DEFAULT_RENDER_ORIGIN);
      const dataResponse = await handler(
        new Request(dataUrl, { headers: { Accept: "text/x-script" } }),
      );

      if (dataResponse.status === 404 && pathname !== "/courses") {
        await Promise.all([
          rm(outputPathFor(`${pathname}/index`, ".html"), { force: true }),
          rm(outputPathFor(pathname, ".data"), { force: true }),
        ]);
        return;
      }
      if (dataResponse.status !== 200) {
        throw new Error(
          `React Router data render failed for ${pathname} (${dataResponse.status}).`,
        );
      }
      const data = await dataResponse.text();

      const htmlPathname = pathname.endsWith("/") ? pathname : `${pathname}/`;
      const htmlHeaders = new Headers();
      const encodedData = encodeURI(data);
      if (encodedData.length < MAX_INLINE_PRERENDER_DATA_LENGTH) {
        htmlHeaders.set("X-React-Router-Prerender-Data", encodedData);
      }
      const htmlResponse = await handler(
        new Request(new URL(htmlPathname, DEFAULT_RENDER_ORIGIN), {
          headers: htmlHeaders,
        }),
      );
      if (htmlResponse.status !== 200) {
        throw new Error(
          `React Router HTML render failed for ${pathname} (${htmlResponse.status}).`,
        );
      }
      const html = await htmlResponse.text();
      if (!html.includes("window.__reactRouterContext =")) {
        throw new Error(
          `Rendered HTML for ${pathname} is missing router data.`,
        );
      }

      await writePairAtomically([
        [outputPathFor(`${pathname}/index`, ".html"), html],
        [outputPathFor(pathname, ".data"), data],
      ]);
      console.log(`Updated ${pathname}/index.html and ${pathname}.data`);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  await renderRoute("/catalogue");
  for (const course of coursesToRender) {
    await renderRoute(`/catalogue/${encodeURIComponent(course.slug)}/overview`);
  }

  if (!isAll && coursesToRender.length === 0) {
    console.log(`Course ${courseId} is no longer public; refreshed /catalogue.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
