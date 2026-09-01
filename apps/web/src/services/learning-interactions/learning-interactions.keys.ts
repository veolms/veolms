export const learningInteractionKeys = {
  all: ["learning-interactions"] as const,
  lessonThreads: (courseId: string, lessonId: string, filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "lesson-threads", courseId, lessonId, filters] as const,
  hubThreads: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "hub-threads", filters] as const,
  threadDetails: (threadId: string) =>
    [...learningInteractionKeys.all, "thread", threadId] as const,
  threadRepliesRoot: (threadId: string) =>
    [...learningInteractionKeys.all, "replies", threadId] as const,
  threadReplies: (threadId: string, query?: Record<string, unknown>) =>
    [...learningInteractionKeys.threadRepliesRoot(threadId), query] as const,
  notesRoot: () => [...learningInteractionKeys.all, "notes"] as const,
  notes: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.notesRoot(), filters] as const,
  noteDetails: (noteId: string) =>
    [...learningInteractionKeys.all, "note", noteId] as const,
  mentions: (query: string) =>
    [...learningInteractionKeys.all, "mentions", query] as const,
  moderationReports: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "moderation", "reports", filters] as const,
  auditLogs: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "moderation", "audit-logs", filters] as const,
};
