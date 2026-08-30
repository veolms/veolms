import type {
  AcceptAnswerRequest,
  AcceptAnswerResponse,
  CreateLearningNoteRequest,
  CreateLearningReplyRequest,
  CreateLearningThreadRequest,
  CreateReportRequest,
  LearningNote,
  LearningNotesListResponse,
  LearningRepliesListResponse,
  LearningReply,
  LearningThread,
  LearningThreadsListResponse,
  LearningUploadResponse,
  ListAuditLogsQuery,
  ListLearningNotesQuery,
  ListLearningRepliesQuery,
  ListLearningThreadsQuery,
  ListReportsQuery,
  LockThreadRequest,
  LockThreadResponse,
  ModerateReplyRequest,
  ModerateThreadRequest,
  ReportsListResponse,
  SearchMentionsResponse,
  SuspendUserRequest,
  ToggleBookmarkResponse,
  ToggleFollowResponse,
  ToggleLikeRequest,
  ToggleLikeResponse,
  UpdateLearningNoteRequest,
  UpdateLearningReplyRequest,
  UpdateLearningThreadRequest,
  UserSuspension,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const learningInteractionsService = {
  // Threads
  listLessonThreads(
    courseId: string,
    lessonId: string,
    query?: ListLearningThreadsQuery,
  ): Promise<LearningThreadsListResponse> {
    return api.get<LearningThreadsListResponse>(
      `/courses/${courseId}/lessons/${lessonId}/threads`,
      { params: query },
    );
  },

  createThread(
    courseId: string,
    lessonId: string,
    payload: CreateLearningThreadRequest,
  ): Promise<LearningThread> {
    return api.post<LearningThread>(
      `/courses/${courseId}/lessons/${lessonId}/threads`,
      payload,
    );
  },

  listHubThreads(
    query?: ListLearningThreadsQuery,
  ): Promise<LearningThreadsListResponse> {
    return api.get<LearningThreadsListResponse>("/learning-threads", {
      params: query,
    });
  },

  getThread(threadId: string): Promise<LearningThread> {
    return api.get<LearningThread>(`/learning-threads/${threadId}`);
  },

  updateThread(
    threadId: string,
    payload: UpdateLearningThreadRequest,
  ): Promise<LearningThread> {
    return api.patch<LearningThread>(`/learning-threads/${threadId}`, payload);
  },

  deleteThread(threadId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/learning-threads/${threadId}`);
  },

  // Replies
  listReplies(
    threadId: string,
    query?: ListLearningRepliesQuery,
  ): Promise<LearningRepliesListResponse> {
    return api.get<LearningRepliesListResponse>(
      `/learning-threads/${threadId}/replies`,
      { params: query },
    );
  },

  createReply(
    threadId: string,
    payload: CreateLearningReplyRequest,
  ): Promise<LearningReply> {
    return api.post<LearningReply>(
      `/learning-threads/${threadId}/replies`,
      payload,
    );
  },

  updateReply(
    replyId: string,
    payload: UpdateLearningReplyRequest,
  ): Promise<LearningReply> {
    return api.patch<LearningReply>(`/learning-replies/${replyId}`, payload);
  },

  deleteReply(replyId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/learning-replies/${replyId}`);
  },

  acceptAnswer(
    threadId: string,
    payload: AcceptAnswerRequest,
  ): Promise<AcceptAnswerResponse> {
    return api.post<AcceptAnswerResponse>(
      `/learning-threads/${threadId}/accept-answer`,
      payload,
    );
  },

  // Engagements
  toggleLike(payload: ToggleLikeRequest): Promise<ToggleLikeResponse> {
    return api.post<ToggleLikeResponse>(
      "/learning-interactions/likes",
      payload,
    );
  },

  toggleBookmark(threadId: string): Promise<ToggleBookmarkResponse> {
    return api.post<ToggleBookmarkResponse>(
      `/learning-threads/${threadId}/bookmark`,
    );
  },

  toggleFollow(threadId: string): Promise<ToggleFollowResponse> {
    return api.post<ToggleFollowResponse>(
      `/learning-threads/${threadId}/follow`,
    );
  },

  lockThread(
    threadId: string,
    payload: LockThreadRequest,
  ): Promise<LockThreadResponse> {
    return api.post<LockThreadResponse>(
      `/learning-threads/${threadId}/lock`,
      payload,
    );
  },

  searchMentions(query: string): Promise<SearchMentionsResponse> {
    return api.get<SearchMentionsResponse>("/learning-interactions/mentions", {
      params: { query },
    });
  },

  // Notes
  listNotes(query?: ListLearningNotesQuery): Promise<LearningNotesListResponse> {
    return api.get<LearningNotesListResponse>("/learning-notes", {
      params: query,
    });
  },

  createNote(payload: CreateLearningNoteRequest): Promise<LearningNote> {
    return api.post<LearningNote>("/learning-notes", payload);
  },

  getNote(noteId: string): Promise<LearningNote> {
    return api.get<LearningNote>(`/learning-notes/${noteId}`);
  },

  updateNote(
    noteId: string,
    payload: UpdateLearningNoteRequest,
  ): Promise<LearningNote> {
    return api.patch<LearningNote>(`/learning-notes/${noteId}`, payload);
  },

  deleteNote(noteId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/learning-notes/${noteId}`);
  },

  // Attachments
  uploadAttachment(file: File): Promise<LearningUploadResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api.post<LearningUploadResponse>(
      "/learning-attachments/upload",
      formData,
    );
  },

  // Moderation
  createReport(payload: CreateReportRequest): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      "/learning-interactions/reports",
      payload,
    );
  },

  listReports(query?: ListReportsQuery): Promise<ReportsListResponse> {
    return api.get<ReportsListResponse>("/admin/moderation/reports", {
      params: query,
    });
  },

  moderateThread(
    threadId: string,
    payload: ModerateThreadRequest,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/admin/moderation/threads/${threadId}`,
      payload,
    );
  },

  moderateReply(
    replyId: string,
    payload: ModerateReplyRequest,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/admin/moderation/replies/${replyId}`,
      payload,
    );
  },

  suspendUser(payload: SuspendUserRequest): Promise<UserSuspension> {
    return api.post<UserSuspension>(
      "/admin/moderation/users/suspend",
      payload,
    );
  },
};
