import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inlineCriticalCss } from "./inline-critical-css.mjs";
import { writeStaticCurricula } from "./write-static-curricula.mjs";

export const FIRST_SECTION_FLAG = "--first-section";
export const NO_LESSONS_FLAG = "--no-lessons";
export const LEARNING_PRERENDER_FLAGS = [FIRST_SECTION_FLAG, NO_LESSONS_FLAG];
/**
 * `--lessons=<course>:<count>[,<course>:<count>]`: lesson pages for those
 * courses only, their first <count> lessons each. For trying lesson pages
 * locally without building every lesson of every course.
 */
export const ONLY_LESSONS_PREFIX = "--lessons=";
export const isLearningPrerenderArgument = (argument) =>
  LEARNING_PRERENDER_FLAGS.includes(argument) ||
  argument.startsWith(ONLY_LESSONS_PREFIX);

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reactRouterCli = path.resolve(
  scriptDirectory,
  "../node_modules/@react-router/dev/bin.cjs",
);
const workspaceRoot = path.resolve(scriptDirectory, "../..");
const clientBuildDirectory = path.resolve(scriptDirectory, "../build/client");

for (const environmentFile of [".env.production", ".env"]) {
  try {
    // Node does not overwrite an existing process.env value, so an explicit
    // CI/deployment variable still wins over the checked-in production URL.
    process.loadEnvFile(path.join(workspaceRoot, environmentFile));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

if (process.env.STATIC_BUILD_API_URL) {
  process.env.STATIC_BUILD_API_URL = process.env.STATIC_BUILD_API_URL.replace(
    "localhost",
    "127.0.0.1",
  );
}
if (process.env.VITE_API_BASE_URL) {
  process.env.VITE_API_BASE_URL = process.env.VITE_API_BASE_URL.replace(
    "localhost",
    "127.0.0.1",
  );
}

export const runPerformanceBuild = async (
  args = process.argv.slice(2),
  environmentOverrides = {},
) => {
  const reactRouterArgs = args.filter(
    (argument) => !isLearningPrerenderArgument(argument),
  );
  const onlyLessons =
    args
      .find((argument) => argument.startsWith(ONLY_LESSONS_PREFIX))
      ?.slice(ONLY_LESSONS_PREFIX.length) ?? "";
  // Skipping lessons entirely wins when both flags are passed; a list of
  // courses builds every lesson it asks for.
  const scope = args.includes(NO_LESSONS_FLAG)
    ? "none"
    : onlyLessons
      ? "all-lectures"
      : args.includes(FIRST_SECTION_FLAG)
        ? "first-section"
        : "all-lectures";

  console.log(
    `Learning prerender scope: ${scope}${onlyLessons ? ` (only ${onlyLessons})` : ""}`,
  );

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [reactRouterCli, "build", ...reactRouterArgs],
      {
        env: {
          ...process.env,
          VEO_LEARNING_PRERENDER_SCOPE: scope,
          VEO_LEARNING_PRERENDER_ONLY: onlyLessons,
          VEO_REACT_ROUTER_BUILD: "true",
          ...environmentOverrides,
        },
        stdio: "inherit",
      },
    );

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`React Router build stopped with ${signal}.`));
        return;
      }
      if (code !== 0) {
        resolve(code ?? 1);
        return;
      }
      // Prerendered pages paint from inline critical CSS instead of waiting
      // for the app's large stylesheets. A page that cannot be processed
      // fails the build rather than shipping half-rewritten.
      inlineCriticalCss(clientBuildDirectory)
        // Each course page's whole curriculum, beside the page.
        .then(() =>
          writeStaticCurricula(
            clientBuildDirectory,
            // The API the pages were just built from.
            environmentOverrides.STATIC_BUILD_API_URL ??
              process.env.STATIC_BUILD_API_URL,
          ),
        )
        .then(
          () => resolve(0),
          (error) => {
            console.error(error instanceof Error ? error.message : error);
            resolve(1);
          },
        );
    });
  });
};

const isDirectInvocation =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  process.exitCode = await runPerformanceBuild();
}
