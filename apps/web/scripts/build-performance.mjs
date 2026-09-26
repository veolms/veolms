import { spawn } from "node:child_process";
import { access, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPreviewBuildFingerprint } from "./preview-build-fingerprint.mjs";

export const FIRST_SECTION_FLAG = "--first-section";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reactRouterCli = path.resolve(
  scriptDirectory,
  "../node_modules/@react-router/dev/bin.cjs",
);
const appRoot = path.resolve(scriptDirectory, "..");
const workspaceRoot = path.resolve(scriptDirectory, "../../..");
const buildDirectory = path.join(appRoot, "build");
const requiredPreviewFiles = [
  "index.html",
  "courses/index.html",
  "catalogue/index.html",
  "settings/profile/index.html",
  "__spa-fallback.html",
  "../server/index.js",
];

const publishBuild = async (stagingBuildDirectory) => {
  const swapDirectory = await mkdtemp(path.join(appRoot, ".build-swap-"));
  const previousBuildDirectory = path.join(swapDirectory, "previous");
  let previousBuildMoved = false;
  let preserveSwapDirectory = false;

  try {
    try {
      await access(buildDirectory);
      await rename(buildDirectory, previousBuildDirectory);
      previousBuildMoved = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    await rename(stagingBuildDirectory, buildDirectory);
  } catch (error) {
    if (previousBuildMoved) {
      try {
        await rename(previousBuildDirectory, buildDirectory);
        previousBuildMoved = false;
      } catch (restoreError) {
        preserveSwapDirectory = true;
        throw new AggregateError(
          [error, restoreError],
          "Could not publish the new build or restore the previous build; the previous build is preserved in the swap directory.",
        );
      }
    }
    throw error;
  } finally {
    if (!preserveSwapDirectory) {
      try {
        await rm(swapDirectory, { recursive: true, force: true });
      } catch (error) {
        console.warn(
          `Could not remove the temporary build-swap directory: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
};

const firstSectionRequested = process.argv.includes(FIRST_SECTION_FLAG);
const environmentFiles = firstSectionRequested
  ? [".env", ".env.production"]
  : [".env.production", ".env"];

for (const environmentFile of environmentFiles) {
  try {
    // Preview builds use the local API target first; release builds use the
    // production API target first. Explicit CI/deployment env still wins.
    process.loadEnvFile(path.join(workspaceRoot, environmentFile));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

const readCourseLcpPreload = async (apiBase) => {
  let requestUrl = apiBase;
  let publicCoursesAvailable = false;
  let courseSlugs = [];
  try {
    const url = new URL(apiBase);
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    const pathSegments = url.pathname.split("/").filter(Boolean);
    while (["api", "v1"].includes(pathSegments.at(-1))) {
      pathSegments.pop();
    }
    const prefix = `/${[...pathSegments, "v1"].join("/")}`;
    url.pathname = `${prefix}/courses`.replace(/\/{2,}/g, "/");
    url.search = "limit=50";
    requestUrl = url.toString();
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`course list returned ${response.status}`);
    }
    const payload = await response.json();
    const data =
      payload &&
      typeof payload === "object" &&
      "data" in payload &&
      payload.data
        ? payload.data
        : payload;
    if (!Array.isArray(data?.courses)) {
      throw new Error("course list response had an invalid shape");
    }
    const courses = data.courses;
    courseSlugs = courses
      .map((course) => course?.slug)
      .filter((slug) => typeof slug === "string" && slug.length > 0);
    publicCoursesAvailable = true;
    const courseIndex = courses.findIndex(
      (item) => item && typeof item.thumbnailUrl === "string",
    );
    const course = courseIndex >= 0 ? courses[courseIndex] : null;
    if (!course) {
      return { preload: "", courseSlugs };
    }
    const variants = Array.isArray(course.thumbnailSrcSet)
      ? course.thumbnailSrcSet.filter(
          (variant) =>
            variant &&
            typeof variant.url === "string" &&
            typeof variant.width === "number" &&
            variant.width > 0,
        )
      : [];
    const preferred =
      variants.find((variant) => variant.width === 640) ||
      variants
        .filter((variant) => variant.width >= 640)
        .sort((left, right) => left.width - right.width)[0] ||
      variants.sort((left, right) => right.width - left.width)[0];
    const src = preferred?.url || course.thumbnailUrl;
    if (typeof src !== "string" || !src) {
      return { preload: "", courseSlugs };
    }
    const probe = await fetch(src, { signal: AbortSignal.timeout(8_000) });
    await probe.body?.cancel();
    if (!probe.ok) {
      throw new Error(`thumbnail returned ${probe.status}`);
    }
    return {
      preload: JSON.stringify({
        src,
        srcSet: variants
          .map((variant) => `${variant.url} ${variant.width}w`)
          .join(", "),
        index: courseIndex,
      }),
      courseSlugs,
    };
  } catch (error) {
    if (!publicCoursesAvailable) {
      throw new Error(
        `Could not load the public course catalogue for SSG from ${requestUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    console.warn(
      `Course LCP image was not baked into the document: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { preload: "", courseSlugs };
  }
};

export const runPerformanceBuild = async (args = process.argv.slice(2)) => {
  const firstSectionOnly = args.includes(FIRST_SECTION_FLAG);
  const reactRouterArgs = args.filter(
    (argument) => argument !== FIRST_SECTION_FLAG,
  );
  const scope = firstSectionOnly ? "first-section" : "all-lectures";
  const publicCourseBuildApiBase =
    process.env.VEO_PUBLIC_API_BASE_URL ||
    process.env.STATIC_BUILD_API_URL ||
    "http://127.0.0.1:4000/v1";
  const {
    preload: courseLcpPreload,
    courseSlugs: publicCourseSlugs,
  } = await readCourseLcpPreload(publicCourseBuildApiBase);
  const stagingBuildDirectory = await mkdtemp(
    path.join(appRoot, ".build-staging-"),
  );
  const stagingBuildDirectoryName = path.basename(stagingBuildDirectory);
  const stagingClientBuildDirectory = path.join(
    stagingBuildDirectory,
    "client",
  );
  const stagingPreviewMetadataPath = path.join(
    stagingClientBuildDirectory,
    ".veolms-preview-build.json",
  );
  const buildEnvironment = {
    ...process.env,
    NODE_ENV: "production",
    VEO_LEARNING_PRERENDER_SCOPE: scope,
    VEO_BUILD_DIRECTORY: stagingBuildDirectoryName,
    VEO_COURSE_LCP_PRELOAD: courseLcpPreload,
    VEO_PUBLIC_API_BASE_URL: publicCourseBuildApiBase,
    VEO_PUBLIC_COURSE_SLUGS: JSON.stringify(publicCourseSlugs),
    ...(firstSectionOnly ? { VITE_API_BASE_URL: "/v1" } : {}),
  };
  if (courseLcpPreload) {
    console.log("Baked the first course thumbnail into the courses document.");
  }
  const sourceFingerprint = await getPreviewBuildFingerprint(workspaceRoot, {
    learningPrerenderScope: scope,
    environment: buildEnvironment,
  });

  console.log("Build environment: NODE_ENV=production");
  console.log(`Learning prerender scope: ${scope}`);
  if (firstSectionOnly) {
    console.log("Preview API base: same-origin /v1 proxy");
  }

  try {
    const exitCode = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [reactRouterCli, "build", ...reactRouterArgs],
        {
          cwd: appRoot,
          env: buildEnvironment,
          stdio: "inherit",
        },
      );

      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) {
          reject(new Error(`React Router build stopped with ${signal}.`));
          return;
        }
        resolve(code ?? 1);
      });
    });

    if (exitCode !== 0) return exitCode;

    try {
      await Promise.all(
        requiredPreviewFiles.map((file) =>
          access(path.join(stagingClientBuildDirectory, file)),
        ),
      );
      const latestFingerprint = await getPreviewBuildFingerprint(
        workspaceRoot,
        {
          learningPrerenderScope: scope,
          environment: buildEnvironment,
        },
      );
      if (latestFingerprint !== sourceFingerprint) {
        throw new Error("source files changed while the build was running");
      }
      await writeFile(
        stagingPreviewMetadataPath,
        `${JSON.stringify(
          {
            version: 1,
            nodeEnv: "production",
            learningPrerenderScope: scope,
            sourceFingerprint,
            completedAt: new Date().toISOString(),
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    } catch (error) {
      throw new Error(
        `Build exited successfully but required production preview output is missing: ${error.message}`,
      );
    }

    await publishBuild(stagingBuildDirectory);
    return 0;
  } finally {
    try {
      await rm(stagingBuildDirectory, { recursive: true, force: true });
    } catch (error) {
      console.warn(
        `Could not remove the temporary build directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
};

const isDirectInvocation =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  process.exitCode = await runPerformanceBuild();
}
