import type { MutationFunction, MutationKey } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { getAutosyncMutationKey, getAutosyncMutationScopeKey } from "./keys";
import { autosyncQueryCacheStorage } from "./storage";
import type { AutosyncKey } from "./types";

export const AUTOSYNC_QUERY_PERSISTENCE_KEY = "veolms:tanstack-query";
export const AUTOSYNC_QUERY_PERSISTENCE_BUSTER = "veolms-autosync-v1";

export const autosyncPersister = createAsyncStoragePersister({
  storage: autosyncQueryCacheStorage,
  key: AUTOSYNC_QUERY_PERSISTENCE_KEY,
  throttleTime: 100,
});

function isRejectedByServer(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { status?: unknown }).status;
  // 408 and 429 are worth another try; every other 4xx is a final answer.
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 429
  );
}

export const getAutosyncMutationOptions = <TData, TVariables>(
  key: AutosyncKey,
  mutationFn: MutationFunction<TData, TVariables>,
) => ({
  mutationKey: getAutosyncMutationKey(key),
  scope: { id: getAutosyncMutationScopeKey(key) },
  networkMode: "online" as const,
  mutationFn,
  // A request the server rejected (taken username, failed validation) fails
  // the same way every time; retrying it only kept "Saving…" on screen.
  retry: (failureCount: number, error: unknown) =>
    failureCount < 3 && !isRejectedByServer(error),
  retryDelay: (attemptIndex: number) =>
    Math.min(1_000 * 2 ** attemptIndex, 30_000),
});

export const getAutosyncMutationKeyFor = (key: AutosyncKey): MutationKey =>
  getAutosyncMutationKey(key);
