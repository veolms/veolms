import type { RecentUpdatesQuery, RecentUpdatesResponse } from "@veolms/contracts";
import { api } from "../../lib/api-client";

export type RecentUpdatesRequest = Pick<RecentUpdatesQuery, "days" | "limit" | "lessonsPerCourse">;

export const recentUpdatesService = {
  list: (params: RecentUpdatesRequest): Promise<RecentUpdatesResponse> =>
    api.get<RecentUpdatesResponse>("/learning/recent-updates", { params }),
};
