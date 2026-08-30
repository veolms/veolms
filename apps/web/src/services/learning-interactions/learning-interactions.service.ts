import type {
  AcceptReplyRequest,
  AcceptReplyResponse,
  CompleteAttachmentUploadRequest,
  CreateLearningNoteRequest,
  CreateLearningReplyRequest,
  CreateLearningThreadRequest,
  CreateReportRequest,
  InitiateAttachmentUploadRequest,
  InitiateAttachmentUploadResponse,
  LearningAttachment,
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
  SuspendUserRequest,
  ToggleBookmarkResponse,
  ToggleFollowResponse,
  ToggleLikeRequest,
  ToggleLikeResponse,
  UnsuspendUserRequest,
  UpdateLearningNoteRequest,
  UpdateLearningReplyRequest,
  UpdateLearningThreadRequest,
  UserAutocompleteQuery,
  UserAutocompleteResponse,
  UserSuspension,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const learningInteractionsService = {
  // Threads (Lessons & Assignments)
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

  createLessonThread(
    courseId: string,
    lessonId: string,
    payload: CreateLearningThreadRequest,
  ): Promise<LearningThread> {
    return api.post<LearningThread>(
      `/courses/${courseId}/lessons/${lessonId}/threads`,
      payload,
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

  listAssignmentThreads(
    courseId: string,
    assignmentId: string,
    query?: ListLearningThreadsQuery,
  ): Promise<LearningThreadsListResponse> {
    return api.get<LearningThreadsListResponse>(
      `/courses/${courseId}/assignments/${assignmentId}/threads`,
      { params: query },
    );
  },

  createAssignmentThread(
    courseId: string,
    assignmentId: string,
    payload: CreateLearningThreadRequest,
  ): Promise<LearningThread> {
    return api.post<LearningThread>(
      `/courses/${courseId}/assignments/${assignmentId}/threads`,
      payload,
    );
  },

  listHubThreads(
    query?: ListLearningThreadsQuery,
  ): Promise<LearningThreadsListResponse> {
    return api.get<LearningThreadsListResponse>("/threads", {
      params: query,
    });
  },

  getThread(threadId: string): Promise<LearningThread> {
    return api.get<LearningThread>(`/threads/${threadId}`);
  },

  updateThread(
    threadId: string,
    payload: UpdateLearningThreadRequest,
  ): Promise<LearningThread> {
    return api.patch<LearningThread>(`/threads/${threadId}`, payload);
  },

  deleteThread(threadId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/threads/${threadId}`);
  },

  // Replies
  listReplies(
    threadId: string,
    query?: ListLearningRepliesQuery,
  ): Promise<LearningRepliesListResponse> {
    return api.get<LearningRepliesListResponse>(
      `/threads/${threadId}/replies`,
      { params: query },
    );
  },

  createReply(
    threadId: string,
    payload: CreateLearningReplyRequest,
  ): Promise<LearningReply> {
    return api.post<LearningReply>(
      `/threads/${threadId}/replies`,
      payload,
    );
  },

  updateReply(
    replyId: string,
    payload: UpdateLearningReplyRequest,
  ): Promise<LearningReply> {
    return api.patch<LearningReply>(`/replies/${replyId}`, payload);
  },

  deleteReply(replyId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/replies/${replyId}`);
  },

  acceptReply(
    replyId: string,
    payload?: AcceptReplyRequest,
  ): Promise<AcceptReplyResponse> {
    return api.post<AcceptReplyResponse>(
      `/replies/${replyId}/accept`,
      payload,
    );
  },

  // Engagements
  toggleLike(payload: ToggleLikeRequest): Promise<ToggleLikeResponse> {
    return api.post<ToggleLikeResponse>(
      "/interactions/likes",
      payload,
    );
  },

  toggleBookmark(threadId: string): Promise<ToggleBookmarkResponse> {
    return api.post<ToggleBookmarkResponse>(
      `/threads/${threadId}/bookmark`,
    );
  },

  toggleFollow(threadId: string): Promise<ToggleFollowResponse> {
    return api.post<ToggleFollowResponse>(
      `/threads/${threadId}/follow`,
    );
  },

  lockThread(
    threadId: string,
    payload: LockThreadRequest,
  ): Promise<LockThreadResponse> {
    return api.post<LockThreadResponse>(
      `/threads/${threadId}/lock`,
      payload,
    );
  },

  autocompleteUsers(query: UserAutocompleteQuery): Promise<UserAutocompleteResponse> {
    return api.get<UserAutocompleteResponse>("/interactions/users/autocomplete", {
      params: query,
    });
  },

  searchMentions(query: string): Promise<UserAutocompleteResponse> {
    return api.get<UserAutocompleteResponse>("/interactions/users/autocomplete", {
      params: { q: query },
    });
  },

  // Notes
  listNotes(query?: ListLearningNotesQuery): Promise<LearningNotesListResponse> {
    return api.get<LearningNotesListResponse>("/notes", {
      params: query,
    });
  },

  getCourseNotesOverview(
    courseId: string,
  ): Promise<any> {
    return api.get<any>(`/courses/${courseId}/notes-overview`);
  },

  createNote(payload: CreateLearningNoteRequest): Promise<LearningNote> {
    return api.post<LearningNote>("/notes", payload);
  },

  getNote(noteId: string): Promise<LearningNote> {
    return api.get<LearningNote>(`/notes/${noteId}`);
  },

  updateNote(
    noteId: string,
    payload: UpdateLearningNoteRequest,
  ): Promise<LearningNote> {
    return api.patch<LearningNote>(`/notes/${noteId}`, payload);
  },

  deleteNote(noteId: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/notes/${noteId}`);
  },

  // Attachments
  initiateUpload(
    payload: InitiateAttachmentUploadRequest,
  ): Promise<InitiateAttachmentUploadResponse> {
    return api.post<InitiateAttachmentUploadResponse>(
      "/attachments/initiate",
      payload,
    );
  },

  uploadAttachmentFile(
    attachmentId: string,
    file: File,
  ): Promise<LearningAttachment> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api.post<LearningAttachment>(
      `/attachments/${attachmentId}/upload`,
      formData,
    );
  },

  completeUpload(
    payload: CompleteAttachmentUploadRequest,
  ): Promise<LearningAttachment> {
    return api.post<LearningAttachment>(
      "/attachments/complete",
      payload,
    );
  },

  uploadAttachmentDirect(file: File): Promise<LearningUploadResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api.post<LearningUploadResponse>(
      "/attachments/upload",
      formData,
    );
  },

  // Reporting
  createReport(payload: CreateReportRequest): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      "/reports",
      payload,
    );
  },

  // Course Moderation
  listCourseReports(courseId: string, query?: ListReportsQuery): Promise<ReportsListResponse> {
    return api.get<ReportsListResponse>(`/courses/${courseId}/moderation/reports`, {
      params: query,
    });
  },

  moderateCourseThread(
    courseId: string,
    threadId: string,
    payload: ModerateThreadRequest,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/courses/${courseId}/moderation/threads/${threadId}`,
      payload,
    );
  },

  moderateCourseReply(
    courseId: string,
    replyId: string,
    payload: ModerateReplyRequest,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/courses/${courseId}/moderation/replies/${replyId}`,
      payload,
    );
  },

  suspendCourseParticipant(
    courseId: string,
    userId: string,
    payload: Omit<SuspendUserRequest, "userId" | "courseId">,
  ): Promise<UserSuspension> {
    return api.post<UserSuspension>(
      `/courses/${courseId}/moderation/users/${userId}/suspend`,
      payload,
    );
  },

  unsuspendCourseParticipant(
    courseId: string,
    userId: string,
    payload?: Omit<UnsuspendUserRequest, "userId" | "courseId">,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/courses/${courseId}/moderation/users/${userId}/unsuspend`,
      payload,
    );
  },

  // Platform Moderation
  listPlatformReports(query?: ListReportsQuery): Promise<ReportsListResponse> {
    return api.get<ReportsListResponse>("/moderation/reports", {
      params: query,
    });
  },

  listReports(query?: ListReportsQuery): Promise<ReportsListResponse> {
    return api.get<ReportsListResponse>("/moderation/reports", {
      params: query,
    });
  },

  moderatePlatformThread(
    threadId: string,
    payload: ModerateThreadRequest,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/moderation/threads/${threadId}`,
      payload,
    );
  },

  moderatePlatformReply(
    replyId: string,
    payload: ModerateReplyRequest,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/moderation/replies/${replyId}`,
      payload,
    );
  },

  suspendPlatformUser(
    userId: string,
    payload: Omit<SuspendUserRequest, "userId">,
  ): Promise<UserSuspension> {
    return api.post<UserSuspension>(
      `/moderation/users/${userId}/suspend`,
      payload,
    );
  },

  unsuspendPlatformUser(
    userId: string,
    payload?: Omit<UnsuspendUserRequest, "userId">,
  ): Promise<{ message: string }> {
    return api.post<{ message: string }>(
      `/moderation/users/${userId}/unsuspend`,
      payload,
    );
  },
};
