import type { StorageLearnersQuery } from "@veolms/contracts";

export const storageKeys = {
  all: ["storage"] as const,
  mine: () => [...storageKeys.all, "me"] as const,
  admin: () => [...storageKeys.all, "admin"] as const,
  learners: (query: StorageLearnersQuery) =>
    [...storageKeys.admin(), "learners", query] as const,
  learner: (userId: string) =>
    [...storageKeys.admin(), "learner", userId] as const,
};
