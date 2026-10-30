import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { veolmsHomeDir } from "./binaries.ts";

export const GIB = 1024 ** 3;

export async function canUseDirectory(dir: string): Promise<boolean> {
  try {
    await fsp.mkdir(dir, { recursive: true });
    await fsp.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * A disk-backed scratch root for downloads. `override` (or
 * VEOLMS_IMPORT_TMP) wins; otherwise the first writable of the usual
 * Linux locations, avoiding /tmp which is often tmpfs on Ubuntu.
 */
export async function resolveImportScratchRoot(
  override = process.env.VEOLMS_IMPORT_TMP?.trim(),
): Promise<string> {
  if (override) {
    if (!(await canUseDirectory(override))) {
      throw new Error(`Import scratch directory is not writable: ${override}`);
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

export async function getAvailableBytes(dir: string): Promise<number | null> {
  try {
    const stats = await fsp.statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return null;
  }
}

export async function assertEnoughDiskSpace(
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

/** Total bytes under a directory (0 when it does not exist). */
export async function directorySize(directory: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(fullPath);
    else {
      try {
        total += (await fsp.stat(fullPath)).size;
      } catch {
        // file disappeared
      }
    }
  }
  return total;
}
