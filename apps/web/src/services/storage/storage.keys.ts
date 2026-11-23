import type {
  StorageFileKind,
  StorageFileSort,
  StorageLearnersQuery,
} from "@veolms/contracts";

export const storageKeys = {
  all: ["storage"] as const,
  mine: () => [...storageKeys.all, "me"] as const,
  files: () => [...storageKeys.all, "files"] as const,
  fileList: (
    sort: StorageFileSort,
    kind: StorageFileKind | null,
    search: string,
  ) => [...storageKeys.files(), sort, kind ?? "all", search] as const,
  admin: () => [...storageKeys.all, "admin"] as const,
  learners: (query: StorageLearnersQuery) =>
    [...storageKeys.admin(), "learners", query] as const,
  learner: (userId: string) =>
    [...storageKeys.admin(), "learner", userId] as const,
};
