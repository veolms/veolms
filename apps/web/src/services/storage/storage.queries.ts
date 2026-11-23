import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  MyStorageResponse,
  StorageLearnerDetailResponse,
  StorageLearnersQuery,
  StorageLearnersResponse,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { storageKeys } from "./storage.keys";
import { storageService } from "./storage.service";

/** The signed-in learner's space; refreshed when an upload is refused. */
export function useMyStorage(options?: { enabled?: boolean }) {
  return useQuery<MyStorageResponse, ApiError>({
    queryKey: storageKeys.mine(),
    queryFn: () => storageService.mine(),
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export function useStorageLearners(
  query: StorageLearnersQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<StorageLearnersResponse, ApiError>({
    queryKey: storageKeys.learners(query),
    queryFn: () => storageService.learners(query),
    enabled: options?.enabled ?? true,
    // The page stays while the next one loads (no flash of the spinner).
    placeholderData: keepPreviousData,
  });
}

export function useStorageLearner(userId: string | null) {
  return useQuery<StorageLearnerDetailResponse, ApiError>({
    queryKey: storageKeys.learner(userId ?? ""),
    queryFn: () => storageService.learner(userId!),
    enabled: Boolean(userId),
  });
}
