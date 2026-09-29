export const authorizationKeys = {
  all: ["authorization"] as const,
  capabilities: (params?: { courseId?: string; userId?: string | null }) =>
    [
      ...authorizationKeys.all,
      "capabilities",
      params?.userId ?? "none",
      params?.courseId ?? "none",
    ] as const,
};
