import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIRST_SECTION_FLAG = "--first-section";
export const NO_LESSONS_FLAG = "--no-lessons";
export const LEARNING_PRERENDER_FLAGS = [FIRST_SECTION_FLAG, NO_LESSONS_FLAG];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reactRouterCli = path.resolve(
  scriptDirectory,
  "../node_modules/@react-router/dev/bin.cjs",
);
const workspaceRoot = path.resolve(scriptDirectory, "../..");

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
    (argument) => !LEARNING_PRERENDER_FLAGS.includes(argument),
  );
  // Skipping lessons entirely wins when both flags are passed.
  const scope = args.includes(NO_LESSONS_FLAG)
    ? "none"
    : args.includes(FIRST_SECTION_FLAG)
      ? "first-section"
      : "all-lectures";

  console.log(`Learning prerender scope: ${scope}`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [reactRouterCli, "build", ...reactRouterArgs],
      {
        env: {
          ...process.env,
          VEO_LEARNING_PRERENDER_SCOPE: scope,
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
      resolve(code ?? 1);
    });
  });
};

const isDirectInvocation =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  process.exitCode = await runPerformanceBuild();
}
