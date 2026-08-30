export const learningInteractionKeys = {
  all: ["learning-interactions"] as const,
  lessonThreads: (courseId: string, lessonId: string, filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "lesson-threads", courseId, lessonId, filters] as const,
  hubThreads: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "hub-threads", filters] as const,
  threadDetails: (threadId: string) =>
    [...learningInteractionKeys.all, "thread", threadId] as const,
  threadReplies: (threadId: string) =>
    [...learningInteractionKeys.all, "replies", threadId] as const,
  notes: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "notes", filters] as const,
  noteDetails: (noteId: string) =>
    [...learningInteractionKeys.all, "note", noteId] as const,
  mentions: (query: string) =>
    [...learningInteractionKeys.all, "mentions", query] as const,
  moderationReports: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "moderation", "reports", filters] as const,
  auditLogs: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "moderation", "audit-logs", filters] as const,
};
