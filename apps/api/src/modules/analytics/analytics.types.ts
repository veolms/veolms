export interface AnalyticsActor {
  id: string;
  roles: readonly string[];
}

export type AnalyticsDashboardScope = "platform" | "course";

export const isAdmin = (actor: AnalyticsActor) =>
  actor.roles.some((role) => role.toLowerCase() === "admin");
