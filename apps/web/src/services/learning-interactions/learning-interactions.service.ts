import type {
  AcceptReplyRequest,
  AcceptReplyResponse,
  CompleteAttachmentUploadRequest,
  CourseNotesOverviewResponse,
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
import { requireServerEntityId } from "./interaction-entities";

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

  listHubThreads(
    query?: ListLearningThreadsQuery,
  ): Promise<LearningThreadsListResponse> {
    return api.get<LearningThreadsListResponse>("/threads", {
      params: query,
    });
  },

  getThread(threadId: string): Promise<LearningThread> {
    const serverId = requireServerEntityId(threadId);
    return api.get<LearningThread>(`/threads/${serverId}`);
  },

  updateThread(
    threadId: string,
    payload: UpdateLearningThreadRequest,
  ): Promise<LearningThread> {
    const serverId = requireServerEntityId(threadId);
    return api.patch<LearningThread>(`/threads/${serverId}`, payload);
  },

  deleteThread(threadId: string): Promise<{ message: string }> {
    const serverId = requireServerEntityId(threadId);
    return api.delete<{ message: string }>(`/threads/${serverId}`);
  },

  // Replies
  listReplies(
    threadId: string,
    query?: ListLearningRepliesQuery,
  ): Promise<LearningRepliesListResponse> {
    const serverId = requireServerEntityId(threadId);
    return api.get<LearningRepliesListResponse>(
      `/threads/${serverId}/replies`,
      { params: query },
    );
  },

  createReply(
    threadId: string,
    payload: CreateLearningReplyRequest,
  ): Promise<LearningReply> {
    const serverId = requireServerEntityId(threadId);
    return api.post<LearningReply>(`/threads/${serverId}/replies`, payload);
  },

  updateReply(
    replyId: string,
    payload: UpdateLearningReplyRequest,
  ): Promise<LearningReply> {
    const serverId = requireServerEntityId(replyId);
    return api.patch<LearningReply>(`/replies/${serverId}`, payload);
  },

  deleteReply(replyId: string): Promise<{ message: string }> {
    const serverId = requireServerEntityId(replyId);
    return api.delete<{ message: string }>(`/replies/${serverId}`);
  },

  acceptReply(
    replyId: string,
    payload?: AcceptReplyRequest,
  ): Promise<AcceptReplyResponse> {
    const serverId = requireServerEntityId(replyId);
    return api.post<AcceptReplyResponse>(
      `/replies/${serverId}/accept`,
      payload,
    );
  },

  // Engagements
  toggleLike(payload: ToggleLikeRequest): Promise<ToggleLikeResponse> {
    const serverId = requireServerEntityId(payload.targetId);
    return api.post<ToggleLikeResponse>("/interactions/likes", {
      ...payload,
      targetId: serverId,
    });
  },

  toggleBookmark(threadId: string): Promise<ToggleBookmarkResponse> {
    const serverId = requireServerEntityId(threadId);
    return api.post<ToggleBookmarkResponse>(`/threads/${serverId}/bookmark`);
  },

  toggleFollow(threadId: string): Promise<ToggleFollowResponse> {
    const serverId = requireServerEntityId(threadId);
    return api.post<ToggleFollowResponse>(`/threads/${serverId}/follow`);
  },

  lockThread(
    threadId: string,
    payload: LockThreadRequest,
  ): Promise<LockThreadResponse> {
    const serverId = requireServerEntityId(threadId);
    return api.post<LockThreadResponse>(`/threads/${serverId}/lock`, payload);
  },

  autocompleteUsers(
    query: UserAutocompleteQuery,
  ): Promise<UserAutocompleteResponse> {
    return api.get<UserAutocompleteResponse>(
      "/interactions/users/autocomplete",
      {
        params: query,
      },
    );
  },

  // Notes
  listNotes(
    query?: ListLearningNotesQuery,
  ): Promise<LearningNotesListResponse> {
    return api.get<LearningNotesListResponse>("/notes", {
      params: query,
    });
  },

  getCourseNotesOverview(
    courseId: string,
  ): Promise<CourseNotesOverviewResponse> {
    return api.get<CourseNotesOverviewResponse>(
      `/courses/${courseId}/notes-overview`,
    );
  },

  createNote(payload: CreateLearningNoteRequest): Promise<LearningNote> {
    return api.post<LearningNote>("/notes", payload);
  },

  getNote(noteId: string): Promise<LearningNote> {
    const serverId = requireServerEntityId(noteId);
    return api.get<LearningNote>(`/notes/${serverId}`);
  },

  updateNote(
    noteId: string,
    payload: UpdateLearningNoteRequest,
  ): Promise<LearningNote> {
    const serverId = requireServerEntityId(noteId);
    return api.patch<LearningNote>(`/notes/${serverId}`, payload);
  },

  deleteNote(noteId: string): Promise<{ message: string }> {
    const serverId = requireServerEntityId(noteId);
    return api.delete<{ message: string }>(`/notes/${serverId}`);
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
    return api.post<LearningAttachment>("/attachments/complete", payload);
  },

  uploadAttachmentDirect(file: File): Promise<LearningUploadResponse> {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return api.post<LearningUploadResponse>("/attachments/upload", formData);
  },

  // Reporting
  createReport(payload: CreateReportRequest): Promise<{ message: string }> {
    const serverId = requireServerEntityId(payload.targetId);
    return api.post<{ message: string }>("/reports", {
      ...payload,
      targetId: serverId,
    });
  },

  // Course Moderation
  listCourseReports(
    courseId: string,
    query?: ListReportsQuery,
  ): Promise<ReportsListResponse> {
    return api.get<ReportsListResponse>(
      `/courses/${courseId}/moderation/reports`,
      {
        params: query,
      },
    );
  },

  moderateCourseThread(
    courseId: string,
    threadId: string,
    payload: ModerateThreadRequest,
  ): Promise<{ message: string }> {
    const serverId = requireServerEntityId(threadId);
    return api.post<{ message: string }>(
      `/courses/${courseId}/moderation/threads/${serverId}`,
      payload,
    );
  },

  moderateCourseReply(
    courseId: string,
    replyId: string,
    payload: ModerateReplyRequest,
  ): Promise<{ message: string }> {
    const serverId = requireServerEntityId(replyId);
    return api.post<{ message: string }>(
      `/courses/${courseId}/moderation/replies/${serverId}`,
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
    const serverId = requireServerEntityId(threadId);
    return api.post<{ message: string }>(
      `/moderation/threads/${serverId}`,
      payload,
    );
  },

  moderatePlatformReply(
    replyId: string,
    payload: ModerateReplyRequest,
  ): Promise<{ message: string }> {
    const serverId = requireServerEntityId(replyId);
    return api.post<{ message: string }>(
      `/moderation/replies/${serverId}`,
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
