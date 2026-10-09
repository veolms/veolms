export interface AnalyticsActor {
  id: string;
  roles: readonly string[];
}

export const isAdmin = (actor: AnalyticsActor) =>
  actor.roles.some((role) => role.toLowerCase() === "admin");
