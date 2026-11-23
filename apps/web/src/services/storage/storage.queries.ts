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
  /** What was typed in the search box (fuzzy, on the server). */
  search = "",
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery<StorageFilesResponse, ApiError>({
    queryKey: storageKeys.fileList(sort, kind, search),
    queryFn: ({ pageParam }) =>
      storageService.myFiles({
        sort,
        kind: kind ?? undefined,
        q: search || undefined,
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

const LEARNERS_PAGE = 50;

/**
 * Every student's space, loaded as the admin scrolls (as the Students and
 * Coupons lists do): searched, filtered and sorted on the server, 50 at a
 * time. A new search, filter or sort starts again from the top.
 */
export function useStorageLearners(
  query: Omit<StorageLearnersQuery, "page" | "pageSize">,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery<StorageLearnersResponse, ApiError>({
    queryKey: storageKeys.learners(query),
    queryFn: ({ pageParam }) =>
      storageService.learners({
        ...query,
        page: pageParam as number,
        pageSize: LEARNERS_PAGE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page * last.pageSize < last.total ? last.page + 1 : undefined,
    enabled: options?.enabled ?? true,
    // The list stays while a new search loads (no flash of the spinner).
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
