import { getAutosyncKey } from "./keys";
import type { AutosyncKey } from "./types";

const DIRTY_REGISTRY_STORAGE_KEY = "veolms:autosync:dirty-registry";

export interface DirtyAutosyncDraft {
  key: AutosyncKey;
  updatedAt: number;
}

const canUseLocalStorage = () =>
  typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const readRegistry = (): DirtyAutosyncDraft[] => {
  if (!canUseLocalStorage()) return [];
  try {
    const raw = window.localStorage.getItem(DIRTY_REGISTRY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is DirtyAutosyncDraft => {
      if (typeof entry !== "object" || entry === null) return false;
      const candidate = entry as Partial<DirtyAutosyncDraft>;
      const key = candidate.key;
      return (
        typeof candidate.updatedAt === "number" &&
        typeof key === "object" &&
        key !== null &&
        typeof key.entity === "string" &&
        typeof key.entityId === "string" &&
        typeof key.scope === "string"
      );
    });
  } catch {
    return [];
  }
};

const writeRegistry = (entries: DirtyAutosyncDraft[]) => {
  if (!canUseLocalStorage()) return;
  try {
    if (entries.length) {
      window.localStorage.setItem(
        DIRTY_REGISTRY_STORAGE_KEY,
        JSON.stringify(entries),
      );
    } else {
      window.localStorage.removeItem(DIRTY_REGISTRY_STORAGE_KEY);
    }
  } catch {
    // A missing registry is recoverable because the draft itself is durable.
  }
};

export const markAutosyncDraftDirty = (key: AutosyncKey): void => {
  const registry = readRegistry();
  const keyString = getAutosyncKey(key);
  const next = registry.filter(
    (entry) => getAutosyncKey(entry.key) !== keyString,
  );
  next.push({ key, updatedAt: Date.now() });
  writeRegistry(next);
};

export const markAutosyncDraftClean = (key: AutosyncKey): void => {
  const keyString = getAutosyncKey(key);
  writeRegistry(
    readRegistry().filter((entry) => getAutosyncKey(entry.key) !== keyString),
  );
};

export const getDirtyAutosyncDrafts = (): DirtyAutosyncDraft[] =>
  readRegistry();

export const clearAutosyncRegistry = (): void => writeRegistry([]);
