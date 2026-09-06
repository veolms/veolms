import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FIRST_SECTION_FLAG = "--first-section";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const reactRouterCli = path.resolve(
  scriptDirectory,
  "../node_modules/@react-router/dev/bin.cjs",
);

export const runPerformanceBuild = async (args = process.argv.slice(2)) => {
  const firstSectionOnly = args.includes(FIRST_SECTION_FLAG);
  const reactRouterArgs = args.filter(
    (argument) => argument !== FIRST_SECTION_FLAG,
  );
  const scope = firstSectionOnly ? "first-section" : "all-lectures";

  console.log(`Learning prerender scope: ${scope}`);

  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [reactRouterCli, "build", ...reactRouterArgs],
      {
        env: {
          ...process.env,
          VEO_LEARNING_PRERENDER_SCOPE: scope,
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
