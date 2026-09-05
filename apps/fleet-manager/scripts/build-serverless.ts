import { execSync } from "node:child_process";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { isMainModule } from "@veolms/fleet-types";
import { bold, cyan, dim, green, yellow } from "@veolms/fleet-types/terminal";

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

function crc32(buf: Uint8Array): number {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ -1) >>> 0;
}

function createZipFromBuffers(
  entries: readonly { name: string; content: Uint8Array }[],
): Uint8Array {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosDate =
    (((now.getFullYear() - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate()) >>>
    0;
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5)) >>> 0;

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localSectionLength = 0;

  for (const { name, content } of entries) {
    const fileBytes = encoder.encode(name);
    const fileCrc = crc32(content);
    const localHeaderOffset = localSectionLength;

    const localHeader = new Uint8Array(30 + fileBytes.length);
    const lhView = new DataView(localHeader.buffer);
    lhView.setUint32(0, 0x04034b50, true);
    lhView.setUint16(4, 20, true);
    lhView.setUint16(6, 0, true);
    lhView.setUint16(8, 0, true); // store
    lhView.setUint16(10, dosTime, true);
    lhView.setUint16(12, dosDate, true);
    lhView.setUint32(14, fileCrc, true);
    lhView.setUint32(18, content.length, true);
    lhView.setUint32(22, content.length, true);
    lhView.setUint16(26, fileBytes.length, true);
    lhView.setUint16(28, 0, true);
    localHeader.set(fileBytes, 30);

    localParts.push(localHeader, content);
    localSectionLength += localHeader.length + content.length;

    const centralDir = new Uint8Array(46 + fileBytes.length);
    const cdView = new DataView(centralDir.buffer);
    cdView.setUint32(0, 0x02014b50, true);
    cdView.setUint16(4, 20, true);
    cdView.setUint16(6, 20, true);
    cdView.setUint16(8, 0, true);
    cdView.setUint16(10, 0, true);
    cdView.setUint16(12, dosTime, true);
    cdView.setUint16(14, dosDate, true);
    cdView.setUint32(16, fileCrc, true);
    cdView.setUint32(20, content.length, true);
    cdView.setUint32(24, content.length, true);
    cdView.setUint16(28, fileBytes.length, true);
    cdView.setUint32(42, localHeaderOffset, true);
    centralDir.set(fileBytes, 46);
    centralParts.push(centralDir);
  }

  const centralDirLength = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralDirLength, true);
  eocdView.setUint32(16, localSectionLength, true);

  const total = new Uint8Array(
    localSectionLength + centralDirLength + eocd.length,
  );
  let offset = 0;
  for (const part of [...localParts, ...centralParts, eocd]) {
    total.set(part, offset);
    offset += part.length;
  }
  return total;
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

  let repoRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
  );
  try {
    let currentDir = path.dirname(fileURLToPath(import.meta.url));
    while (currentDir !== path.parse(currentDir).root) {
      if (
        fsSync.existsSync(path.join(currentDir, "pnpm-workspace.yaml")) ||
        fsSync.existsSync(path.join(currentDir, "turbo.json"))
      ) {
        repoRoot = currentDir;
        break;
      }
      currentDir = path.dirname(currentDir);
    }
  } catch {
    // fallback to relative resolution
  }

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
