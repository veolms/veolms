export const authorizationKeys = {
  all: ["authorization"] as const,
  capabilities: (params?: { courseId?: string }) =>
    [...authorizationKeys.all, "capabilities", params?.courseId ?? "none"] as const,
};
