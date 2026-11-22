import type { CodingFile, SubmitCodingRequest } from "@veolms/contracts";

/**
 * What the device keeps for coding lessons: the code being written (saved
 * on every change, so a crash or a closed tab loses nothing), a submit that
 * could not reach the server, and which hints were opened. Capped so many
 * lessons never fill the browser's storage: the 30 most recent drafts and
 * about 1 MB in all, oldest dropped first.
 */

const DRAFT_PREFIX = "veolms:coding-draft:";
const DRAFT_INDEX = "veolms:coding-drafts";
const SUBMIT_PREFIX = "veolms:coding-submit:";
const HINTS_PREFIX = "veolms:coding-hints:";
const MAX_DRAFTS = 30;
const MAX_TOTAL_CHARS = 1_000_000;

export interface DeviceDraft {
  versionId: string;
  files: CodingFile[];
  savedAt: number;
}

interface IndexEntry {
  id: string;
  size: number;
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readIndex(): IndexEntry[] {
  const index = readJson<IndexEntry[]>(DRAFT_INDEX);
  return Array.isArray(index) ? index : [];
}

function writeIndex(index: IndexEntry[]) {
  try {
    storage()?.setItem(DRAFT_INDEX, JSON.stringify(index));
  } catch {
    /* storage full or blocked: the drafts still work this session */
  }
}

export function readDeviceDraft(assignmentId: string): DeviceDraft | null {
  const draft = readJson<DeviceDraft>(DRAFT_PREFIX + assignmentId);
  return draft && Array.isArray(draft.files) ? draft : null;
}

export function writeDeviceDraft(assignmentId: string, draft: DeviceDraft) {
  const store = storage();
  if (!store) return;
  const text = JSON.stringify(draft);
  let index = readIndex().filter((entry) => entry.id !== assignmentId);
  index.unshift({ id: assignmentId, size: text.length });
  // Oldest out first, by count and by size.
  let total = index.reduce((sum, entry) => sum + entry.size, 0);
  while (
    index.length > MAX_DRAFTS ||
    (total > MAX_TOTAL_CHARS && index.length > 1)
  ) {
    const dropped = index.pop()!;
    total -= dropped.size;
    store.removeItem(DRAFT_PREFIX + dropped.id);
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      store.setItem(DRAFT_PREFIX + assignmentId, text);
      writeIndex(index);
      return;
    } catch {
      // Quota: drop the oldest other draft and try again.
      const dropped = index.length > 1 ? index.pop() : undefined;
      if (!dropped) return;
      store.removeItem(DRAFT_PREFIX + dropped.id);
    }
  }
}

export function clearDeviceDraft(assignmentId: string) {
  storage()?.removeItem(DRAFT_PREFIX + assignmentId);
  writeIndex(readIndex().filter((entry) => entry.id !== assignmentId));
}

/** A submit the server has not confirmed; sent again when the lesson opens. */
export function readPendingSubmit(assignmentId: string) {
  return readJson<SubmitCodingRequest>(SUBMIT_PREFIX + assignmentId);
}

export function writePendingSubmit(
  assignmentId: string,
  payload: SubmitCodingRequest | null,
) {
  try {
    if (payload)
      storage()?.setItem(SUBMIT_PREFIX + assignmentId, JSON.stringify(payload));
    else storage()?.removeItem(SUBMIT_PREFIX + assignmentId);
  } catch {
    /* kept in memory only */
  }
}

export function readOpenedHints(assignmentId: string): string[] {
  const hints = readJson<string[]>(HINTS_PREFIX + assignmentId);
  return Array.isArray(hints) ? hints : [];
}

export function writeOpenedHints(assignmentId: string, hintIds: string[]) {
  try {
    storage()?.setItem(HINTS_PREFIX + assignmentId, JSON.stringify(hintIds));
  } catch {
    /* kept for this visit only */
  }
}
