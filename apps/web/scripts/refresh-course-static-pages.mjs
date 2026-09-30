import { randomUUID } from "node:crypto";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, "..");
const buildDirectory = path.join(appDirectory, "build");
const clientDirectory = path.join(buildDirectory, "client");
const serverBuildPath = path.join(buildDirectory, "server", "index.js");
const renderOrigin = "https://static-prerender.invalid";

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
    process.env.VEO_PUBLIC_API_BASE_URL || process.env.VITE_API_BASE_URL;
  if (!configured) {
    throw new Error(
      "Set VEO_PUBLIC_API_BASE_URL to the public API URL, including /v1.",
    );
  }
  const result = new URL(configured);
  if (result.protocol !== "http:" && result.protocol !== "https:") {
    throw new Error("VEO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }
  return result.href.endsWith("/") ? result : new URL(`${result.href}/`);
}

function apiUrl(base, pathname) {
  return new URL(pathname.replace(/^\/+/, ""), base);
}

function unwrap(payload) {
  return payload && typeof payload === "object" && "data" in payload
    ? payload.data
    : payload;
}

async function fetchPublishedCourses(base) {
  const result = [];
  let cursor;
  do {
    const url = apiUrl(base, "courses");
    url.searchParams.set("limit", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Course catalogue request failed (${response.status}).`);
    }
    const page = unwrap(await response.json());
    if (!page || !Array.isArray(page.courses)) {
      throw new Error("The public course catalogue response is invalid.");
    }
    result.push(...page.courses);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return result;
}

async function resolveCourseSlug(base, courseId) {
  const response = await fetch(
    apiUrl(base, `courses/${encodeURIComponent(courseId)}/overview`),
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Course overview request failed (${response.status}).`);
  }
  const overview = unwrap(await response.json());
  if (typeof overview?.course?.slug !== "string") {
    throw new Error("The course overview response has no slug.");
  }
  return overview.course.slug;
}

function validateSlug(slug) {
  if (
    typeof slug !== "string" ||
    !/^[a-z0-9](?:[a-z0-9-]{0,158}[a-z0-9])?$/iu.test(slug)
  ) {
    throw new Error(`Invalid course slug: ${String(slug)}`);
  }
}

function outputPath(pathname, extension) {
  const relativePath = `${pathname.slice(1)}${extension}`;
  const result = path.resolve(clientDirectory, relativePath);
  const relative = path.relative(clientDirectory, result);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside the static build: ${pathname}`);
  }
  return result;
}

async function writePairAtomically(files) {
  const staged = [];
  const nonce = randomUUID();
  try {
    for (const [destination, contents] of files) {
      await mkdir(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.${nonce}.tmp`;
      await writeFile(temporary, contents, "utf8");
      staged.push([temporary, destination]);
    }
    for (const [temporary, destination] of staged) {
      await rename(temporary, destination);
    }
  } catch (error) {
    await Promise.all(
      staged.map(([temporary]) => rm(temporary, { force: true })),
    );
    throw error;
  }
}

async function readFileIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const args = readArguments(process.argv.slice(2));
  const all = args.has("all");
  const courseId = process.env.COURSE_STATIC_COURSE_ID || args.get("course-id");
  const requestedSlug =
    process.env.COURSE_STATIC_COURSE_SLUG || args.get("course-slug");
  if (!all && typeof courseId !== "string") {
    throw new Error("Pass --course-id <id> or --all.");
  }

  const [build, { createRequestHandler }] = await Promise.all([
    import(pathToFileURL(serverBuildPath).href),
    import("react-router"),
  ]);
  const base = apiBaseUrl();
  const courses = all
    ? await fetchPublishedCourses(base)
    : [
        {
          id: courseId,
          slug:
            typeof requestedSlug === "string"
              ? requestedSlug
              : await resolveCourseSlug(base, courseId),
        },
      ].filter((course) => typeof course.slug === "string");
  const paths = ["/explore-courses"];
  for (const course of courses) {
    validateSlug(course.slug);
    paths.push(`/explore-courses/${encodeURIComponent(course.slug)}`);
  }

  const handler = createRequestHandler(build, "production");
  let changed = false;
  for (const pathname of paths) {
    const snapshots = new Map();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      const cached = snapshots.get(url);
      if (cached) {
        return new Response(cached.body.slice(0), {
          status: cached.status,
          statusText: cached.statusText,
          headers: cached.headers,
        });
      }
      const response = await originalFetch(input, init);
      if (url.startsWith(base.href) && response.ok) {
        const headers = new Headers(response.headers);
        headers.delete("content-encoding");
        headers.delete("content-length");
        snapshots.set(url, {
          body: await response.clone().arrayBuffer(),
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
      return response;
    };

    try {
      const dataResponse = await handler(
        new Request(new URL(`${pathname}.data`, renderOrigin), {
          headers: { Accept: "text/x-script" },
        }),
      );
      const htmlPath = outputPath(`${pathname}/index`, ".html");
      const dataPath = outputPath(pathname, ".data");
      if (dataResponse.status === 404 && pathname !== "/courses") {
        const [existingHtml, existingData] = await Promise.all([
          readFileIfExists(htmlPath),
          readFileIfExists(dataPath),
        ]);
        await Promise.all([
          rm(htmlPath, { force: true }),
          rm(dataPath, { force: true }),
        ]);
        if (existingHtml !== null || existingData !== null) {
          changed = true;
          console.log(`Removed unpublished course page ${pathname}`);
        } else {
          console.log(`No published course page exists for ${pathname}`);
        }
        continue;
      }
      if (!dataResponse.ok) {
        throw new Error(
          `${pathname}.data render failed (${dataResponse.status}).`,
        );
      }
      const data = await dataResponse.text();
      const htmlResponse = await handler(
        new Request(new URL(`${pathname}/`, renderOrigin)),
      );
      if (!htmlResponse.ok) {
        throw new Error(
          `${pathname} HTML render failed (${htmlResponse.status}).`,
        );
      }
      const html = await htmlResponse.text();
      if (!html.includes("window.__reactRouterContext =")) {
        throw new Error(
          `Rendered HTML for ${pathname} is missing router data.`,
        );
      }
      const [existingHtml, existingData] = await Promise.all([
        readFileIfExists(htmlPath),
        readFileIfExists(dataPath),
      ]);
      if (existingHtml !== html || existingData !== data) {
        await writePairAtomically([
          [htmlPath, html],
          [dataPath, data],
        ]);
        changed = true;
        console.log(`Updated ${pathname}/index.html and ${pathname}.data`);
      } else {
        console.log(`No content changes for ${pathname}`);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
  if (!changed) console.log("No public static asset changes to deploy.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
