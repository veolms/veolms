import crypto from "node:crypto";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import { createServices } from "../services/index.ts";
import { createMediaService } from "../modules/media/index.ts";
import {
  ADMIN_ROLE,
  INSTRUCTOR_ROLE,
} from "../modules/auth/shared/auth.constants.ts";
import { slugify } from "../modules/courses/shared/courses.utils.ts";
import * as courseRepo from "../modules/courses/course/course.repository.ts";
import * as configRepo from "../modules/courses/configuration/configuration.repository.ts";
import * as mediaRepo from "../modules/media/media.repository.ts";

// ANSI colors
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

const cliLogger = {
  child: () => cliLogger,
  info: (msg: unknown) =>
    console.log(
      dim(`  [info] ${typeof msg === "string" ? msg : JSON.stringify(msg)}`),
    ),
  warn: (msg: unknown) =>
    console.log(
      yellow(`  [warn] ${typeof msg === "string" ? msg : JSON.stringify(msg)}`),
    ),
  error: (obj: unknown, msg?: string) =>
    console.error(
      red(
        `  [error] ${msg ?? (typeof obj === "string" ? obj : JSON.stringify(obj))}`,
      ),
    ),
  debug: () => {},
  trace: () => {},
  fatal: (obj: unknown, msg?: string) =>
    console.error(red(`  [fatal] ${msg ?? String(obj)}`)),
};

interface VideoFormatInfo {
  formatId: string;
  height?: number;
  width?: number;
  vcodec?: string;
  acodec?: string;
  tbr?: number;
}

interface VideoEntry {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  url?: string;
  thumbnails?: Array<{ url: string; width?: number; height?: number }>;
  width?: number;
  height?: number;
}

interface PlaylistMetadata {
  id: string;
  title: string;
  description?: string;
  entries: VideoEntry[];
}

const QUALITY_DEFINITIONS: Record<
  string,
  { height: number; width: number; defaultBitrate: number }
> = {
  "2160p": { height: 2160, width: 3840, defaultBitrate: 14000000 },
  "1440p": { height: 1440, width: 2560, defaultBitrate: 8000000 },
  "1080p": { height: 1080, width: 1920, defaultBitrate: 4500000 },
  "720p": { height: 720, width: 1280, defaultBitrate: 2400000 },
  "480p": { height: 480, width: 854, defaultBitrate: 1200000 },
  "360p": { height: 360, width: 640, defaultBitrate: 800000 },
  "240p": { height: 240, width: 426, defaultBitrate: 400000 },
};

// yt-dlp reports the *actual* pixel height (e.g. 1078, 538 — often slightly
// off standard due to cropping) when picking a fallback quality. Snap it to
// the nearest known label instead of stringifying the raw height — the raw
// value ("1078p") is not a valid VideoQualityLevel and would otherwise get
// written into video_jobs.qualities via an `as never` cast with nothing to
// catch it.
function nearestStandardQualityLabel(height: number): string {
  let best = "360p";
  let bestDiff = Infinity;
  for (const [label, def] of Object.entries(QUALITY_DEFINITIONS)) {
    const diff = Math.abs(def.height - height);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = label;
    }
  }
  return best;
}

function parseVideoSelectionRange(input: string, totalCount: number): number[] {
  const selected = new Set<number>();
  const parts = input
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((s) => s.trim());
      const start = parseInt(startStr!, 10);
      const end = parseInt(endStr!, 10);
      if (!isNaN(start) && !isNaN(end)) {
        const min = Math.max(1, Math.min(start, end));
        const max = Math.min(totalCount, Math.max(start, end));
        for (let i = min; i <= max; i++) {
          selected.add(i);
        }
      }
    } else {
      const num = parseInt(part, 10);
      if (!isNaN(num) && num >= 1 && num <= totalCount) {
        selected.add(num);
      }
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

function parseCliArgs() {
  const argv = process.argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1]!.startsWith("--")) {
        flags[key] = argv[++i]!;
      } else {
        flags[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      if (i + 1 < argv.length && !argv[i + 1]!.startsWith("-")) {
        flags[key] = argv[++i]!;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }

  const qualitiesRaw =
    (flags["qualities"] as string) ||
    (flags["q"] as string) ||
    "1080p,720p,480p,360p";
  const requestedQualities = qualitiesRaw
    .split(",")
    .map((q) => q.trim().toLowerCase())
    .filter((q) => Boolean(QUALITY_DEFINITIONS[q]));

  const fetchSubs = Boolean(
    flags["subs"] !== false &&
    flags["no-subs"] !== true &&
    flags["no-captions"] !== true,
  );
  // "all" is a yt-dlp wildcard matching *every* available language, not a
  // "fallback if English is missing" — combined with auto-captions
  // (YouTube auto-translates into 100+ languages), it was silently pulling
  // dozens of caption files per video. Explicit --sub-langs all still works
  // for anyone who actually wants every language.
  const subLangs =
    (flags["sub-langs"] as string) ||
    (flags["captions"] as string) ||
    "en.*,en";

  const hasExplicitSelection = Boolean(
    flags["max-videos"] ||
    flags["limit"] ||
    flags["items"] ||
    flags["range"] ||
    flags["start"] ||
    flags["video-start"] ||
    flags["end"] ||
    flags["video-end"],
  );

  const rawCookies =
    (flags["cookies"] as string) ||
    (flags["cookie"] as string) ||
    (flags["c"] as string);
  const cookiesPath = resolveCookiesPath(rawCookies);
  const cookiesFromBrowser =
    (flags["cookies-from-browser"] as string) || undefined;

  return {
    help: Boolean(flags["help"] || flags["h"]),
    playlistUrl:
      (flags["url"] as string) || (flags["u"] as string) || positionals[0],
    instructorEmail:
      (flags["email"] as string) || (flags["e"] as string) || positionals[1],
    courseTitle: (flags["title"] as string) || (flags["t"] as string),
    status: ((flags["status"] as string) || "published") as
      "draft" | "published",
    ytdlpPath: (flags["ytdlp-path"] as string) || process.env.YTDLP_PATH,
    ffmpegPath: (flags["ffmpeg-path"] as string) || process.env.FFMPEG_PATH,
    keepTemp: Boolean(flags["keep-temp"] || flags["k"]),
    maxVideos: flags["max-videos"]
      ? Number(flags["max-videos"])
      : flags["limit"]
        ? Number(flags["limit"])
        : undefined,
    startVideo: flags["start"]
      ? Number(flags["start"])
      : flags["video-start"]
        ? Number(flags["video-start"])
        : undefined,
    endVideo: flags["end"]
      ? Number(flags["end"])
      : flags["video-end"]
        ? Number(flags["video-end"])
        : undefined,
    items:
      (flags["items"] as string) || (flags["range"] as string) || undefined,
    hasExplicitSelection,
    reverse: Boolean(flags["reverse"]),
    skipShorts: Boolean(flags["skip-shorts"]),
    minDuration: flags["min-duration"]
      ? Number(flags["min-duration"])
      : undefined,
    maxDuration: flags["max-duration"]
      ? Number(flags["max-duration"])
      : undefined,
    sectionTitle: (flags["section-title"] as string) || "Course Content",
    splitSections: flags["split-sections"]
      ? Number(flags["split-sections"])
      : undefined,
    pricingType: ((flags["pricing"] as string) || "free") as "free" | "paid",
    price: flags["price"] ? Number(flags["price"]) : 0,
    salePrice: flags["sale-price"] ? Number(flags["sale-price"]) : null,
    currency: ((flags["currency"] as string) || "INR").toUpperCase(),
    previewCount: flags["previews"]
      ? Number(flags["previews"])
      : flags["preview-count"]
        ? Number(flags["preview-count"])
        : 1,
    directHls: flags["queue-transcode"]
      ? false
      : flags["no-direct-hls"]
        ? false
        : true,
    qualities:
      requestedQualities.length > 0
        ? requestedQualities
        : ["1080p", "720p", "480p", "360p"],
    subtitles: fetchSubs,
    subLangs,
    cookies: cookiesPath,
    cookiesFromBrowser,
    yes: Boolean(flags["yes"] || flags["y"]),
    noResume: Boolean(flags["no-resume"] || flags["fresh"]),
  };
}

function resolveCookiesPath(customPath?: string): string | undefined {
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

const GIB = 1024 ** 3;
const MIN_IMPORT_SCRATCH_BYTES = 2 * GIB;
const YTDLP_RELEASE_BASE =
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download";
const FFMPEG_RELEASE_BASE =
  "https://github.com/yt-dlp/FFmpeg-Builds/releases/download/latest";

interface YtDlpContext {
  cookies?: string;
  cookiesFromBrowser?: string;
  supportsJsRuntimes?: boolean;
}

interface ResolvedYtDlpBinary {
  path: string;
  supportsJsRuntimes: boolean;
}

// yt-dlp's own resilience: retry the whole download and individual
// fragments, and back off exponentially (1s up to 20s) between retries —
// covers transient network errors and, since yt-dlp treats HTTP 429 as a
// retryable error, throttling/rate-limit responses too.
const YTDLP_RESILIENCE_ARGS = [
  "--retries",
  "5",
  "--fragment-retries",
  "5",
  "--retry-sleep",
  "exp=1:20",
];

function buildYtDlpArgs(baseArgs: string[], ctx?: YtDlpContext): string[] {
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

function veolmsHomeDir(): string {
  return path.join(os.homedir(), ".veolms");
}

function veolmsBinDir(): string {
  return path.join(veolmsHomeDir(), "bin");
}

function veolmsStagingDir(): string {
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

async function canUseDirectory(dir: string): Promise<boolean> {
  try {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveImportScratchRoot(): Promise<string> {
  const override = process.env.VEOLMS_IMPORT_TMP?.trim();
  if (override) {
    if (!(await canUseDirectory(override))) {
      throw new Error(`VEOLMS_IMPORT_TMP is not writable: ${override}`);
    }
    return path.resolve(override);
  }

  if (process.platform === "win32") {
    return os.tmpdir();
  }

  const candidates = [
    "/var/lib/veolms/import",
    path.join(veolmsHomeDir(), "tmp"),
    "/var/tmp",
  ];
  for (const dir of candidates) {
    if (await canUseDirectory(dir)) {
      return dir;
    }
  }

  return os.tmpdir();
}

async function getAvailableBytes(dir: string): Promise<number | null> {
  try {
    const stats = await fsp.statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

function estimateScratchBytesForVideo(
  durationSec: number | undefined,
  qualityCount: number,
): number {
  const seconds = Math.max(
    durationSec && durationSec > 0 ? durationSec : 3600,
    60,
  );
  const qualities = Math.max(qualityCount, 1);
  // ~2 Mbps per quality, kept twice (source download + HLS copy).
  const estimated = (2_000_000 / 8) * seconds * 2 * qualities;
  return Math.max(MIN_IMPORT_SCRATCH_BYTES, Math.ceil(estimated));
}

async function assertEnoughDiskSpace(
  dir: string,
  neededBytes: number,
  label: string,
): Promise<void> {
  const available = await getAvailableBytes(dir);
  if (available === null) {
    return;
  }
  if (available >= neededBytes) {
    return;
  }
  const neededGiB = (neededBytes / GIB).toFixed(1);
  const availableGiB = (available / GIB).toFixed(1);
  throw new Error(
    `Not enough disk space ${label}: need ${neededGiB} GiB, have ${availableGiB} GiB in ${dir}. Free disk or set VEOLMS_IMPORT_TMP to a disk-backed directory (avoid /tmp on Ubuntu; it is often tmpfs).`,
  );
}

// Tracks every live yt-dlp/ffmpeg/helper child so a SIGINT/SIGTERM (or a
// per-call timeout) can terminate the whole tree instead of orphaning it.
const activeChildren = new Set<ReturnType<typeof spawn>>();

const QUICK_PROCESS_TIMEOUT_MS = 30_000; // --version/--help/which/-U pings
const METADATA_PROCESS_TIMEOUT_MS = 5 * 60_000; // --dump-single-json probes, archive extraction
const DOWNLOAD_PROCESS_TIMEOUT_MS =
  Number(process.env.VEOLMS_IMPORT_PROCESS_TIMEOUT_MS) || 60 * 60_000; // actual video/subtitle download & ffmpeg encode

const MAX_BUFFERED_OUTPUT_BYTES = 2 * 1024 * 1024; // cap retained stdout/stderr per process

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RATE_LIMIT_PATTERN =
  /HTTP Error 429|429:|too many requests|rate.?limit/i;

function isRateLimitedError(text: string): boolean {
  return RATE_LIMIT_PATTERN.test(text);
}

// Small pause between separate yt-dlp invocations for the same run — each
// quality/video is its own process, so yt-dlp's own throttling flags
// (--sleep-requests etc.) don't cover the gap *between* them. Cheap
// insurance against tripping YouTube's rate limiting on big playlists.
const INTER_QUALITY_DELAY_MS =
  Number(process.env.VEOLMS_IMPORT_QUALITY_DELAY_MS) || 2_000;
const INTER_VIDEO_DELAY_MS =
  Number(process.env.VEOLMS_IMPORT_VIDEO_DELAY_MS) || 3_000;
// Extra backoff, on top of yt-dlp's own retries, when a download attempt's
// own error output looks like a 429 — one additional full-process retry
// after cooling down.
const RATE_LIMIT_BACKOFF_MS =
  Number(process.env.VEOLMS_IMPORT_RATE_LIMIT_BACKOFF_MS) || 45_000;

function capAppend(existing: string, addition: string, maxBytes: number): string {
  const combined = existing + addition;
  return combined.length <= maxBytes
    ? combined
    : combined.slice(combined.length - maxBytes);
}

/** Best-effort kill of a child and, on Windows, its full descendant tree. */
function killProcessTree(child: ReturnType<typeof spawn>): void {
  if (!child.pid || child.exitCode !== null || child.killed) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      shell: false,
      windowsHide: true,
    }).on("error", () => {});
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {
    // already gone
  }
  setTimeout(() => {
    try {
      if (child.exitCode === null && !child.killed) child.kill("SIGKILL");
    } catch {
      // already gone
    }
  }, 5000);
}

/** Terminates every currently tracked child process (used on shutdown). */
function killAllActiveChildren(): void {
  for (const child of [...activeChildren]) {
    killProcessTree(child);
  }
}

interface RunProcessOptions {
  onProgress?: (data: string) => void;
  /** Kill the process (and reject success on close) once exceeded. */
  timeoutMs?: number;
}

async function runProcess(
  cmd: string,
  args: string[],
  options?: RunProcessOptions,
): Promise<{ stdout: string; stderr: string; code: number; timedOut: boolean }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false, windowsHide: true });
    activeChildren.add(proc);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    if (options?.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killProcessTree(proc);
      }, options.timeoutMs);
    }

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout = capAppend(stdout, text, MAX_BUFFERED_OUTPUT_BYTES);
      if (options?.onProgress) options.onProgress(text);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr = capAppend(stderr, text, MAX_BUFFERED_OUTPUT_BYTES);
      if (options?.onProgress) options.onProgress(text);
    });

    proc.on("error", (err) => {
      if (timer) clearTimeout(timer);
      activeChildren.delete(proc);
      reject(err);
    });
    proc.on("close", (code) => {
      if (timer) clearTimeout(timer);
      activeChildren.delete(proc);
      // A null code means the process died to a signal (our timeout kill,
      // an external kill, or shutdown) — never treat that as success (0).
      resolve({ stdout, stderr, code: code ?? -1, timedOut });
    });
  });
}

async function findBinaryOnPath(name: string): Promise<string | null> {
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
    const extractRes = await runProcess(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force",
        archivePath,
        extractDir,
      ],
      { timeoutMs: METADATA_PROCESS_TIMEOUT_MS },
    );
    if (extractRes.code !== 0) {
      throw new Error(extractRes.stderr || "Failed to extract FFmpeg zip");
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

async function ensureFfmpegBinary(
  customPath?: string,
  _rl?: readline.Interface,
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
    console.log(
      yellow(
        "Could not auto-download FFmpeg for this platform. Install ffmpeg (e.g. apt install ffmpeg) and retry.",
      ),
    );
    return null;
  }

  console.log(
    `\n${cyan("➜")} Downloading FFmpeg for audio/video format merging (${release.fileName})...`,
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
      console.log(`${green("✓")} FFmpeg installed to: ${dim(targetFfmpeg)}`);
      return targetFfmpeg;
    }
  } catch (e) {
    console.log(
      yellow(
        `Could not auto-download FFmpeg: ${e instanceof Error ? e.message : e}`,
      ),
    );
  } finally {
    await fsp.unlink(archivePath).catch(() => {});
    await fsp.rm(extractDir, { recursive: true, force: true }).catch(() => {});
  }

  return null;
}

async function installStandaloneYtDlp(homeBin: string): Promise<void> {
  const release = resolveYtDlpDownloadUrl();
  console.log(
    `${cyan("➜")} Downloading standalone yt-dlp (${release.fileName} for ${process.platform}/${process.arch})...`,
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

  console.log(
    `${green("✓")} yt-dlp downloaded successfully to: ${dim(homeBin)}`,
  );
}

async function ensureYtDlpBinary(
  customPath?: string,
  rl?: readline.Interface,
): Promise<ResolvedYtDlpBinary> {
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
      console.log(
        yellow(
          `yt-dlp at ${customPath} is too old for --js-runtimes; YouTube extraction may fail. Upgrade yt-dlp or omit --ytdlp-path to auto-download a current standalone.`,
        ),
      );
    }
    return { path: customPath, supportsJsRuntimes: probe.supportsJsRuntimes };
  }

  if (fs.existsSync(homeBin)) {
    const probe = await probeYtDlpBinary(homeBin);
    if (probe.ok && probe.supportsJsRuntimes) {
      try {
        console.log(`${cyan("➜")} Checking for yt-dlp updates...`);
        const updateRes = await runProcess(homeBin, ["-U"], {
          timeoutMs: METADATA_PROCESS_TIMEOUT_MS,
        });
        const output = (updateRes.stdout || updateRes.stderr).trim();
        if (output) {
          console.log(`  ${dim(output.split("\n")[0] || "")}`);
        }
      } catch {
        // Managed-binary updates are best-effort.
      }
      return { path: homeBin, supportsJsRuntimes: true };
    }
    console.log(
      yellow(
        probe.ok
          ? `Existing yt-dlp at ${homeBin} is too old (no --js-runtimes); re-downloading a standalone build.`
          : `Existing yt-dlp at ${homeBin} is not executable; re-downloading a standalone build.`,
      ),
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
      console.log(
        yellow(
          `System yt-dlp at ${pathBinary} is too old (no --js-runtimes). Downloading a current standalone to ${homeBin}.`,
        ),
      );
    }
  } else {
    console.log(
      `\n${yellow("!")} ${bold("yt-dlp")} was not found in PATH or at ${dim(homeBin)}.`,
    );
  }

  let shouldDownload = true;
  if (rl && !pathBinary) {
    const answer = await rl.question(
      `${cyan("? ")}${bold("Would you like to auto-download yt-dlp standalone binary now? (Y/n): ")}`,
    );
    shouldDownload = answer.trim().toLowerCase() !== "n";
  }

  if (!shouldDownload) {
    throw new Error(
      "yt-dlp is required to download playlist videos. Please install yt-dlp or specify path via --ytdlp-path.",
    );
  }

  await installStandaloneYtDlp(homeBin);
  const installed = await probeYtDlpBinary(homeBin);
  return { path: homeBin, supportsJsRuntimes: installed.supportsJsRuntimes };
}

async function resolveInstructor(
  database: ReturnType<typeof createDatabase>,
  inputEmail: string | undefined,
  rl: readline.Interface,
) {
  const email = inputEmail?.trim().toLowerCase();

  // 1. Ensure instructor role exists
  let instructorRole = await database
    .selectFrom("roles")
    .selectAll()
    .where("name", "=", INSTRUCTOR_ROLE)
    .executeTakeFirst();

  if (!instructorRole) {
    const defaultInstructorRoleId = "00000000-0000-4000-8000-000000000001";
    await database
      .insertInto("roles")
      .values({
        id: defaultInstructorRoleId,
        name: INSTRUCTOR_ROLE,
        description: "Course instructor and author",
      })
      .onConflict((oc) => oc.doNothing())
      .execute();

    instructorRole = await database
      .selectFrom("roles")
      .selectAll()
      .where("name", "=", INSTRUCTOR_ROLE)
      .executeTakeFirst();
  }

  // 2. Fetch all existing active instructors and admins
  const existingInstructorsRaw = await database
    .selectFrom("users")
    .innerJoin("user_roles", "user_roles.user_id", "users.id")
    .innerJoin("roles", "roles.id", "user_roles.role_id")
    .where("roles.name", "in", [INSTRUCTOR_ROLE, ADMIN_ROLE])
    .where("users.is_deleted", "=", false)
    .select([
      "users.id",
      "users.email",
      "users.username",
      "users.display_name",
      "roles.name as role_name",
    ])
    .execute();

  const instructorMap = new Map<
    string,
    {
      id: string;
      email: string | null;
      username: string;
      display_name: string;
      roles: string[];
    }
  >();

  for (const row of existingInstructorsRaw) {
    const existing = instructorMap.get(row.id);
    if (existing) {
      if (!existing.roles.includes(row.role_name)) {
        existing.roles.push(row.role_name);
      }
    } else {
      instructorMap.set(row.id, {
        id: row.id,
        email: row.email,
        username: row.username,
        display_name: row.display_name,
        roles: [row.role_name],
      });
    }
  }

  const existingInstructors = Array.from(instructorMap.values());

  if (existingInstructors.length === 0) {
    throw new Error(
      "No existing admin or instructor accounts found in the database. Please create an instructor or admin account first (e.g., using `pnpm instructor <email>`).",
    );
  }

  let selectedUser: {
    id: string;
    email: string | null;
    username: string;
    display_name: string;
    roles: string[];
  } | null = null;

  if (email) {
    const matched = existingInstructors.find(
      (inst) => inst.email?.toLowerCase() === email,
    );
    if (matched) {
      selectedUser = matched;
    } else {
      console.log(
        yellow(
          `! User "${inputEmail}" was not found among existing active instructors or admins.`,
        ),
      );
    }
  }

  if (!selectedUser) {
    console.log(`\n${bold("Found existing instructors/admins:")}`);
    existingInstructors.forEach((inst, idx) => {
      console.log(
        `  ${cyan(`[${idx + 1}]`)} ${inst.display_name} (${inst.email ?? "no email"}) - ${dim(inst.roles.join(", "))}`,
      );
    });

    while (!selectedUser) {
      const choice = (
        await rl.question(
          `\n${cyan("? ")}${bold(`Select instructor/admin [1-${existingInstructors.length}]: `)}`,
        )
      ).trim();
      const num = parseInt(choice, 10);
      if (!isNaN(num) && num >= 1 && num <= existingInstructors.length) {
        selectedUser = existingInstructors[num - 1]!;
      } else {
        console.log(
          red(
            `Please enter a valid number between 1 and ${existingInstructors.length}.`,
          ),
        );
      }
    }
  }

  const user = await database
    .selectFrom("users")
    .selectAll()
    .where("id", "=", selectedUser.id)
    .executeTakeFirstOrThrow();

  if (instructorRole) {
    await database
      .insertInto("user_roles")
      .values({
        user_id: user.id,
        role_id: instructorRole.id,
      })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  return user;
}

async function extractPlaylistMetadata(
  ytdlpPath: string,
  playlistUrl: string,
  ytCtx?: YtDlpContext,
): Promise<PlaylistMetadata> {
  console.log(`\n${cyan("➜")} Fetching playlist details with yt-dlp...`);

  const args = buildYtDlpArgs(
    ["--dump-single-json", "--flat-playlist", playlistUrl],
    ytCtx,
  );

  const { stdout, stderr, code, timedOut } = await runProcess(
    ytdlpPath,
    args,
    { timeoutMs: METADATA_PROCESS_TIMEOUT_MS },
  );

  if (code !== 0) {
    if (
      stderr.includes("Sign in to confirm you're not a bot") ||
      stderr.includes("bot")
    ) {
      console.error(
        `\n${yellow("!")} YouTube bot detection encountered. Pass cookies with --cookies cookies.txt or place a cookies.txt file in the project folder.`,
      );
    }
    throw new Error(
      timedOut
        ? `Timed out extracting playlist metadata from ${playlistUrl} after ${METADATA_PROCESS_TIMEOUT_MS}ms.`
        : `Failed to extract playlist metadata from ${playlistUrl}: ${stderr}`,
    );
  }

  try {
    const parsed = JSON.parse(stdout);
    const entries: VideoEntry[] = (parsed.entries || [])
      .map((e: Record<string, unknown>) => ({
        id: String(e.id || ""),
        title: String(e.title || "Untitled Video"),
        description: typeof e.description === "string" ? e.description : "",
        duration:
          typeof e.duration === "number" ? Math.round(e.duration) : undefined,
        url:
          typeof e.url === "string"
            ? e.url
            : `https://www.youtube.com/watch?v=${e.id}`,
        thumbnails: Array.isArray(e.thumbnails)
          ? (e.thumbnails as Array<{ url: string }>)
          : undefined,
      }))
      .filter((e: VideoEntry) => Boolean(e.id));

    return {
      id: String(parsed.id || ""),
      title: String(parsed.title || "Imported Course"),
      description:
        typeof parsed.description === "string" ? parsed.description : "",
      entries,
    };
  } catch (err) {
    throw new Error(
      `Failed to parse yt-dlp JSON output: ${err instanceof Error ? err.message : err}`,
    );
  }
}

async function downloadThumbnail(
  firstVideo: VideoEntry,
  tempDir: string,
): Promise<{ filePath: string; mimeType: string } | null> {
  const thumbUrl =
    firstVideo.thumbnails && firstVideo.thumbnails.length > 0
      ? firstVideo.thumbnails[firstVideo.thumbnails.length - 1]?.url
      : `https://img.youtube.com/vi/${firstVideo.id}/maxresdefault.jpg`;

  if (!thumbUrl) return null;

  try {
    const res = await fetch(thumbUrl);
    if (!res.ok) {
      const fallbackUrl = `https://img.youtube.com/vi/${firstVideo.id}/hqdefault.jpg`;
      const fallbackRes = await fetch(fallbackUrl);
      if (!fallbackRes.ok) return null;

      const buffer = Buffer.from(await fallbackRes.arrayBuffer());
      const filePath = path.join(tempDir, "thumbnail.jpg");
      await fsp.writeFile(filePath, buffer);
      return { filePath, mimeType: "image/jpeg" };
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const filePath = path.join(tempDir, "thumbnail.jpg");
    await fsp.writeFile(filePath, buffer);
    return { filePath, mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

function resolveVideoMimeType(filename: string): string {
  if (filename.endsWith(".mp4") || filename.endsWith(".m4v"))
    return "video/mp4";
  if (filename.endsWith(".webm")) return "video/webm";
  if (filename.endsWith(".mkv")) return "video/x-matroska";
  if (filename.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

interface MediaStreamInfo {
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
}

// ffmpeg's own "-i" (with no output) prints stream info to stderr and exits
// non-zero — that's fine, we only read the text. Avoids depending on a
// separate ffprobe binary being resolvable (custom --ffmpeg-path, or ffmpeg
// found on PATH without a co-located ffprobe).
async function probeMediaStreamInfo(
  ffmpegBinary: string,
  filePath: string,
): Promise<MediaStreamInfo> {
  const res = await runProcess(ffmpegBinary, ["-i", filePath], {
    timeoutMs: QUICK_PROCESS_TIMEOUT_MS,
  });
  const text = res.stderr || res.stdout;

  const videoLine = /Stream #\d+:\d+.*?: Video:\s*([a-zA-Z0-9_]+).*?(\d{2,5})x(\d{2,5})(?:.*?(\d+(?:\.\d+)?)\s*fps)?/.exec(
    text,
  );
  const audioLine = /Stream #\d+:\d+.*?: Audio:\s*([a-zA-Z0-9_]+)/.exec(text);

  return {
    videoCodec: videoLine?.[1]?.toLowerCase() ?? null,
    width: videoLine?.[2] ? Number(videoLine[2]) : null,
    height: videoLine?.[3] ? Number(videoLine[3]) : null,
    fps: videoLine?.[4] ? Number(videoLine[4]) : null,
    audioCodec: audioLine?.[1]?.toLowerCase() ?? null,
  };
}

// ffmpeg names these differently from yt-dlp/common usage; normalize to
// what actually matters for MPEG-TS + Safari/iOS HLS compatibility.
function isTsSafeVideoCodec(codec: string | null): boolean {
  return codec === "h264";
}
function isTsSafeAudioCodec(codec: string | null): boolean {
  return codec === null || codec === "aac";
}

interface VideoDetailedInfo {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  width?: number;
  height?: number;
  availableHeights: number[];
}

async function probeVideoDetails(
  ytdlpBinary: string,
  videoUrl: string,
  ytCtx?: YtDlpContext,
): Promise<VideoDetailedInfo | null> {
  try {
    const args = buildYtDlpArgs(
      ["--dump-single-json", "--no-playlist", videoUrl],
      ytCtx,
    );

    const res = await runProcess(ytdlpBinary, args, {
      timeoutMs: METADATA_PROCESS_TIMEOUT_MS,
    });
    if (res.code !== 0 || !res.stdout) return null;
    const parsed = JSON.parse(res.stdout);
    const availableHeights = new Set<number>();
    if (Array.isArray(parsed.formats)) {
      for (const f of parsed.formats) {
        if (
          typeof f.height === "number" &&
          f.height > 0 &&
          f.vcodec &&
          f.vcodec !== "none"
        ) {
          availableHeights.add(f.height);
        }
      }
    }
    if (typeof parsed.height === "number" && parsed.height > 0) {
      availableHeights.add(parsed.height);
    }

    return {
      id: String(parsed.id || ""),
      title: String(parsed.title || ""),
      description:
        typeof parsed.description === "string" ? parsed.description : undefined,
      duration:
        typeof parsed.duration === "number"
          ? Math.round(parsed.duration)
          : undefined,
      width: typeof parsed.width === "number" ? parsed.width : undefined,
      height: typeof parsed.height === "number" ? parsed.height : undefined,
      availableHeights: Array.from(availableHeights).sort((a, b) => b - a),
    };
  } catch {
    return null;
  }
}

async function downloadQualityVideo(
  ytdlpBinary: string,
  ffmpegBinary: string | null,
  videoUrl: string,
  targetHeight: number,
  outputFilePath: string,
  ytCtx?: YtDlpContext,
): Promise<boolean> {
  const formatSelector = ffmpegBinary
    ? `bv*[vcodec^=avc1][height<=${targetHeight}]+ba*[ext=m4a]/bv*[height<=${targetHeight}]+ba/b[height<=${targetHeight}]/best`
    : `b[height<=${targetHeight}]/best`;

  const baseArgs = [
    ...(ffmpegBinary ? ["--ffmpeg-location", ffmpegBinary] : []),
    "-f",
    formatSelector,
    "--merge-output-format",
    "mp4",
    "-o",
    outputFilePath,
    "--no-playlist",
    videoUrl,
  ];

  const args = buildYtDlpArgs(baseArgs, ytCtx);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await runProcess(ytdlpBinary, args, {
      timeoutMs: DOWNLOAD_PROCESS_TIMEOUT_MS,
    });
    if (res.code === 0 && fs.existsSync(outputFilePath)) {
      try {
        const s = await fsp.stat(outputFilePath);
        if (s.size > 0) return true;
      } catch {
        // fall through to retry/failure below
      }
    }
    if (attempt === 0 && isRateLimitedError(res.stderr)) {
      console.log(
        yellow(
          `    [warn] YouTube rate limit detected, backing off ${RATE_LIMIT_BACKOFF_MS}ms before retrying...`,
        ),
      );
      await sleep(RATE_LIMIT_BACKOFF_MS);
      continue;
    }
    break;
  }
  return false;
}

interface HlsVariant {
  quality: string;
  filePath: string;
  height: number;
  width: number;
  bandwidth: number;
  videoCodec: string | null;
  audioCodec: string | null;
  fps: number | null;
}

interface SubtitleTrack {
  language: string;
  label: string;
  vttFilePath: string;
}

async function downloadSubtitles(
  ytdlpBinary: string,
  videoUrl: string,
  targetDir: string,
  videoId: string,
  subLangs = "en.*,en",
  ytCtx?: YtDlpContext,
): Promise<SubtitleTrack[]> {
  const outputTemplate = path.join(targetDir, `${videoId}.%(ext)s`);

  const baseArgs = [
    "--write-subs",
    "--write-auto-subs",
    "--sub-lang",
    subLangs,
    "--sub-format",
    "vtt",
    "--convert-subs",
    "vtt",
    "--skip-download",
    "-o",
    outputTemplate,
    "--no-playlist",
    videoUrl,
  ];

  const args = buildYtDlpArgs(baseArgs, ytCtx);
  await runProcess(ytdlpBinary, args, {
    timeoutMs: DOWNLOAD_PROCESS_TIMEOUT_MS,
  });

  const files = await fsp.readdir(targetDir);
  const subtitleTracks: SubtitleTrack[] = [];
  const seenLangs = new Set<string>();

  for (const f of files) {
    if (f.startsWith(videoId) && f.endsWith(".vtt")) {
      const match = f.slice(videoId.length).match(/\.([a-zA-Z0-9_-]+)\.vtt$/);
      const rawLang = match ? match[1]! : "en";
      const cleanLang = rawLang.split(/[-_]/)[0]!.toLowerCase();

      if (seenLangs.has(cleanLang)) continue;
      seenLangs.add(cleanLang);

      const labelMap: Record<string, string> = {
        en: "English",
        hi: "Hindi",
        es: "Spanish",
        fr: "French",
        de: "German",
        zh: "Chinese",
        ja: "Japanese",
        pt: "Portuguese",
        ar: "Arabic",
        ru: "Russian",
        it: "Italian",
        ko: "Korean",
      };
      const label = labelMap[cleanLang] || cleanLang.toUpperCase();

      subtitleTracks.push({
        language: cleanLang,
        label,
        vttFilePath: path.join(targetDir, f),
      });
    }
  }

  return subtitleTracks;
}

interface CleanedVttCue {
  start: string;
  end: string;
  text: string;
}

// Converts a "HH:MM:SS.mmm" WebVTT cue timestamp into seconds, for bucketing
// cues into fixed-duration HLS subtitle segments.
function vttTimeToSeconds(ts: string): number {
  const parts = ts.split(":");
  if (parts.length !== 3) return 0;
  const [h, m, s] = parts as [string, string, string];
  const seconds = Number(s);
  return Number(h) * 3600 + Number(m) * 60 + (Number.isFinite(seconds) ? seconds : 0);
}

function parseWebVttCues(rawContent: string): CleanedVttCue[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  const lines = rawContent
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const cleanedCues: Array<{ start: string; end: string; text: string }> = [];
  const timeRegex =
    /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s*-->\s*((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/;

  let currentStart = "";
  let currentEnd = "";
  let currentLines: string[] = [];

  function flushCue() {
    if (!currentStart || !currentEnd) {
      currentStart = "";
      currentEnd = "";
      currentLines = [];
      return;
    }

    const textPieces = currentLines
      .map((line) => {
        let s = line.replace(/<\d{1,2}:\d{2}(?::\d{2})?\.\d{3}>/g, "");
        s = s.replace(/<\/?[a-zA-Z0-9_.:-]+(?:\s+[^>]*)?>/g, "");
        s = s
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ");
        return s.trim();
      })
      .filter(Boolean);

    const deduped: string[] = [];
    for (const p of textPieces) {
      if (deduped.length === 0 || deduped[deduped.length - 1] !== p) {
        deduped.push(p);
      }
    }

    const fullText = deduped.join("\n").trim();
    if (fullText) {
      if (cleanedCues.length > 0) {
        const lastCue = cleanedCues[cleanedCues.length - 1]!;
        if (lastCue.text === fullText) {
          lastCue.end = currentEnd;
        } else {
          cleanedCues.push({
            start: currentStart,
            end: currentEnd,
            text: fullText,
          });
        }
      } else {
        cleanedCues.push({
          start: currentStart,
          end: currentEnd,
          text: fullText,
        });
      }
    }

    currentStart = "";
    currentEnd = "";
    currentLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) {
      if (currentStart) flushCue();
      continue;
    }

    if (
      line.startsWith("WEBVTT") ||
      line.startsWith("Kind:") ||
      line.startsWith("Language:") ||
      line.startsWith("X-TIMESTAMP-MAP")
    ) {
      continue;
    }
    if (line.startsWith("NOTE")) {
      continue;
    }

    const match = line.match(timeRegex);
    if (match) {
      if (currentStart) flushCue();
      let start = match[1]!;
      let end = match[2]!;
      if (start.split(":").length === 2) start = `00:${start}`;
      if (end.split(":").length === 2) end = `00:${end}`;
      currentStart = start;
      currentEnd = end;
    } else if (currentStart) {
      currentLines.push(line);
    }
  }

  flushCue();

  return cleanedCues;
}

function serializeWebVtt(cues: CleanedVttCue[]): string {
  const output: string[] = [
    "WEBVTT",
    "X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0",
    "",
  ];
  for (const cue of cues) {
    output.push(`${cue.start} --> ${cue.end}`);
    output.push(cue.text);
    output.push("");
  }
  return output.join("\n");
}

const HLS_SEGMENT_SECONDS = 6;
// WebVTT segments don't need frame accuracy like video/audio does, so a
// coarser chunk keeps the file count sane on long videos. The point is just
// that TARGETDURATION reflects a real per-segment duration instead of the
// whole video's length (which some HLS clients, notably Safari/iOS, choke
// on for a single-segment subtitle track).
const SUBTITLE_SEGMENT_SECONDS = 60;

async function packageDirectHls(
  ffmpegBinary: string,
  variants: HlsVariant[],
  subtitles: SubtitleTrack[],
  outputHlsDir: string,
  videoDuration = 7200,
): Promise<{ success: boolean; transcoded: boolean }> {
  await fsp.mkdir(outputHlsDir, { recursive: true });

  const successfulVariants: HlsVariant[] = [];

  // MPEG-TS (what these HLS segments use) only reliably carries H.264/AAC —
  // Safari/iOS will not decode VP9/AV1/Opus in .ts regardless of container
  // support elsewhere. yt-dlp's format selector prefers avc1 but can fall
  // back to "any codec" per-height, so renditions of the *same* video can
  // come back on different codecs. If even one does, re-encode every
  // rendition (not just the offending one) to a uniform H.264/AAC with a
  // forced keyframe interval matching -hls_time — stream-copy can only cut
  // at whatever keyframes the source already has, which differ per
  // independently-downloaded rendition and cause stuttering/frozen frames
  // on an ABR quality switch. Re-encoding only the odd-codec-out renditions
  // would "fix" compatibility but leave that same misalignment behind.
  const needsTranscode = variants.some(
    (v) =>
      !isTsSafeVideoCodec(v.videoCodec) || !isTsSafeAudioCodec(v.audioCodec),
  );
  if (needsTranscode) {
    console.log(
      yellow(
        `  [info] Source rendition(s) use a non-H.264/AAC codec (common for 1080p+ VP9/AV1 on YouTube) — re-encoding all qualities to H.264/AAC for Safari/iOS HLS compatibility and aligned quality-switch keyframes.`,
      ),
    );
  }

  for (const variant of variants) {
    const qualityDir = path.join(outputHlsDir, variant.quality);
    await fsp.mkdir(qualityDir, { recursive: true });
    const variantPlaylist = path.join(qualityDir, `${variant.quality}.m3u8`);
    const segmentPattern = path.join(qualityDir, "segment_%03d.ts");

    const fps = variant.fps && variant.fps > 0 ? variant.fps : 30;
    const gopSize = Math.max(1, Math.round(fps * HLS_SEGMENT_SECONDS));
    const targetBitrate =
      QUALITY_DEFINITIONS[variant.quality]?.defaultBitrate ?? variant.bandwidth;

    const codecArgs = needsTranscode
      ? [
          "-c:v",
          "libx264",
          "-profile:v",
          "main",
          "-pix_fmt",
          "yuv420p",
          "-preset",
          "veryfast",
          "-crf",
          "21",
          "-maxrate",
          String(targetBitrate),
          "-bufsize",
          String(targetBitrate * 2),
          "-g",
          String(gopSize),
          "-keyint_min",
          String(gopSize),
          "-sc_threshold",
          "0",
          "-c:a",
          "aac",
          "-b:a",
          "128k",
          "-ac",
          "2",
        ]
      : ["-c", "copy"];

    const res = await runProcess(
      ffmpegBinary,
      [
        "-y",
        "-i",
        variant.filePath,
        ...codecArgs,
        "-hls_time",
        String(HLS_SEGMENT_SECONDS),
        "-hls_playlist_type",
        "vod",
        "-hls_flags",
        "independent_segments",
        "-hls_segment_filename",
        segmentPattern,
        variantPlaylist,
      ],
      { timeoutMs: DOWNLOAD_PROCESS_TIMEOUT_MS },
    );

    if (res.code === 0 && fs.existsSync(variantPlaylist)) {
      successfulVariants.push(variant);
    } else {
      console.log(
        yellow(
          `  [warn] Direct HLS segmentation fallback for ${variant.quality}`,
        ),
      );
    }
  }

  if (successfulVariants.length === 0) {
    return { success: false, transcoded: needsTranscode };
  }

  const processedSubtitles: Array<{
    language: string;
    label: string;
    relativeUri: string;
  }> = [];

  // Package subtitles into HLS as multiple fixed-duration segments (like
  // the video/audio renditions above) instead of one segment spanning the
  // entire video — TARGETDURATION must reflect an actual segment length,
  // and a single mega-segment WebVTT track is known to misbehave on
  // Safari/iOS even though Shaka-based players tolerate it.
  for (const sub of subtitles) {
    const subDir = path.join(outputHlsDir, "subtitles", sub.language);
    await fsp.mkdir(subDir, { recursive: true });

    let cues: CleanedVttCue[] = [];
    try {
      const rawVtt = await fsp.readFile(sub.vttFilePath, "utf-8");
      cues = parseWebVttCues(rawVtt);
    } catch {
      cues = [];
    }

    const totalDuration = Math.ceil(videoDuration) || 7200;
    const segmentCount = Math.max(
      1,
      Math.ceil(totalDuration / SUBTITLE_SEGMENT_SECONDS),
    );

    const subPlaylistLines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      `#EXT-X-TARGETDURATION:${SUBTITLE_SEGMENT_SECONDS}`,
      "#EXT-X-PLAYLIST-TYPE:VOD",
      "#EXT-X-MEDIA-SEQUENCE:0",
    ];

    for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
      const segStart = segIdx * SUBTITLE_SEGMENT_SECONDS;
      const segEnd = Math.min(segStart + SUBTITLE_SEGMENT_SECONDS, totalDuration);
      // Cues aren't split at segment boundaries — each cue's own absolute
      // (whole-video) timestamps stay intact and are just delivered in
      // whichever segment its start time falls into; every segment shares
      // the same X-TIMESTAMP-MAP anchor so that's sufficient for players.
      const segCues = cues.filter((c) => {
        const start = vttTimeToSeconds(c.start);
        return start >= segStart && start < segEnd;
      });

      const segFileName = `seg_${segIdx}.vtt`;
      await fsp.writeFile(
        path.join(subDir, segFileName),
        serializeWebVtt(segCues),
        "utf-8",
      );

      subPlaylistLines.push(
        `#EXTINF:${(segEnd - segStart).toFixed(3)},`,
        segFileName,
      );
    }
    subPlaylistLines.push("#EXT-X-ENDLIST");

    const subPlaylistPath = path.join(subDir, "prog_index.m3u8");
    await fsp.writeFile(
      subPlaylistPath,
      subPlaylistLines.join("\n") + "\n",
      "utf-8",
    );

    processedSubtitles.push({
      language: sub.language,
      label: sub.label,
      relativeUri: `subtitles/${sub.language}/prog_index.m3u8`,
    });
  }

  // Generate master.m3u8
  const masterPlaylistLines = ["#EXTM3U", "#EXT-X-VERSION:3"];

  const hasSubtitles = processedSubtitles.length > 0;
  if (hasSubtitles) {
    processedSubtitles.forEach((sub, idx) => {
      masterPlaylistLines.push(
        `#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="${sub.label}",DEFAULT=${idx === 0 ? "YES" : "NO"},AUTOSELECT=YES,FORCED=NO,LANGUAGE="${sub.language}",URI="${sub.relativeUri}"`,
      );
    });
  }

  for (const v of successfulVariants) {
    const subsAttr = hasSubtitles ? `,SUBTITLES="subs"` : "";
    masterPlaylistLines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.width}x${v.height}${subsAttr}`,
      `${v.quality}/${v.quality}.m3u8`,
    );
  }

  const masterPlaylistPath = path.join(outputHlsDir, "master.m3u8");
  await fsp.writeFile(
    masterPlaylistPath,
    masterPlaylistLines.join("\n") + "\n",
    "utf-8",
  );
  return { success: true, transcoded: needsTranscode };
}

// Only these count as a finished video download. Without this allowlist a
// stray sidecar (leftover video-only/audio-only fragment from a failed
// merge, a subtitle, a thumbnail) matching `${videoId}.*` would pass the
// old "not .part/.ytdl/.temp" check and get uploaded as if it were the video.
const DOWNLOADED_VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".m4v",
  ".mkv",
  ".webm",
  ".mov",
  ".avi",
  ".flv",
  ".ts",
]);

async function findDownloadedVideoFile(
  tempDir: string,
  videoId: string,
): Promise<string | null> {
  const files = await fsp.readdir(tempDir);
  const match = files.find(
    (f) =>
      f.startsWith(`${videoId}.`) &&
      DOWNLOADED_VIDEO_EXTENSIONS.has(path.extname(f).toLowerCase()),
  );
  return match ? path.join(tempDir, match) : null;
}

// --- Resume/idempotency state -------------------------------------------
// Persisted outside the per-run scratch dir (which is wiped on cleanup) so a
// crash or Ctrl-C mid-playlist doesn't force a full re-download-and-duplicate
// on the next run: we remember the course we already created and which
// video ids already became lessons, and skip straight past them.

interface ImportProgressState {
  version: 1;
  playlistId: string;
  playlistUrl: string;
  courseId: string;
  courseSlug: string;
  instructorId: string;
  sectionIds: string[];
  splitSize: number;
  createdAt: string;
  updatedAt: string;
  importedVideoIds: string[];
}

function veolmsImportStateDir(): string {
  return path.join(veolmsHomeDir(), "import-state");
}

function sanitizeStateKey(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  return cleaned || "unknown";
}

function importStateFilePath(playlistId: string): string {
  return path.join(veolmsImportStateDir(), `${sanitizeStateKey(playlistId)}.json`);
}

async function loadImportState(
  playlistId: string,
): Promise<ImportProgressState | null> {
  try {
    const raw = await fsp.readFile(importStateFilePath(playlistId), "utf-8");
    const parsed = JSON.parse(raw) as Partial<ImportProgressState>;
    if (
      parsed &&
      parsed.playlistId === playlistId &&
      typeof parsed.courseId === "string" &&
      typeof parsed.courseSlug === "string" &&
      typeof parsed.instructorId === "string" &&
      Array.isArray(parsed.sectionIds) &&
      typeof parsed.splitSize === "number" &&
      Array.isArray(parsed.importedVideoIds)
    ) {
      return parsed as ImportProgressState;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveImportState(state: ImportProgressState): Promise<void> {
  const filePath = importStateFilePath(state.playlistId);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  state.updatedAt = new Date().toISOString();
  // Write-then-rename so a crash mid-write never leaves a truncated/corrupt
  // state file that `loadImportState` would trip over on the next run.
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  await fsp.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  await fsp.rename(tmpPath, filePath);
}

async function main() {
  const cliArgs = parseCliArgs();

  if (cliArgs.help) {
    console.log(`
${bold(cyan("VeoLMS YouTube Playlist Importer"))}
Import any YouTube playlist directly as a course with sequential video lessons.

${bold("Usage:")}
  pnpm import:youtube [playlist-url] [instructor-email] [options]

${bold("Video Selection & Filtering:")}
  -u, --url <url>                YouTube Playlist or Video URL
  -e, --email <email>            Instructor or Admin account email
  -t, --title <title>            Override course title (defaults to playlist title)
  --items, --range <list>        Download specific videos by number (e.g. 1-10 or 1,3,5,8-12)
  --start, --video-start <num>   Start video number (1-based)
  --end, --video-end <num>       End video number (1-based)
  --max-videos, --limit <num>    Limit total number of videos to import
  --reverse                      Reverse video sequence in the course
  --skip-shorts                  Skip short videos (< 60 seconds)
  --min-duration <sec>           Skip videos shorter than N seconds
  --max-duration <sec>           Skip videos longer than N seconds

${bold("Quality, Stream & Captions:")}
  -q, --qualities <list>         Qualities to download (e.g. 1080p,720p,480p,360p)
  --subs / --no-subs             Download and auto-activate captions (default: true)
  --sub-langs <list>             Subtitle languages to fetch (default: en.*,en; pass "all" to fetch every available language)
  --direct-hls                   Direct multi-quality HLS packaging (zero transcode, default: true)
  --queue-transcode              Force raw single upload and queue worker transcode job

${bold("Course Structure, Sections & Pricing:")}
  --status <draft|published>     Initial course status (default: draft)
  --section-title <title>        Section title (default: "Course Content")
  --split-sections <num>         Split every N videos into a separate module/section
  --previews <num>               Number of initial lessons marked as free preview (default: 1)
  --pricing <free|paid>          Pricing model (default: free)
  --price <amount>               Regular price amount (e.g. 499)
  --sale-price <amount>          Discounted sale price amount (e.g. 299)
  --currency <INR|USD|EUR>       Currency code (default: INR)

${bold("General Options:")}
  -y, --yes                      Non-interactive mode (accept all defaults)
  -c, --cookies <path>           Path to Netscape cookies.txt file for YouTube authentication
  --cookies-from-browser <name>  Extract cookies directly from browser (e.g. chrome, edge, firefox)
  -k, --keep-temp                Keep downloaded video files in temp directory
  --no-resume, --fresh           Ignore any saved progress for this playlist and start a new course
  --ytdlp-path <path>            Path to custom yt-dlp binary
  --ffmpeg-path <path>           Path to custom ffmpeg binary
  VEOLMS_IMPORT_TMP              Scratch directory (disk-backed; avoid Ubuntu /tmp tmpfs)
  -h, --help                     Show this help message

${bold("Examples:")}
  pnpm import:youtube https://www.youtube.com/playlist?list=PL12345 instructor@example.com
  pnpm import:youtube -u https://www.youtube.com/playlist?list=PL12345 --items 1-5,8,12 --pricing paid --price 499
  pnpm import:youtube -u https://www.youtube.com/playlist?list=PL12345 --start 5 --end 15 --split-sections 5
  pnpm import:youtube -u https://www.youtube.com/playlist?list=PL12345 -c cookies.txt
`);
    process.exit(0);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log(
    `\n${bold(cyan("=== VeoLMS YouTube Playlist Course Importer ==="))}\n`,
  );

  let playlistUrl = cliArgs.playlistUrl;
  if (!playlistUrl) {
    playlistUrl = (
      await rl.question(
        `${cyan("? ")}${bold("Enter YouTube Playlist or Video URL: ")}`,
      )
    ).trim();
  }

  if (!playlistUrl) {
    console.error(`\n${red("✘ Error:")} Playlist URL is required.\n`);
    rl.close();
    process.exit(1);
  }

  const database = createDatabase(config.DATABASE_URL);
  const services = createServices({
    config,
    logger: cliLogger as never,
  });
  const mediaService = createMediaService({
    database,
    services,
  });

  const scratchRoot = await resolveImportScratchRoot();
  if (process.platform !== "win32" && scratchRoot === os.tmpdir()) {
    console.log(
      yellow(
        `Scratch directory fell back to ${scratchRoot}, which is often a RAM-backed tmpfs on Ubuntu. Set VEOLMS_IMPORT_TMP to a disk path if imports run out of space.`,
      ),
    );
  } else {
    console.log(`${green("✓")} Scratch directory: ${dim(scratchRoot)}`);
  }
  await assertEnoughDiskSpace(
    scratchRoot,
    MIN_IMPORT_SCRATCH_BYTES,
    "to start import",
  );
  const tempDir = await fsp.mkdtemp(path.join(scratchRoot, "veolms-yt-"));

  // Ctrl-C / SSH drop / systemd stop must not orphan yt-dlp/ffmpeg children —
  // kill the whole tree, then run the same cleanup the normal `finally` does.
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(
      `\n${yellow("!")} Received ${signal}; stopping yt-dlp/ffmpeg and cleaning up...`,
    );
    killAllActiveChildren();
    rl.close();
    if (!cliArgs.keepTemp) {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    await database.destroy().catch(() => {});
    process.exit(128 + (signal === "SIGINT" ? 2 : 15));
  };
  const onSigint = () => void shutdown("SIGINT");
  const onSigterm = () => void shutdown("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  const ytCtx: YtDlpContext = {
    cookies: cliArgs.cookies,
    cookiesFromBrowser: cliArgs.cookiesFromBrowser,
  };

  if (ytCtx.cookies) {
    console.log(
      `${green("✓")} Using cookies authentication: ${dim(ytCtx.cookies)}`,
    );
  } else if (ytCtx.cookiesFromBrowser) {
    console.log(
      `${green("✓")} Extracting cookies from browser: ${dim(ytCtx.cookiesFromBrowser)}`,
    );
  }

  try {
    // 1. Locate / Auto-update yt-dlp & Auto-install FFmpeg
    const ytdlp = await ensureYtDlpBinary(cliArgs.ytdlpPath, rl);
    const ytdlpBinary = ytdlp.path;
    ytCtx.supportsJsRuntimes = ytdlp.supportsJsRuntimes;
    console.log(
      `${green("✓")} yt-dlp: ${dim(ytdlpBinary)}${ytdlp.supportsJsRuntimes ? " (node JS runtime enabled)" : ""}`,
    );
    const ffmpegBinary = await ensureFfmpegBinary(cliArgs.ffmpegPath, rl);

    if (ffmpegBinary) {
      console.log(
        `${green("✓")} FFmpeg detected at: ${dim(ffmpegBinary)} (High-quality format merging & fast HLS enabled)`,
      );
    } else {
      console.log(
        `${yellow("!")} FFmpeg not detected - downloading standard format streams.`,
      );
    }

    // 2. Identify Instructor User
    let instructor = await resolveInstructor(
      database,
      cliArgs.instructorEmail,
      rl,
    );
    console.log(
      `\n${green("✓")} Instructor assigned: ${bold(instructor.display_name)} (${dim(instructor.email ?? "")})`,
    );

    // 3. Extract metadata
    const playlist = await extractPlaylistMetadata(
      ytdlpBinary,
      playlistUrl,
      ytCtx,
    );
    const finalCourseTitle = cliArgs.courseTitle || playlist.title;
    let videoEntries = playlist.entries;

    if (videoEntries.length === 0) {
      throw new Error("No videos found in the specified playlist URL.");
    }

    // Resume support: key saved progress off the playlist id (falling back
    // to a hash of the URL for single-video "playlists" that have none) so a
    // crash or Ctrl-C mid-import can pick up where it left off instead of
    // creating a duplicate course and re-downloading everything.
    const playlistId =
      playlist.id && playlist.id.trim().length > 0
        ? playlist.id.trim()
        : crypto.createHash("sha256").update(playlistUrl).digest("hex").slice(0, 16);
    let importState = cliArgs.noResume
      ? null
      : await loadImportState(playlistId);

    if (importState && importState.instructorId !== instructor.id) {
      console.log(
        yellow(
          `! Found saved progress for this playlist under a different instructor; continuing with the original instructor to keep media ownership consistent.`,
        ),
      );
      const resumedInstructor = await database
        .selectFrom("users")
        .selectAll()
        .where("id", "=", importState.instructorId)
        .executeTakeFirst();
      if (resumedInstructor) {
        instructor = resumedInstructor;
      } else {
        console.log(
          yellow(
            `  Original instructor account no longer exists; starting a fresh course instead.`,
          ),
        );
        importState = null;
      }
    }

    // Duration Filters (shorts / min / max duration)
    if (cliArgs.skipShorts) {
      const beforeCount = videoEntries.length;
      videoEntries = videoEntries.filter(
        (v) => !v.duration || v.duration >= 60,
      );
      console.log(
        `  ${dim("•")} Filtered out ${beforeCount - videoEntries.length} YouTube Shorts (< 60s)`,
      );
    }
    if (cliArgs.minDuration && cliArgs.minDuration > 0) {
      videoEntries = videoEntries.filter(
        (v) => !v.duration || v.duration >= cliArgs.minDuration!,
      );
    }
    if (cliArgs.maxDuration && cliArgs.maxDuration > 0) {
      videoEntries = videoEntries.filter(
        (v) => !v.duration || v.duration <= cliArgs.maxDuration!,
      );
    }

    // Video Selection: Flags vs Interactive Selection Wizard
    const totalFound = videoEntries.length;
    if (cliArgs.items) {
      const indices = parseVideoSelectionRange(cliArgs.items, totalFound);
      if (indices.length > 0) {
        videoEntries = indices
          .map((idx) => videoEntries[idx - 1]!)
          .filter(Boolean);
        console.log(
          `  ${dim("•")} Selected ${videoEntries.length} videos from range: ${cyan(cliArgs.items)}`,
        );
      }
    } else if (cliArgs.startVideo || cliArgs.endVideo) {
      const start = Math.max(1, cliArgs.startVideo ?? 1);
      const end = Math.min(totalFound, cliArgs.endVideo ?? totalFound);
      videoEntries = videoEntries.slice(start - 1, end);
      console.log(
        `  ${dim("•")} Selected videos from #${start} to #${end} (Total: ${videoEntries.length})`,
      );
    } else if (cliArgs.maxVideos && cliArgs.maxVideos > 0) {
      videoEntries = videoEntries.slice(0, cliArgs.maxVideos);
      console.log(
        `  ${dim("•")} Limited to first ${videoEntries.length} videos`,
      );
    } else if (totalFound > 1 && !cliArgs.yes) {
      // Interactive Selection Wizard
      console.log(
        `\n${bold(`Playlist contains ${cyan(String(totalFound))} videos:`)}`,
      );
      const previewLimit = Math.min(10, totalFound);
      for (let idx = 0; idx < previewLimit; idx++) {
        const v = videoEntries[idx]!;
        const durStr = v.duration
          ? ` [${Math.floor(v.duration / 60)}m ${v.duration % 60}s]`
          : "";
        console.log(`  ${dim(`[${idx + 1}]`)} ${v.title}${dim(durStr)}`);
      }
      if (totalFound > 10) {
        console.log(`  ${dim(`... and ${totalFound - 10} more videos`)}`);
      }

      console.log(`\n${bold("Select download option:")}`);
      console.log(
        `  ${cyan("[1]")} Download ALL ${totalFound} videos (Default)`,
      );
      console.log(`  ${cyan("[2]")} Download first N videos (e.g. 5)`);
      console.log(
        `  ${cyan("[3]")} Download specific range or items (e.g. 1-10 or 1,3,5,8-12)`,
      );
      console.log(
        `  ${cyan("[4]")} Custom start and end video number (e.g. start at #5, end at #15)`,
      );

      const choice = (
        await rl.question(
          `\n${cyan("? ")}${bold("Choose an option [1-4] (default 1): ")}`,
        )
      ).trim();
      if (choice === "2") {
        const countAns = (
          await rl.question(
            `${cyan("? ")}${bold("How many videos to download? (e.g. 5): ")}`,
          )
        ).trim();
        const count = parseInt(countAns, 10);
        if (!isNaN(count) && count > 0) {
          videoEntries = videoEntries.slice(0, count);
        }
      } else if (choice === "3") {
        const rangeAns = (
          await rl.question(
            `${cyan("? ")}${bold("Enter range or items (e.g. 1-5, 8, 12): ")}`,
          )
        ).trim();
        const indices = parseVideoSelectionRange(rangeAns, totalFound);
        if (indices.length > 0) {
          videoEntries = indices
            .map((idx) => videoEntries[idx - 1]!)
            .filter(Boolean);
        }
      } else if (choice === "4") {
        const startAns = (
          await rl.question(
            `${cyan("? ")}${bold("Start video number (1-" + totalFound + "): ")}`,
          )
        ).trim();
        const endAns = (
          await rl.question(
            `${cyan("? ")}${bold("End video number (1-" + totalFound + "): ")}`,
          )
        ).trim();
        const startNum = Math.max(1, parseInt(startAns, 10) || 1);
        const endNum = Math.min(totalFound, parseInt(endAns, 10) || totalFound);
        videoEntries = videoEntries.slice(startNum - 1, endNum);
      }
    }

    if (cliArgs.reverse) {
      videoEntries.reverse();
      console.log(`  ${dim("•")} Reversed video sequence in course`);
    }

    if (videoEntries.length === 0) {
      throw new Error("No videos selected for import.");
    }

    console.log(`\n${bold("Course to be created:")}`);
    console.log(`  ${dim("•")} Title:         ${cyan(finalCourseTitle)}`);
    console.log(
      `  ${dim("•")} Total Videos:  ${cyan(String(videoEntries.length))}`,
    );
    console.log(`  ${dim("•")} Status:        ${cyan(cliArgs.status)}`);
    console.log(
      `  ${dim("•")} Pricing:       ${cyan(cliArgs.pricingType === "paid" ? `${cliArgs.currency} ${cliArgs.price}` : "Free")}`,
    );
    console.log(
      `  ${dim("•")} Subtitles:     ${cyan(cliArgs.subtitles ? `Enabled (${cliArgs.subLangs})` : "Disabled")}`,
    );

    let courseId: string;
    let slug: string;
    let sectionIds: string[];
    let splitSize: number;

    if (importState) {
      // 4-6. Resume: reuse the course/sections created by the earlier run
      // instead of creating a duplicate.
      courseId = importState.courseId;
      slug = importState.courseSlug;
      sectionIds = importState.sectionIds;
      splitSize = importState.splitSize;
      console.log(
        `\n${green("✓")} Resuming previous import (Course ID: ${dim(courseId)}, Slug: ${cyan(slug)}, ${importState.importedVideoIds.length}/${videoEntries.length} video(s) already imported)`,
      );
    } else {
      // 4. Download Course Thumbnail
      let thumbnailMediaId: string | null = null;
      const firstVideo = videoEntries[0]!;
      console.log(
        `\n${cyan("➜")} Downloading course thumbnail from first video (${firstVideo.title})...`,
      );
      const thumbData = await downloadThumbnail(firstVideo, tempDir);

    if (thumbData) {
      const thumbStat = await fsp.stat(thumbData.filePath);
      thumbnailMediaId = crypto.randomUUID();
      const storageKey = `media/${instructor.id}/${thumbnailMediaId}.jpg`;

      await services.storage.uploadFile(
        storageKey,
        thumbData.filePath,
        thumbData.mimeType,
      );

      await mediaRepo.insertMediaAsset(database, {
        id: thumbnailMediaId,
        owner_id: instructor.id,
        type: "image",
        storage_provider: "s3",
        storage_key: storageKey,
        original_filename: "playlist_thumbnail.jpg",
        mime_type: thumbData.mimeType,
        size_bytes: thumbStat.size,
        status: "ready",
      });

      console.log(
        `${green("✓")} Thumbnail uploaded (Media ID: ${dim(thumbnailMediaId)})`,
      );
    }

    // 5. Create Course in Database
    const baseSlug = slugify(finalCourseTitle);
    slug = baseSlug;
    let attempts = 0;
    while (await courseRepo.findCourseBySlugIncludingDeleted(database, slug)) {
      attempts++;
      slug = `${baseSlug}-${crypto.randomBytes(3).toString("hex")}`;
      if (attempts > 5) {
        slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;
        break;
      }
    }

    courseId = crypto.randomUUID();
    const now = new Date();

    await courseRepo.insertCourse(database, {
      id: courseId,
      slug,
      title: finalCourseTitle,
      short_description: playlist.description
        ? playlist.description.slice(0, 160)
        : null,
      description: playlist.description || null,
      creator_id: instructor.id,
      category_id: null,
      difficulty: "beginner",
      thumbnail_media_id: thumbnailMediaId,
      trailer_media_id: null,
      instructor_alias: instructor.display_name,
      status: "draft",
      version: 1,
      created_at: now,
      updated_at: now,
    });

    // If requested published, update status and published_at
    if (cliArgs.status === "published") {
      await database
        .updateTable("courses")
        .set({ status: "published", published_at: now })
        .where("id", "=", courseId)
        .execute();
    }

    // Default Settings, Access Rules, Pricing
    await configRepo.upsertSettings(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      allow_qa: true,
      allow_comments: true,
      allow_downloads: false,
      certificate_enabled: false,
      show_instructor_name: true,
      language: "en",
      estimated_duration: null,
      created_at: now,
      updated_at: now,
    });

    await configRepo.upsertAccessRule(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      access_type: "everyone",
      duration_type: "lifetime",
      duration_days: null,
      created_at: now,
      updated_at: now,
    });

    await configRepo.upsertPricing(database, {
      id: crypto.randomUUID(),
      course_id: courseId,
      pricing_type: cliArgs.pricingType,
      price: cliArgs.price,
      currency: cliArgs.currency,
      sale_price: cliArgs.salePrice,
      created_at: now,
      updated_at: now,
    });

    // 6. Create Section(s)
    sectionIds = [];
    splitSize =
      cliArgs.splitSections && cliArgs.splitSections > 0
        ? cliArgs.splitSections
        : videoEntries.length;
    const totalSections = Math.ceil(videoEntries.length / splitSize);

    for (let sIdx = 0; sIdx < totalSections; sIdx++) {
      const sId = crypto.randomUUID();
      const sTitle =
        totalSections > 1
          ? `${cliArgs.sectionTitle} - Part ${sIdx + 1} (Lessons ${sIdx * splitSize + 1}-${Math.min((sIdx + 1) * splitSize, videoEntries.length)})`
          : cliArgs.sectionTitle;

      await database
        .insertInto("course_sections")
        .values({
          id: sId,
          course_id: courseId,
          title: sTitle,
          position: sIdx,
          created_at: now,
          updated_at: now,
        })
        .execute();

      sectionIds.push(sId);
    }

    console.log(
      `${green("✓")} Course and ${sectionIds.length} Section(s) created (Course ID: ${dim(courseId)}, Slug: ${cyan(slug)})`,
    );

      importState = {
        version: 1,
        playlistId,
        playlistUrl,
        courseId,
        courseSlug: slug,
        instructorId: instructor.id,
        sectionIds,
        splitSize,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        importedVideoIds: [],
      };
      await saveImportState(importState);
    }

    // 7. Process Videos sequentially
    console.log(`\n${bold("Starting Video Downloads & Processing:")}`);

    const alreadyImportedIds = new Set(importState?.importedVideoIds ?? []);
    const failedVideos: string[] = [];

    for (let i = 0; i < videoEntries.length; i++) {
      const video = videoEntries[i]!;
      const videoNum = `[${i + 1}/${videoEntries.length}]`;

      if (alreadyImportedIds.has(video.id)) {
        console.log(
          `${dim(videoNum)} ${dim("•")} Skipping ${video.title} — already imported in a previous run`,
        );
        continue;
      }

      console.log(
        `\n${cyan(videoNum)} Processing: ${bold(video.title)} (${dim(video.id)})...`,
      );

      await assertEnoughDiskSpace(
        tempDir,
        estimateScratchBytesForVideo(video.duration, cliArgs.qualities.length),
        `for video ${i + 1}/${videoEntries.length} (${video.title})`,
      );

      const videoUrl =
        video.url || `https://www.youtube.com/watch?v=${video.id}`;
      const videoMediaId = crypto.randomUUID();

      let isDirectHlsSuccess = false;
      let primaryVideoPath: string | null = null;
      let primaryVideoSize = 0;
      let primaryWidth = 1920;
      let primaryHeight = 1080;
      let videoDuration = video.duration ?? 0;
      let downloadedQualityNames: string[] = [];
      let downloadedSubtitles: SubtitleTrack[] = [];

      let videoDescription = video.description || "";

      // Deferred DB write for whichever path succeeds (direct-HLS or
      // fallback) — executed in the same transaction as the lesson insert
      // below so a crash/exception never leaves "ready" media with no
      // lesson pointing at it (matches the transaction boundary
      // apps/media-worker/src/processor.ts already uses for these tables).
      let pendingMediaWrite:
        | ((trx: typeof database) => Promise<void>)
        | null = null;
      let shouldQueueTranscode = false;
      let wasTranscoded = false;

      // Captions only need yt-dlp (no ffmpeg), so fetch them up front,
      // regardless of whether direct-HLS packaging ends up running — this
      // used to be nested inside the direct-HLS branch below, which meant
      // --queue-transcode and any ffmpeg-missing/HLS-packaging-failure
      // fallback silently ended up with no captions at all, even when
      // --subs was requested and yt-dlp had them available right here.
      const videoTempDir = path.join(tempDir, `vid_${video.id}`);
      await fsp.mkdir(videoTempDir, { recursive: true });

      if (cliArgs.subtitles) {
        console.log(`  ${dim("•")} Checking for YouTube captions/subtitles...`);
        downloadedSubtitles = await downloadSubtitles(
          ytdlpBinary,
          videoUrl,
          videoTempDir,
          video.id,
          cliArgs.subLangs,
          ytCtx,
        );
        if (downloadedSubtitles.length > 0) {
          console.log(
            `  ${green("✓")} Captions downloaded: ${cyan(downloadedSubtitles.map((s) => s.label).join(", "))}`,
          );
        } else {
          console.log(`  ${dim("•")} No YouTube captions found for this video.`);
        }
      }

      // Check if Direct Multi-Quality HLS mode is enabled and FFmpeg is available
      if (cliArgs.directHls && ffmpegBinary) {
        console.log(
          `  ${dim("•")} Inspecting available YouTube qualities with yt-dlp...`,
        );
        const probe = await probeVideoDetails(ytdlpBinary, videoUrl, ytCtx);
        if (probe?.duration) videoDuration = probe.duration;
        if (probe?.width) primaryWidth = probe.width;
        if (probe?.height) primaryHeight = probe.height;
        if (probe?.description) videoDescription = probe.description;

        const maxAvailableHeight =
          probe?.availableHeights && probe.availableHeights.length > 0
            ? probe.availableHeights[0]!
            : (probe?.height ?? 1080);

        // Filter qualities that are available for this video
        const targetQualities = cliArgs.qualities.filter((q) => {
          const qDef = QUALITY_DEFINITIONS[q];
          return qDef && qDef.height <= maxAvailableHeight;
        });

        // If target qualities list is empty, pick the closest available resolution
        const finalQualitiesToDownload =
          targetQualities.length > 0
            ? targetQualities
            : probe?.availableHeights?.[0]
              ? [nearestStandardQualityLabel(probe.availableHeights[0])]
              : ["360p"];

        console.log(
          `  ${dim("•")} Downloading multi-quality streams: ${cyan(finalQualitiesToDownload.join(", "))}`,
        );

        const downloadedVariants: HlsVariant[] = [];

        for (const [qIdx, q] of finalQualitiesToDownload.entries()) {
          if (qIdx > 0) await sleep(INTER_QUALITY_DELAY_MS);

          const qDef = QUALITY_DEFINITIONS[q] || {
            height: 360,
            width: 640,
            defaultBitrate: 800000,
          };
          const qFilePath = path.join(videoTempDir, `${video.id}_${q}.mp4`);
          console.log(`    ${dim("→")} Fetching ${bold(q)} stream...`);

          const dlOk = await downloadQualityVideo(
            ytdlpBinary,
            ffmpegBinary,
            videoUrl,
            qDef.height,
            qFilePath,
            ytCtx,
          );

          if (dlOk && fs.existsSync(qFilePath)) {
            const stat = await fsp.stat(qFilePath);
            const bandwidth =
              videoDuration > 0
                ? Math.round((stat.size * 8) / videoDuration)
                : qDef.defaultBitrate;

            // yt-dlp's own selector prefers avc1 but silently falls back to
            // "any codec" (often VP9/AV1 for 1080p+) when YouTube has no
            // avc1 at that height — trust what actually landed on disk, not
            // the requested quality's nominal dimensions.
            const streamInfo = await probeMediaStreamInfo(
              ffmpegBinary,
              qFilePath,
            );

            downloadedVariants.push({
              quality: q,
              filePath: qFilePath,
              height: streamInfo.height ?? qDef.height,
              width: streamInfo.width ?? qDef.width,
              bandwidth: Math.max(100000, bandwidth),
              videoCodec: streamInfo.videoCodec,
              audioCodec: streamInfo.audioCodec,
              fps: streamInfo.fps,
            });

            if (!primaryVideoPath) {
              primaryVideoPath = qFilePath;
              primaryVideoSize = stat.size;
              primaryWidth = streamInfo.width ?? qDef.width;
              primaryHeight = streamInfo.height ?? qDef.height;
            }
          }
        }

        if (downloadedVariants.length > 0) {
          console.log(`  ${dim("•")} Packaging HLS stream variants...`);
          const hlsOutputDir = path.join(videoTempDir, "hls");
          const hlsResult = await packageDirectHls(
            ffmpegBinary,
            downloadedVariants,
            downloadedSubtitles,
            hlsOutputDir,
            videoDuration,
          );
          wasTranscoded = hlsResult.transcoded;

          if (hlsResult.success) {
            downloadedQualityNames = downloadedVariants.map((v) => v.quality);
            const outputPrefix = `transcoded/${videoMediaId}`;
            console.log(
              `  ${dim("•")} Uploading multi-quality HLS streams to storage (${downloadedQualityNames.join(", ")})...`,
            );

            await services.storage.uploadDirectory(hlsOutputDir, outputPrefix);

            // Playback always resolves through video_outputs.master_playlist_path
            // when it's set (see stream.service.ts) — the web player only ever
            // requests /media/:id for thumbnails, never for video. Uploading the
            // full source .mp4 on top of the HLS renditions would double both
            // storage and upload time for a file nothing reads, so
            // media_assets.storage_key just references the HLS output instead
            // of a separate re-upload.
            const masterPlaylistPath = `${outputPrefix}/master.m3u8`;

            // Defer the media_assets/video_outputs/video_jobs writes until
            // they can run in the same transaction as the lesson insert.
            pendingMediaWrite = async (trx) => {
              await trx
                .insertInto("media_assets")
                .values({
                  id: videoMediaId,
                  owner_id: instructor.id,
                  type: "video",
                  storage_provider: "s3",
                  storage_key: masterPlaylistPath,
                  original_filename: `${video.title.slice(0, 100)}.m3u8`,
                  mime_type: "application/vnd.apple.mpegurl",
                  size_bytes: primaryVideoSize,
                  width: primaryWidth,
                  height: primaryHeight,
                  duration_seconds: videoDuration || null,
                  status: "ready",
                })
                .execute();

              await trx
                .insertInto("video_outputs")
                .values({
                  id: crypto.randomUUID(),
                  video_id: videoMediaId,
                  master_playlist_path: masterPlaylistPath,
                  created_at: new Date(),
                })
                .execute();

              await trx
                .insertInto("video_jobs")
                .values({
                  id: crypto.randomUUID(),
                  video_id: videoMediaId,
                  video_key: masterPlaylistPath,
                  output_prefix: outputPrefix,
                  video_size: primaryVideoSize,
                  qualities: downloadedQualityNames as never,
                  status: "completed",
                  progress_percent: 100,
                  completed_at: new Date(),
                  created_at: new Date(),
                })
                .execute();
            };

            isDirectHlsSuccess = true;
          }
        }
      }

      // Fallback path: Single stream download + worker queue
      if (!isDirectHlsSuccess) {
        if (cliArgs.directHls) {
          console.log(
            `  ${yellow("!")} Multi-quality HLS fallback: Downloading single stream...`,
          );
        }
        if (downloadedSubtitles.length > 0) {
          console.log(
            yellow(
              `  [warn] Captions were downloaded but can't be attached — this video is going through queued transcoding, which doesn't support captions. They will not appear in the player.`,
            ),
          );
        }

        const outputTemplate = path.join(tempDir, `${video.id}.%(ext)s`);
        const strategies: Array<{ name: string; args: string[] }> = [];

        if (ffmpegBinary) {
          strategies.push({
            name: "Best MP4 (Merged)",
            args: [
              "--ffmpeg-location",
              ffmpegBinary,
              "-f",
              "bv*[ext=mp4]+ba*[ext=m4a]/b[ext=mp4]/bv*+ba/b/best",
              "--merge-output-format",
              "mp4",
            ],
          });
        }
        strategies.push({
          name: "Standard Best Stream",
          args: ["-f", "best/b"],
        });

        let localVideoPath: string | null = null;
        let lastError = "";

        for (const strat of strategies) {
          const fullArgs = buildYtDlpArgs(
            [...strat.args, "-o", outputTemplate, "--no-playlist", videoUrl],
            ytCtx,
          );

          let dlRes: Awaited<ReturnType<typeof runProcess>> | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            dlRes = await runProcess(ytdlpBinary, fullArgs, {
              timeoutMs: DOWNLOAD_PROCESS_TIMEOUT_MS,
            });
            localVideoPath = await findDownloadedVideoFile(tempDir, video.id);
            if (
              dlRes.code === 0 &&
              localVideoPath &&
              fs.existsSync(localVideoPath)
            ) {
              break;
            }
            localVideoPath = null;
            if (attempt === 0 && isRateLimitedError(dlRes.stderr)) {
              console.log(
                yellow(
                  `  [warn] YouTube rate limit detected, backing off ${RATE_LIMIT_BACKOFF_MS}ms before retrying "${strat.name}"...`,
                ),
              );
              await sleep(RATE_LIMIT_BACKOFF_MS);
              continue;
            }
            break;
          }

          if (localVideoPath) break;

          lastError = dlRes?.stderr || dlRes?.stdout || "";
        }

        if (!localVideoPath || !fs.existsSync(localVideoPath)) {
          console.error(`${red("✘ Failed to download video:")} ${video.title}`);
          if (
            lastError.includes("Sign in to confirm you're not a bot") ||
            lastError.includes("bot")
          ) {
            console.error(
              `  ${yellow("!")} YouTube bot detection encountered. Try running with: ${bold("--cookies cookies.txt")} or place a ${bold("cookies.txt")} file in the root directory.`,
            );
          }
          console.error(dim(lastError.slice(-300)));
          failedVideos.push(video.title);
          continue;
        }

        const vStat = await fsp.stat(localVideoPath);
        const videoExt = path.extname(localVideoPath) || ".mp4";
        const mimeType = resolveVideoMimeType(localVideoPath);
        const videoStorageKey = `media/${instructor.id}/${videoMediaId}${videoExt}`;

        console.log(
          `  ${dim("•")} Uploading to storage (${(vStat.size / 1024 / 1024).toFixed(1)} MB)...`,
        );
        await services.storage.uploadFile(
          videoStorageKey,
          localVideoPath,
          mimeType,
        );

        // Deferred, same reason as the direct-HLS branch above; also defer
        // queueing the transcode job until after the transaction commits,
        // since it reads this row back through the outer (non-trx)
        // connection and won't see it until the insert is committed.
        pendingMediaWrite = async (trx) => {
          await trx
            .insertInto("media_assets")
            .values({
              id: videoMediaId,
              owner_id: instructor.id,
              type: "video",
              storage_provider: "s3",
              storage_key: videoStorageKey,
              original_filename: `${video.title.slice(0, 100)}${videoExt}`,
              mime_type: mimeType,
              size_bytes: vStat.size,
              duration_seconds: video.duration ?? null,
              status: "uploaded",
            })
            .execute();
        };
        shouldQueueTranscode = true;
      }

      if (!videoDescription) {
        const probe = await probeVideoDetails(ytdlpBinary, videoUrl, ytCtx);
        if (probe?.description) videoDescription = probe.description;
      }

      // Create lesson record
      const lessonId = crypto.randomUUID();
      const lessonNow = new Date();
      const targetSectionId =
        sectionIds[Math.floor(i / splitSize)] || sectionIds[0]!;
      const lessonPosition = i % splitSize;
      const isPreview = i < cliArgs.previewCount;

      // Media row(s) + lesson commit together — a crash between them can no
      // longer leave "ready" media with no lesson, or a lesson pointing at
      // media that was never actually persisted.
      await database.transaction().execute(async (trx) => {
        await pendingMediaWrite!(trx);
        await trx
          .insertInto("course_lessons")
          .values({
            id: lessonId,
            course_id: courseId,
            section_id: targetSectionId,
            title: video.title,
            description: videoDescription.trim() || null,
            content_type: "video",
            content_media_id: videoMediaId,
            position: lessonPosition,
            is_preview: isPreview,
            is_published: true,
            created_at: lessonNow,
            updated_at: lessonNow,
          })
          .execute();
      });

      // Only safe to queue now that the media row above is committed and
      // visible through the non-transactional connection queueTranscodeJob
      // reads from.
      if (shouldQueueTranscode) {
        await mediaService.queueTranscodeJob(
          videoMediaId,
          instructor.id,
          cliLogger as never,
        );
      }

      const captionInfo =
        downloadedSubtitles.length > 0
          ? ` | Captions: ${cyan(downloadedSubtitles.map((s) => s.label).join(", "))}`
          : "";
      const qualityStatusInfo = isDirectHlsSuccess
        ? `(Direct HLS Qualities: ${cyan(downloadedQualityNames.join(", "))}${captionInfo} - ${
            wasTranscoded
              ? yellow("Re-encoded to H.264/AAC for compatibility")
              : green("Ready without transcoding")
          })`
        : `(Transcode Job Queued)`;

      console.log(
        `  ${green("✓")} Lesson ${i + 1} added: ${bold(video.title)} ${qualityStatusInfo}`,
      );

      // Record progress immediately so a crash/Ctrl-C after this point
      // resumes past this video instead of re-downloading/duplicating it.
      importState.importedVideoIds.push(video.id);
      await saveImportState(importState).catch((e) => {
        console.log(
          yellow(
            `  [warn] Could not persist import progress: ${e instanceof Error ? e.message : e}`,
          ),
        );
      });

      // Remove local temp files unless keepTemp is true
      if (!cliArgs.keepTemp) {
        const videoTempDir = path.join(tempDir, `vid_${video.id}`);
        await fsp
          .rm(videoTempDir, { recursive: true, force: true })
          .catch(() => {});
        const singleLocal = await findDownloadedVideoFile(tempDir, video.id);
        if (singleLocal) {
          await fsp.unlink(singleLocal).catch(() => {});
        }
      }

      if (i < videoEntries.length - 1) {
        await sleep(INTER_VIDEO_DELAY_MS);
      }
    }

    // 8. Summary Output
    const courseUrl = `${config.WEB_URL}/courses/${slug}`;
    const editorUrl = `${config.WEB_URL}/instructor/courses/${courseId}`;
    // Actual lessons that exist in the course, not the pre-loop selection —
    // includes videos resumed from a prior run, excludes any that failed.
    const actualLessonCount = importState.importedVideoIds.length;
    const hadFailures = failedVideos.length > 0;

    console.log(
      `\n${bold((hadFailures ? yellow : green)("======================================================="))}`,
    );
    console.log(
      hadFailures
        ? `${bold(yellow(`! Course imported with ${failedVideos.length} failed video(s)`))}`
        : `${bold(green("✓ Course imported successfully from YouTube Playlist!"))}`,
    );
    console.log(
      `${bold((hadFailures ? yellow : green)("======================================================="))}`,
    );
    console.log(`  ${dim("•")} Course Title:   ${bold(finalCourseTitle)}`);
    console.log(`  ${dim("•")} Course Slug:    ${cyan(slug)}`);
    console.log(`  ${dim("•")} Course ID:      ${cyan(courseId)}`);
    console.log(
      `  ${dim("•")} Instructor:     ${cyan(instructor.display_name)} (${instructor.email})`,
    );
    console.log(
      `  ${dim("•")} Total Lessons:  ${cyan(String(actualLessonCount))}${
        hadFailures ? dim(` (of ${videoEntries.length} selected)`) : ""
      }`,
    );
    console.log(`  ${dim("•")} Course Status:  ${cyan(cliArgs.status)}`);
    console.log(`  ${dim("•")} Public Link:    ${bold(cyan(courseUrl))}`);
    console.log(`  ${dim("•")} Instructor Link:${bold(cyan(editorUrl))}`);
    if (hadFailures) {
      console.log(
        `  ${yellow("•")} Failed videos:  ${dim(failedVideos.join(", "))}`,
      );
      console.log(
        `  ${dim("Re-run the same command to retry the failed video(s) — already-imported lessons are skipped automatically.")}`,
      );
      process.exitCode = 1;
    }
    console.log("");
  } catch (error) {
    console.error(
      `\n${red("✘ Import failed:")}`,
      error instanceof Error ? error.message : error,
      "\n",
    );
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
    rl.close();
    // Cleanup temp directory
    if (!cliArgs.keepTemp) {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
    await database.destroy();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
