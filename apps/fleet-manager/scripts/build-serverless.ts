import { execSync } from "node:child_process";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { isMainModule } from "@veolms/fleet-types";
import { bold, cyan, dim, green, yellow } from "@veolms/fleet-types/terminal";
import { createZipFromBuffers } from "@veolms/fleet-types/zip";
import { resolveRepoRoot } from "@veolms/fleet-types/env";

export interface BuildServerlessOptions {
  provider?: string;
  entry?: "fleet" | "probe";
  target?: string;
  format?: "cjs" | "esm";
  outDir?: string;
  createZip?: boolean;
  log?: boolean;
}

export interface BuildServerlessResult {
  provider: string;
  outfile: string;
  zipPath?: string;
  sizeBytes: number;
  bundledFiles: string[];
}

export function bundleServerless(
  options: BuildServerlessOptions = {},
): BuildServerlessResult {
  const log = options.log ?? true;
  const rawProvider =
    options.provider ??
    process.env.PROVIDER ??
    process.env.FLEET_PROVIDER ??
    "aws";
  const provider = rawProvider.trim().toLowerCase();
  const entry = options.entry ?? "fleet";
  const target = options.target ?? "node22";
  const format = options.format ?? "cjs";
  const shouldZip = options.createZip ?? true;

  const repoRoot = resolveRepoRoot();

  const entryPoint =
    entry === "probe"
      ? path.join(repoRoot, "packages/fleet-provider-aws/src/probe-lambda.ts")
      : path.join(repoRoot, "apps/fleet-manager/src/entrypoints/serverless.ts");

  const distDir = options.outDir
    ? path.resolve(options.outDir)
    : entry === "probe"
      ? path.join(repoRoot, "dist/probe-lambda")
      : path.join(repoRoot, "dist/serverless");

  if (!fsSync.existsSync(distDir)) {
    fsSync.mkdirSync(distDir, { recursive: true });
  }

  const outfile = path.join(distDir, "index.js");

  if (log) {
    console.info(
      `\n${bold(cyan("╔══════════════════════════════════════════════════════╗"))}`,
    );
    console.info(
      `${bold(cyan("║"))}       ${bold(`VeoLMS Serverless Builder [${entry.toUpperCase()}]`)}          ${bold(cyan("║"))}`,
    );
    console.info(
      `${bold(cyan("╚══════════════════════════════════════════════════════╝"))}\n`,
    );
    console.info(`  Target Provider: ${bold(green(provider.toUpperCase()))}`);
    console.info(`  Entry Mode:      ${cyan(entry)}`);
    console.info(`  Runtime Target:  ${cyan(target)}`);
    console.info(`  Module Format:   ${cyan(format)}`);
    console.info(`  Entrypoint:      ${dim(entryPoint)}`);
    console.info(`  Output Dir:      ${dim(distDir)}\n`);
  }

  // 1. Bundle with esbuild
  esbuild.buildSync({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    target,
    format,
    outfile,
    logLevel: log ? "warning" : "silent",
  });

  const bundledFiles: string[] = ["index.js"];
  const jsContent = fsSync.readFileSync(outfile);
  const sizeKb = (jsContent.length / 1024).toFixed(1);

  if (log) {
    console.info(`  ${green("✔")} Bundled serverless handler (${sizeKb} KB)`);
  }

  // 2. Mirror to dist/lambda for AWS backwards compatibility
  if (provider === "aws" && entry === "fleet" && !options.outDir) {
    const lambdaDir = path.join(repoRoot, "dist/lambda");
    if (!fsSync.existsSync(lambdaDir)) {
      fsSync.mkdirSync(lambdaDir, { recursive: true });
    }
    fsSync.copyFileSync(outfile, path.join(lambdaDir, "index.js"));
  }

  // 4. Create ZIP package
  let zipPath: string | undefined;
  if (shouldZip) {
    const zipName = provider === "aws" ? "function.zip" : "serverless.zip";
    zipPath = path.join(distDir, zipName);

    let zipCreated = false;
    try {
      execSync(
        `cd "${distDir}" && zip -q -9 "${zipName}" ${bundledFiles.join(" ")}`,
        {
          stdio: "pipe",
        },
      );
      if (fsSync.existsSync(zipPath)) {
        zipCreated = true;
      }
    } catch {
      // Fall back to JS zip generator
    }

    if (!zipCreated) {
      const entries = bundledFiles.map((file) => ({
        name: file,
        content: fsSync.readFileSync(path.join(distDir, file)),
      }));
      const zipBytes = createZipFromBuffers(entries);
      fsSync.writeFileSync(zipPath, zipBytes);
    }

    // If AWS, also mirror function.zip to dist/lambda
    if (provider === "aws" && entry === "fleet" && !options.outDir) {
      const lambdaZip = path.join(repoRoot, "dist/lambda/function.zip");
      fsSync.copyFileSync(zipPath, lambdaZip);
    }

    const zipSizeKb = (fsSync.statSync(zipPath).size / 1024).toFixed(1);
    if (log) {
      console.info(
        `  ${green("✔")} Created serverless ZIP package: ${bold(cyan(zipPath))} (${zipSizeKb} KB)\n`,
      );
    }
  }

  return {
    provider,
    outfile,
    zipPath,
    sizeBytes: jsContent.length,
    bundledFiles,
  };
}

export function parseBuildArgs(
  args: readonly string[],
): BuildServerlessOptions {
  const options: BuildServerlessOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg.startsWith("--provider=")) {
      options.provider = arg.split("=")[1];
    } else if (arg === "--provider" && args[i + 1]) {
      options.provider = args[++i];
    } else if (arg.startsWith("--entry=")) {
      const e = arg.split("=")[1];
      if (e === "fleet" || e === "probe") {
        options.entry = e;
      }
    } else if (arg.startsWith("--target=")) {
      options.target = arg.split("=")[1];
    } else if (arg.startsWith("--format=")) {
      const fmt = arg.split("=")[1];
      if (fmt === "cjs" || fmt === "esm") {
        options.format = fmt;
      }
    } else if (arg.startsWith("--outdir=")) {
      options.outDir = arg.split("=")[1];
    } else if (arg === "--no-zip") {
      options.createZip = false;
    }
  }

  return options;
}

if (isMainModule(import.meta.url)) {
  try {
    const options = parseBuildArgs(process.argv.slice(2));
    bundleServerless(options);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n${yellow("✘ Build failed:")} ${message}\n`);
    process.exit(1);
  }
}
