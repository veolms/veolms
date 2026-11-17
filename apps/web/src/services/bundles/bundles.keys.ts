export const bundleKeys = {
  all: ["bundles"] as const,
  manage: () => [...bundleKeys.all, "manage"] as const,
  offers: (courseId: string, viewerId: string | null) =>
    [...bundleKeys.all, "offers", courseId, viewerId ?? "guest"] as const,
};
