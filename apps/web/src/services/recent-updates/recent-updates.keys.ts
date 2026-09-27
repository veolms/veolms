import type { RecentUpdatesQuery } from "@veolms/contracts";

export const recentUpdatesKeys = {
  all: ["recent-updates"] as const,
  list: (params: Pick<RecentUpdatesQuery, "days" | "limit" | "lessonsPerCourse">) =>
    [
      ...recentUpdatesKeys.all,
      "list",
      params.days,
      params.limit,
      params.lessonsPerCourse,
    ] as const,
};
