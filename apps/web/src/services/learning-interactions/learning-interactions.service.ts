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
  LearningNote,
  LearningNotesListResponse,
  LearningRepliesListResponse,
  LearningReply,
  LearningThread,
  LearningThreadsListResponse,
  PublicPopularDiscussionsResponse,
  LessonDiscussionsListResponse,
  LessonDiscussionCountsResponse,
  ListLessonDiscussionsQuery,
  LinkPreviewResponse,
  ListLearningNotesQuery,
  ListLearningRepliesQuery,
  ListLearningThreadsQuery,
  LockThreadRequest,
  LockThreadResponse,
  DiscussionsWorkspaceResponse,
  ToggleBookmarkResponse,
  ToggleFollowResponse,
  ToggleLikeRequest,
  ToggleLikeResponse,
  UpdateLearningNoteRequest,
  UpdateLearningReplyRequest,
  UpdateLearningThreadRequest,
  UploadedAttachment,
  UserAutocompleteQuery,
  UserAutocompleteResponse,
} from "@veolms/contracts";
import { api, getApiRequestUrl } from "../../lib/api-client";
import { mediaService } from "../media/media.service";
import { requireServerEntityId } from "./interaction-entities";

export interface AttachmentUploadProgress {
  loaded: number;
  total?: number;
}

export interface DiscussionAttachmentUploadContext {
  courseId: string;
  lessonId: string;
}

export const learningInteractionsService = {
  listPopularDiscussions(): Promise<PublicPopularDiscussionsResponse> {
    return api.get<PublicPopularDiscussionsResponse>("/discussions/popular");
  },

  getLessonInteractionCounts(
    courseId: string,
    lessonId: string,
  ): Promise<LessonDiscussionCountsResponse> {
    return api.get<LessonDiscussionCountsResponse>(
      `/courses/${courseId}/lessons/${lessonId}/discussions/counts`,
    );
  },

  listLessonDiscussions(
    courseId: string,
    lessonId: string,
    query?: ListLessonDiscussionsQuery,
  ): Promise<LessonDiscussionsListResponse> {
    return api.get<LessonDiscussionsListResponse>(
      `/courses/${courseId}/lessons/${lessonId}/discussions`,
      { params: query },
    );
  },

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

  listDiscussionsWorkspace(
    query?: ListLearningThreadsQuery,
  ): Promise<DiscussionsWorkspaceResponse> {
    return api.get<DiscussionsWorkspaceResponse>("/discussions/workspace", {
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

  toggleNoteBookmark(noteId: string): Promise<ToggleBookmarkResponse> {
    const serverId = requireServerEntityId(noteId);
    return api.post<ToggleBookmarkResponse>(`/notes/${serverId}/bookmark`);
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

  /**
   * The same delete as above, sent so the browser finishes it after the page
   * is gone. An ordinary request is cancelled when the tab closes or reloads.
   */
  async deleteKeepalive(
    kind: "thread" | "reply" | "note",
    entityId: string,
  ): Promise<void> {
    const serverId = requireServerEntityId(entityId);
    const path =
      kind === "thread"
        ? `/threads/${serverId}`
        : kind === "reply"
          ? `/replies/${serverId}`
          : `/notes/${serverId}`;
    const response = await fetch(getApiRequestUrl(path), {
      method: "DELETE",
      credentials: "include",
      keepalive: true,
    });
    if (!response.ok) {
      throw new Error(`Request failed with status code ${response.status}`);
    }
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

  completeUpload(
    payload: CompleteAttachmentUploadRequest,
  ): Promise<UploadedAttachment> {
    return api.post<UploadedAttachment>("/attachments/complete", payload);
  },

  uploadAttachmentDirect(
    file: File,
    onProgress?: (progress: AttachmentUploadProgress) => void,
    dimensions?: { width?: number; height?: number },
    context?: DiscussionAttachmentUploadContext,
  ): Promise<UploadedAttachment> {
    if (!context) {
      return Promise.reject(
        new Error("Course and lesson context are required for attachments."),
      );
    }
    return this.initiateUpload({
      courseId: context.courseId,
      lessonId: context.lessonId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      ...(dimensions?.width !== undefined ? { width: dimensions.width } : {}),
      ...(dimensions?.height !== undefined
        ? { height: dimensions.height }
        : {}),
    }).then(async (initiated) => {
      await mediaService.uploadFileToPresignedUrl(
        initiated.uploadUrl,
        file,
        (progress) =>
          onProgress?.({
            loaded: progress.loadedBytes,
            total: progress.totalBytes,
          }),
      );

      return this.completeUpload({ attachmentId: initiated.attachmentId });
    });
  },

  getLinkPreview(url: string): Promise<LinkPreviewResponse> {
    return api.post<LinkPreviewResponse>("/attachments/link-preview", { url });
  },

  // Reporting
  createReport(payload: CreateReportRequest): Promise<{ message: string }> {
    const serverId = requireServerEntityId(payload.targetId);
    return api.post<{ message: string }>("/reports", {
      ...payload,
      targetId: serverId,
    });
  },
};
