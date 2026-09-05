export const learningSpaceKeys = {
  all: ["learning-space"] as const,
  sessions: (userId?: string | null) =>
    [...learningSpaceKeys.all, "sessions", userId ?? null] as const,
};
