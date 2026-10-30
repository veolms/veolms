import type { StudentListQuery } from "@veolms/contracts";

export const studentKeys = {
  all: ["students"] as const,
  lists: () => [...studentKeys.all, "list"] as const,
  list: (filters?: StudentListQuery) =>
    [...studentKeys.lists(), filters ?? {}] as const,
  details: () => [...studentKeys.all, "detail"] as const,
  detail: (username: string) => [...studentKeys.details(), username] as const,
};
