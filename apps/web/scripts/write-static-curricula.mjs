import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Writes the whole public curriculum of every course the build prerendered
 * a page for, as `static/courses/<slug>/curriculum.json` in the client
 * build. A course page carries its first sections only; the rest is read
 * from this file, served with the site's own pages rather than by the API
 * (see `apps/web/src/courses/staticCurriculum.ts`).
 *
 * A course whose curriculum cannot be read fails the build, as a page that
 * cannot be prerendered does: a site is deployed whole or not at all.
 */
export async function writeStaticCurricula(
  clientBuildDirectory,
  configuredApiUrl = process.env.STATIC_BUILD_API_URL,
) {
  const coursesDirectory = path.join(clientBuildDirectory, "courses");
  const slugs = [];
  for (const entry of await readdir(coursesDirectory, {
    withFileTypes: true,
  }).catch(() => [])) {
    if (!entry.isDirectory()) continue;
    const overviewPage = path.join(
      coursesDirectory,
      entry.name,
      "overview",
      "index.html",
    );
    if (await stat(overviewPage).catch(() => null)) slugs.push(entry.name);
  }

  const apiBaseUrl = getStaticApiBaseUrl(configuredApiUrl);
  for (const directoryName of slugs) {
    const slug = decodeURIComponent(directoryName);
    const curriculum = await fetchCurriculum(apiBaseUrl, slug);
    const target = path.join(
      clientBuildDirectory,
      "static",
      "courses",
      directoryName,
      "curriculum.json",
    );
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(curriculum));
    console.log(
      `Static curriculum: ${slug} (${curriculum.sections.length} sections, version ${curriculum.version})`,
    );
  }
  return slugs.length;
}

function getStaticApiBaseUrl(configuredApiUrl) {
  const configured = configuredApiUrl || "http://127.0.0.1:4000/v1";
  const normalized = configured
    .replace(/\/+$/u, "")
    .replace(/\/api\/v1$/u, "/v1");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

async function fetchCurriculum(apiBaseUrl, slug) {
  const url = `${apiBaseUrl}/courses/${encodeURIComponent(slug)}/curriculum`;
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const body = await response.json();
      const curriculum =
        body && typeof body === "object" && "data" in body ? body.data : body;
      if (
        !curriculum ||
        typeof curriculum.version !== "string" ||
        !Array.isArray(curriculum.sections)
      ) {
        throw new Error("not a course curriculum");
      }
      return curriculum;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(
    `Could not read the public curriculum of ${slug} (${url}): ${
      lastError instanceof Error ? lastError.message : lastError
    }`,
  );
}
