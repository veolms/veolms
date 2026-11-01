import type { DashboardRange } from "@veolms/contracts";
import { analyticsKeys } from "../../services/analytics";
import { enrollmentKeys } from "../../services/enrollments";
import { learningInteractionKeys } from "../../services/learning-interactions";

export const CREATOR_DASHBOARD_ENROLLMENT_LIMIT = 10;

export function getCreatorDashboardRefreshQueryKeys(range: DashboardRange) {
  return [
    analyticsKeys.dashboard(range),
    learningInteractionKeys.dashboardRecentDiscussions(),
    enrollmentKeys.recent(CREATOR_DASHBOARD_ENROLLMENT_LIMIT),
  ] as const;
}
