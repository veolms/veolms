export const analyticsKeys = {
  all: ["analytics"] as const,
  adminOverview: (query: object) =>
    [...analyticsKeys.all, "admin-overview", query] as const,
  instructorOverview: (query: object) =>
    [...analyticsKeys.all, "instructor-overview", query] as const,
};
