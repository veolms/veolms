import { spawn } from "node:child_process";

// Tracks every live yt-dlp/ffmpeg/packager child so a SIGINT/SIGTERM (or a
// per-call timeout) can terminate the whole tree instead of orphaning it.
const activeChildren = new Set<ReturnType<typeof spawn>>();

export const QUICK_PROCESS_TIMEOUT_MS = 30_000; // --version/--help/which/-U pings
export const METADATA_PROCESS_TIMEOUT_MS = 5 * 60_000; // --dump-single-json probes, archive extraction
export const DOWNLOAD_PROCESS_TIMEOUT_MS =
  Number(process.env.VEOLMS_IMPORT_PROCESS_TIMEOUT_MS) || 60 * 60_000; // actual video/subtitle download & ffmpeg encode

const MAX_BUFFERED_OUTPUT_BYTES = 2 * 1024 * 1024; // cap retained stdout/stderr per process

function capAppend(
  existing: string,
  addition: string,
  maxBytes: number,
): string {
  const combined = existing + addition;
  return combined.length <= maxBytes
    ? combined
    : combined.slice(combined.length - maxBytes);
}

/** Best-effort kill of a child and, on Windows, its full descendant tree. */
export function killProcessTree(child: ReturnType<typeof spawn>): void {
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
  }, 5000).unref();
}

/** Terminates every currently tracked child process (used on shutdown). */
export function killAllActiveChildren(): void {
  for (const child of [...activeChildren]) {
    killProcessTree(child);
  }
}

export interface RunProcessOptions {
  onProgress?: (data: string) => void;
  /** Kill the process (and reject success on close) once exceeded. */
  timeoutMs?: number;
  /** Kill the process when aborted; the result then has `aborted: true`. */
  signal?: AbortSignal;
  cwd?: string;
}

export interface RunProcessResult {
  stdout: string;
  stderr: string;
  code: number;
  timedOut: boolean;
  aborted: boolean;
}

export async function runProcess(
  cmd: string,
  args: string[],
  options?: RunProcessOptions,
): Promise<RunProcessResult> {
  if (options?.signal?.aborted) {
    return { stdout: "", stderr: "", code: -1, timedOut: false, aborted: true };
  }
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      shell: false,
      windowsHide: true,
      cwd: options?.cwd,
    });
    activeChildren.add(proc);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let timer: NodeJS.Timeout | undefined;

    if (options?.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        killProcessTree(proc);
      }, options.timeoutMs);
    }
    const onAbort = () => {
      aborted = true;
      killProcessTree(proc);
    };
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
      activeChildren.delete(proc);
    };

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
      cleanup();
      reject(err);
    });
    proc.on("close", (code) => {
      cleanup();
      // A null code means the process died to a signal (our timeout kill,
      // an external kill, or shutdown) — never treat that as success (0).
      resolve({ stdout, stderr, code: code ?? -1, timedOut, aborted });
    });
  });
}
