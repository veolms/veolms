export const learningInteractionKeys = {
  all: ["learning-interactions"] as const,
  lessonThreads: (courseId: string, lessonId: string, filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "lesson-threads", courseId, lessonId, "infinite", filters] as const,
  lessonInteractionCountsRoot: (courseId?: string, lessonId?: string) =>
    courseId && lessonId
      ? [...learningInteractionKeys.all, "lesson-interaction-counts", courseId, lessonId] as const
      : [...learningInteractionKeys.all, "lesson-interaction-counts"] as const,
  lessonInteractionCounts: (
    courseId: string,
    lessonId: string,
    filters?: Record<string, unknown>,
  ) =>
    [
      ...learningInteractionKeys.lessonInteractionCountsRoot(courseId, lessonId),
      filters,
    ] as const,
  hubThreads: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "hub-threads", "infinite", filters] as const,
  discussionsWorkspace: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "discussions-workspace", "infinite", filters] as const,
  threadDetails: (threadId: string) =>
    [...learningInteractionKeys.all, "thread", threadId] as const,
  threadRepliesRoot: (threadId: string) =>
    [...learningInteractionKeys.all, "replies", threadId] as const,
  threadReplies: (threadId: string, _query?: Record<string, unknown>) =>
    [...learningInteractionKeys.threadRepliesRoot(threadId)] as const,
  notesRoot: () => [...learningInteractionKeys.all, "notes"] as const,
  notes: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.notesRoot(), "infinite", filters] as const,
  noteDetails: (noteId: string) =>
    [...learningInteractionKeys.all, "note", noteId] as const,
  autocompleteUsers: (courseId: string, query?: string) =>
    [...learningInteractionKeys.all, "autocomplete-users", courseId, query ?? ""] as const,
  moderationReports: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "moderation", "reports", filters] as const,
  auditLogs: (filters?: Record<string, unknown>) =>
    [...learningInteractionKeys.all, "moderation", "audit-logs", filters] as const,
  linkPreview: (url: string) =>
    [...learningInteractionKeys.all, "link-preview", url] as const,
};
