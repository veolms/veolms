import { execSync } from "node:child_process";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Architecture,
  LambdaClient,
  PublishLayerVersionCommand,
  Runtime,
} from "@aws-sdk/client-lambda";
import { bold, cyan, green, red, yellow } from "@veolms/fleet-types/terminal";

export type LambdaArchitecture = "arm64" | "x86_64";

export interface BuildLayerOptions {
  readonly architecture: LambdaArchitecture;
  readonly outDir?: string;
  readonly log?: boolean;
}

export interface PublishLayerOptions {
  readonly lambdaClient: LambdaClient;
  readonly zipPath: string;
  readonly architecture: LambdaArchitecture;
  readonly layerName?: string;
  readonly description?: string;
}

/**
 * Resolves the monorepo root directory by scanning upwards for workspace root markers.
 */
export function resolveRepoRoot(): string {
  try {
    let currentDir = path.dirname(fileURLToPath(import.meta.url));
    while (currentDir !== path.parse(currentDir).root) {
      if (
        fsSync.existsSync(path.join(currentDir, "pnpm-workspace.yaml")) ||
        fsSync.existsSync(path.join(currentDir, "turbo.json"))
      ) {
        return currentDir;
      }
      currentDir = path.dirname(currentDir);
    }
  } catch {
    // ignore
  }

  let cwd = process.cwd();
  while (cwd !== path.parse(cwd).root) {
    if (
      fsSync.existsSync(path.join(cwd, "pnpm-workspace.yaml")) ||
      fsSync.existsSync(path.join(cwd, "turbo.json"))
    ) {
      return cwd;
    }
    cwd = path.dirname(cwd);
  }

  return process.cwd();
}

/**
 * Resolves the directory containing Dockerfile.ffprobe-layer reliably regardless
 * of whether the process was launched from workspace root, an app folder, or bundled.
 */
export function resolveDockerDir(): string {
  // 1. Direct check relative to source file (packages/fleet-provider-aws/src/setup)
  try {
    const srcDir = path.dirname(fileURLToPath(import.meta.url));
    const relativeToSrc = path.resolve(srcDir, "../../docker");
    if (
      fsSync.existsSync(path.join(relativeToSrc, "Dockerfile.ffprobe-layer"))
    ) {
      return relativeToSrc;
    }
  } catch {
    // ignore
  }

  // 2. Check relative to resolved repo root
  const root = resolveRepoRoot();
  const relativeToRoot = path.join(root, "packages/fleet-provider-aws/docker");
  if (
    fsSync.existsSync(path.join(relativeToRoot, "Dockerfile.ffprobe-layer"))
  ) {
    return relativeToRoot;
  }

  return path.join(root, "packages/fleet-provider-aws/docker");
}

/**
 * Checks if the Docker daemon is installed and currently running.
 */
export function isDockerRunning(): boolean {
  try {
    execSync("docker info", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Builds the standalone ffprobe Lambda layer zip using Docker.
 */
export function buildFfprobeLayer(options: BuildLayerOptions): string {
  const log = options.log ?? true;
  const targetArch = options.architecture === "x86_64" ? "amd64" : "arm64";

  if (!isDockerRunning()) {
    throw new Error(
      "Docker is not running or not installed. Please install and start Docker to build the ffprobe layer.",
    );
  }

  const repoRoot = resolveRepoRoot();
  const dockerfileDir = resolveDockerDir();
  const dockerfilePath = path.join(dockerfileDir, "Dockerfile.ffprobe-layer");

  if (!fsSync.existsSync(dockerfilePath)) {
    throw new Error(
      `Dockerfile.ffprobe-layer not found at expected path: ${dockerfilePath}`,
    );
  }

  const outDir =
    options.outDir ?? path.join(repoRoot, "dist/layers", options.architecture);
  if (!fsSync.existsSync(outDir)) {
    fsSync.mkdirSync(outDir, { recursive: true });
  }

  const outZipPath = path.join(outDir, "ffprobe-layer.zip");

  if (log) {
    console.info(
      `\n${bold(cyan("Building ffprobe Lambda layer using Docker..."))}`,
    );
    console.info(`  Target Architecture: ${bold(green(options.architecture))}`);
    console.info(`  Output File:         ${bold(outZipPath)}\n`);
  }

  // Use Docker BuildKit with --output to extract the zip directly from the container
  const buildCmd = `DOCKER_BUILDKIT=1 docker build --build-arg TARGETARCH=${targetArch} -f "${dockerfilePath}" --output "${outDir}" "${dockerfileDir}"`;

  try {
    execSync(buildCmd, { stdio: log ? "inherit" : "pipe" });
  } catch (buildErr: unknown) {
    // Fallback: build container and copy zip out
    if (log) {
      console.warn(
        "  BuildKit export fallback: running temporary container extraction...",
      );
    }
    const tag = `veolms-ffprobe-layer:${options.architecture}`;
    execSync(
      `docker build --build-arg TARGETARCH=${targetArch} -t ${tag} -f "${dockerfilePath}" "${dockerfileDir}"`,
      { stdio: log ? "inherit" : "pipe" },
    );
    const containerId = execSync(`docker create ${tag}`, {
      encoding: "utf-8",
    }).trim();
    execSync(`docker cp ${containerId}:/ffprobe-layer.zip "${outZipPath}"`, {
      stdio: "ignore",
    });
    execSync(`docker rm -f ${containerId}`, { stdio: "ignore" });
  }

  if (!fsSync.existsSync(outZipPath)) {
    throw new Error(
      `Failed to produce ffprobe layer zip at expected path: ${outZipPath}`,
    );
  }

  const sizeKb = (fsSync.statSync(outZipPath).size / (1024 * 1024)).toFixed(2);
  if (log) {
    console.info(
      `  ${green("✔")} Successfully built ffprobe layer (${sizeKb} MB)\n`,
    );
  }

  return outZipPath;
}

/**
 * Publishes the layer zip to AWS Lambda.
 */
export async function publishFfprobeLayer(
  options: PublishLayerOptions,
): Promise<string> {
  const layerName = options.layerName ?? "veolms-ffprobe";
  const arch: Architecture =
    options.architecture === "x86_64"
      ? Architecture.x86_64
      : Architecture.arm64;

  const fileContent = fsSync.readFileSync(options.zipPath);

  const command = new PublishLayerVersionCommand({
    LayerName: layerName,
    Description:
      options.description ??
      `Standalone ffprobe binary layer (${options.architecture}) for video metadata probing`,
    Content: {
      ZipFile: fileContent,
    },
    CompatibleArchitectures: [arch],
    CompatibleRuntimes: [Runtime.nodejs22x, Runtime.nodejs20x],
  });

  const response = await options.lambdaClient.send(command);

  if (!response.LayerVersionArn) {
    throw new Error(
      `Failed to publish Lambda layer ${layerName}: No LayerVersionArn returned.`,
    );
  }

  return response.LayerVersionArn;
}
