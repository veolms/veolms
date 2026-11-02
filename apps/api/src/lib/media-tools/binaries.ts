import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  METADATA_PROCESS_TIMEOUT_MS,
  QUICK_PROCESS_TIMEOUT_MS,
  runProcess,
} from "./process.ts";

const YTDLP_RELEASE_BASE =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
const FFMPEG_RELEASE_BASE =
  "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest";

/** Progress/diagnostic output; the CLI prints it, the API logs it. */
export type MediaToolsLog = (level: "info" | "warn", message: string) => void;

const silentLog: MediaToolsLog = () => {};

export interface YtDlpContext {
  cookies?: string;
  cookiesFromBrowser?: string;
  supportsJsRuntimes?: boolean;
}

export interface ResolvedYtDlpBinary {
  path: string;
  supportsJsRuntimes: boolean;
}

// yt-dlp's own resilience: retry the whole download and individual
// fragments, and back off exponentially (1s up to 20s) between retries —
// covers transient network errors and, since yt-dlp treats HTTP 429 as a
// retryable error, throttling/rate-limit responses too.
export const YTDLP_RESILIENCE_ARGS = [
  "--retries",
  "5",
  "--fragment-retries",
  "5",
  "--retry-sleep",
  "exp=1:20",
];

export function buildYtDlpArgs(
  baseArgs: string[],
  ctx?: YtDlpContext,
): string[] {
  const args = ctx?.supportsJsRuntimes
    ? ["--js-runtimes", "node", ...YTDLP_RESILIENCE_ARGS, ...baseArgs]
    : [...YTDLP_RESILIENCE_ARGS, ...baseArgs];
  if (ctx?.cookies && fs.existsSync(ctx.cookies)) {
    args.push("--cookies", ctx.cookies);
  } else if (ctx?.cookiesFromBrowser) {
    args.push("--cookies-from-browser", ctx.cookiesFromBrowser);
  }
  return args;
}

export function resolveCookiesPath(customPath?: string): string | undefined {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  const cwdCookies = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(cwdCookies)) {
    return cwdCookies;
  }
  const homeCookies = path.join(os.homedir(), ".veolms", "cookies.txt");
  if (fs.existsSync(homeCookies)) {
    return homeCookies;
  }
  return undefined;
}

export function veolmsHomeDir(): string {
  return path.join(os.homedir(), ".veolms");
}

export function veolmsBinDir(): string {
  return path.join(veolmsHomeDir(), "bin");
}

export function veolmsStagingDir(): string {
  return path.join(veolmsHomeDir(), "tmp");
}

function resolveYtDlpDownloadUrl(): { url: string; fileName: string } {
  if (process.platform === "win32") {
    return { url: `${YTDLP_RELEASE_BASE}/yt-dlp.exe`, fileName: "yt-dlp.exe" };
  }
  if (process.platform === "darwin") {
    return { url: `${YTDLP_RELEASE_BASE}/yt-dlp_macos`, fileName: "yt-dlp" };
  }
  if (process.arch === "arm64") {
    return {
      url: `${YTDLP_RELEASE_BASE}/yt-dlp_linux_aarch64`,
      fileName: "yt-dlp",
    };
  }
  if (process.arch === "arm") {
    return {
      url: `${YTDLP_RELEASE_BASE}/yt-dlp_linux_armv7l`,
      fileName: "yt-dlp",
    };
  }
  return { url: `${YTDLP_RELEASE_BASE}/yt-dlp_linux`, fileName: "yt-dlp" };
}

function resolveFfmpegRelease(): {
  url: string;
  fileName: string;
  kind: "zip" | "tar.xz";
} | null {
  if (process.platform === "win32") {
    if (process.arch === "arm64") {
      return {
        url: `${FFMPEG_RELEASE_BASE}/ffmpeg-master-latest-winarm64-gpl.zip`,
        fileName: "ffmpeg-winarm64.zip",
        kind: "zip",
      };
    }
    return {
      url: `${FFMPEG_RELEASE_BASE}/ffmpeg-master-latest-win64-gpl.zip`,
      fileName: "ffmpeg-win64.zip",
      kind: "zip",
    };
  }
  if (process.platform === "linux") {
    if (process.arch === "arm64") {
      return {
        url: `${FFMPEG_RELEASE_BASE}/ffmpeg-master-latest-linuxarm64-gpl.tar.xz`,
        fileName: "ffmpeg-linuxarm64.tar.xz",
        kind: "tar.xz",
      };
    }
    if (process.arch === "x64") {
      return {
        url: `${FFMPEG_RELEASE_BASE}/ffmpeg-master-latest-linux64-gpl.tar.xz`,
        fileName: "ffmpeg-linux64.tar.xz",
        kind: "tar.xz",
      };
    }
  }
  return null;
}

async function downloadHttpFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(
      `Failed to download ${url}: ${response.status} ${response.statusText}`,
    );
  }

  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await pipeline(
    Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
    fs.createWriteStream(destPath),
  );

  const downloaded = await fsp.stat(destPath);
  if (downloaded.size < 1_000_000) {
    await fsp.unlink(destPath).catch(() => {});
    throw new Error(
      `Downloaded file from ${url} is unexpectedly small (${downloaded.size} bytes). GitHub may have returned an error page.`,
    );
  }
}

async function findNamedFile(
  rootDir: string,
  fileName: string,
): Promise<string | null> {
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === fileName) {
        return fullPath;
      }
    }
  }
  return null;
}

export async function findBinaryOnPath(name: string): Promise<string | null> {
  const checkCmd = process.platform === "win32" ? "where.exe" : "which";
  try {
    const res = await runProcess(checkCmd, [name], {
      timeoutMs: QUICK_PROCESS_TIMEOUT_MS,
    });
    if (res.code === 0 && res.stdout.trim()) {
      const binaryPath = res.stdout.trim().split(/\r?\n/)[0]!.trim();
      if (binaryPath && fs.existsSync(binaryPath)) {
        return binaryPath;
      }
    }
  } catch {
    // Not on PATH
  }
  return null;
}

async function probeYtDlpBinary(
  binaryPath: string,
): Promise<{ ok: boolean; supportsJsRuntimes: boolean }> {
  try {
    const version = await runProcess(binaryPath, ["--version"], {
      timeoutMs: QUICK_PROCESS_TIMEOUT_MS,
    });
    if (version.code !== 0) {
      return { ok: false, supportsJsRuntimes: false };
    }
    const help = await runProcess(binaryPath, ["--help"], {
      timeoutMs: QUICK_PROCESS_TIMEOUT_MS,
    });
    const text = `${help.stdout}\n${help.stderr}`;
    return { ok: true, supportsJsRuntimes: text.includes("--js-runtimes") };
  } catch {
    return { ok: false, supportsJsRuntimes: false };
  }
}

async function detectFfmpegBinary(customPath?: string): Promise<string | null> {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }

  const ext = process.platform === "win32" ? ".exe" : "";
  const homeBin = path.join(veolmsBinDir(), `ffmpeg${ext}`);
  if (fs.existsSync(homeBin)) {
    return homeBin;
  }

  return findBinaryOnPath("ffmpeg");
}

async function extractFfmpegArchive(
  archivePath: string,
  extractDir: string,
  kind: "zip" | "tar.xz",
): Promise<void> {
  if (kind === "zip") {
    // Windows 10+ ships bsdtar, which reads zip archives and is far faster
    // than Expand-Archive on the ~170 MB FFmpeg build.
    const tarRes = await runProcess(
      "tar",
      ["-xf", archivePath, "-C", extractDir],
      { timeoutMs: METADATA_PROCESS_TIMEOUT_MS },
    ).catch(() => null);
    if (tarRes?.code === 0) return;

    // `-Command` does not pass trailing arguments to `$args`, so the paths
    // go into the script itself, as single-quoted PowerShell literals.
    const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const extractRes = await runProcess(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath ${literal(archivePath)} -DestinationPath ${literal(extractDir)} -Force`,
      ],
      { timeoutMs: METADATA_PROCESS_TIMEOUT_MS },
    );
    if (extractRes.code !== 0) {
      throw new Error(
        extractRes.stderr || tarRes?.stderr || "Failed to extract FFmpeg zip",
      );
    }
    return;
  }

  const xzRes = await runProcess(
    "tar",
    ["-xJf", archivePath, "-C", extractDir],
    { timeoutMs: METADATA_PROCESS_TIMEOUT_MS },
  );
  if (xzRes.code === 0) {
    return;
  }
  const fallback = await runProcess(
    "tar",
    ["-xf", archivePath, "-C", extractDir],
    { timeoutMs: METADATA_PROCESS_TIMEOUT_MS },
  );
  if (fallback.code !== 0) {
    throw new Error(
      fallback.stderr || xzRes.stderr || "Failed to extract FFmpeg tar.xz",
    );
  }
}

/**
 * Finds ffmpeg (custom path → ~/.veolms/bin → PATH), downloading a static
 * build into ~/.veolms/bin when none exists. Returns null when it cannot.
 */
export async function ensureFfmpegBinary(
  customPath?: string,
  log: MediaToolsLog = silentLog,
): Promise<string | null> {
  const existing = await detectFfmpegBinary(customPath);
  if (existing) return existing;

  const isWindows = process.platform === "win32";
  const homeBin = veolmsBinDir();
  const ffmpegName = isWindows ? "ffmpeg.exe" : "ffmpeg";
  const ffprobeName = isWindows ? "ffprobe.exe" : "ffprobe";
  const targetFfmpeg = path.join(homeBin, ffmpegName);
  const targetFfprobe = path.join(homeBin, ffprobeName);

  if (fs.existsSync(targetFfmpeg)) return targetFfmpeg;

  const release = resolveFfmpegRelease();
  if (!release) {
    log(
      "warn",
      "Could not auto-download FFmpeg for this platform. Install ffmpeg (e.g. apt install ffmpeg) and retry.",
    );
    return null;
  }

  log(
    "info",
    `Downloading FFmpeg for audio/video format merging (${release.fileName})...`,
  );
  const stagingRoot = veolmsStagingDir();
  const archivePath = path.join(stagingRoot, release.fileName);
  const extractDir = path.join(stagingRoot, "ffmpeg-extract");

  try {
    await fsp.mkdir(homeBin, { recursive: true });
    await fsp.mkdir(stagingRoot, { recursive: true });
    await fsp.rm(extractDir, { recursive: true, force: true });
    await fsp.mkdir(extractDir, { recursive: true });

    await downloadHttpFile(release.url, archivePath);
    await extractFfmpegArchive(archivePath, extractDir, release.kind);

    const ffmpegFound = await findNamedFile(extractDir, ffmpegName);
    if (!ffmpegFound) {
      throw new Error(`Could not find ${ffmpegName} in the downloaded archive`);
    }
    await fsp.copyFile(ffmpegFound, targetFfmpeg);
    if (!isWindows) {
      await fsp.chmod(targetFfmpeg, 0o755);
    }

    const ffprobeFound = await findNamedFile(extractDir, ffprobeName);
    if (ffprobeFound) {
      await fsp.copyFile(ffprobeFound, targetFfprobe);
      if (!isWindows) {
        await fsp.chmod(targetFfprobe, 0o755);
      }
    }

    if (fs.existsSync(targetFfmpeg)) {
      log("info", `FFmpeg installed to: ${targetFfmpeg}`);
      return targetFfmpeg;
    }
  } catch (e) {
    log(
      "warn",
      `Could not auto-download FFmpeg: ${e instanceof Error ? e.message : e}`,
    );
  } finally {
    await fsp.unlink(archivePath).catch(() => {});
    await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }

  return null;
}

async function installStandaloneYtDlp(
  homeBin: string,
  log: MediaToolsLog,
): Promise<void> {
  const release = resolveYtDlpDownloadUrl();
  log(
    "info",
    `Downloading standalone yt-dlp (${release.fileName} for ${process.platform}/${process.arch})...`,
  );

  await fsp.mkdir(path.dirname(homeBin), { recursive: true });
  await downloadHttpFile(release.url, homeBin);
  if (process.platform !== "win32") {
    await fsp.chmod(homeBin, 0o755);
  }

  const probe = await probeYtDlpBinary(homeBin);
  if (!probe.ok) {
    await fsp.unlink(homeBin).catch(() => {});
    throw new Error(
      `Downloaded yt-dlp at ${homeBin} could not be executed. On Linux this must be the arch-matching standalone (yt-dlp_linux / yt-dlp_linux_aarch64), not the Python zipapp.`,
    );
  }

  log("info", `yt-dlp downloaded successfully to: ${homeBin}`);
}

export interface EnsureYtDlpOptions {
  log?: MediaToolsLog;
  /**
   * Asked before downloading when yt-dlp is missing everywhere (the CLI asks
   * the operator). Without it the standalone build is downloaded.
   */
  confirmDownload?: () => Promise<boolean>;
  /** Run `yt-dlp -U` on the managed ~/.veolms/bin copy (default true). */
  selfUpdate?: boolean;
}

/**
 * Resolves a yt-dlp new enough for --js-runtimes: custom path → managed
 * ~/.veolms/bin copy (self-updated) → PATH → downloads a standalone build.
 */
export async function ensureYtDlpBinary(
  customPath?: string,
  options: EnsureYtDlpOptions = {},
): Promise<ResolvedYtDlpBinary> {
  const log = options.log ?? silentLog;
  const ext = process.platform === "win32" ? ".exe" : "";
  const homeBin = path.join(veolmsBinDir(), `yt-dlp${ext}`);

  if (customPath) {
    if (!fs.existsSync(customPath)) {
      throw new Error(`yt-dlp path does not exist: ${customPath}`);
    }
    const probe = await probeYtDlpBinary(customPath);
    if (!probe.ok) {
      throw new Error(`yt-dlp at ${customPath} could not be executed.`);
    }
    if (!probe.supportsJsRuntimes) {
      log(
        "warn",
        `yt-dlp at ${customPath} is too old for --js-runtimes; YouTube extraction may fail. Upgrade yt-dlp or omit the custom path to auto-download a current standalone.`,
      );
    }
    return { path: customPath, supportsJsRuntimes: probe.supportsJsRuntimes };
  }

  if (fs.existsSync(homeBin)) {
    const probe = await probeYtDlpBinary(homeBin);
    if (probe.ok && probe.supportsJsRuntimes) {
      if (options.selfUpdate !== false) {
        try {
          log("info", "Checking for yt-dlp updates...");
          const updateRes = await runProcess(homeBin, ["-U"], {
            timeoutMs: METADATA_PROCESS_TIMEOUT_MS,
          });
          const output = (updateRes.stdout || updateRes.stderr).trim();
          if (output) {
            log("info", output.split("\n")[0] || "");
          }
        } catch {
          // Managed-binary updates are best-effort.
        }
      }
      return { path: homeBin, supportsJsRuntimes: true };
    }
    log(
      "warn",
      probe.ok
        ? `Existing yt-dlp at ${homeBin} is too old (no --js-runtimes); re-downloading a standalone build.`
        : `Existing yt-dlp at ${homeBin} is not executable; re-downloading a standalone build.`,
    );
    await fsp.unlink(homeBin).catch(() => {});
  }

  const pathBinary = await findBinaryOnPath("yt-dlp");
  if (pathBinary) {
    const probe = await probeYtDlpBinary(pathBinary);
    if (probe.ok && probe.supportsJsRuntimes) {
      return { path: pathBinary, supportsJsRuntimes: true };
    }
    if (probe.ok) {
      log(
        "warn",
        `System yt-dlp at ${pathBinary} is too old (no --js-runtimes). Downloading a current standalone to ${homeBin}.`,
      );
    }
  } else {
    log("warn", `yt-dlp was not found in PATH or at ${homeBin}.`);
  }

  if (!pathBinary && options.confirmDownload) {
    if (!(await options.confirmDownload())) {
      throw new Error(
        "yt-dlp is required to download playlist videos. Please install yt-dlp or specify path via --ytdlp-path.",
      );
    }
  }

  await installStandaloneYtDlp(homeBin, log);
  const installed = await probeYtDlpBinary(homeBin);
  return { path: homeBin, supportsJsRuntimes: installed.supportsJsRuntimes };
}
