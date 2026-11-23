import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
} from "@tanstack/react-query";
import type {
  MyStorageResponse,
  StorageFileKind,
  StorageFileSort,
  StorageFilesResponse,
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

const FILES_PAGE = 60;

/** The learner's own files, biggest first (or newest/oldest), page by page. */
export function useMyStorageFiles(
  sort: StorageFileSort,
  kind: StorageFileKind | null,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery<StorageFilesResponse, ApiError>({
    queryKey: storageKeys.fileList(sort, kind),
    queryFn: ({ pageParam }) =>
      storageService.myFiles({
        sort,
        kind: kind ?? undefined,
        offset: pageParam as number,
        limit: FILES_PAGE,
      }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.files.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
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
