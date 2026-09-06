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

export const getAutosyncMutationOptions = <TData, TVariables>(
  key: AutosyncKey,
  mutationFn: MutationFunction<TData, TVariables>,
) => ({
  mutationKey: getAutosyncMutationKey(key),
  scope: { id: getAutosyncMutationScopeKey(key) },
  networkMode: "online" as const,
  mutationFn,
  retry: 3,
  retryDelay: (attemptIndex: number) =>
    Math.min(1_000 * 2 ** attemptIndex, 30_000),
});

export const getAutosyncMutationKeyFor = (key: AutosyncKey): MutationKey =>
  getAutosyncMutationKey(key);
