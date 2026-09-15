import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptReplyRequest,
  CreateLearningNoteRequest,
  CreateLearningReplyRequest,
  CreateLearningThreadRequest,
  CreateReportRequest,
  LockThreadRequest,
  ModerateReplyRequest,
  ModerateThreadRequest,
  SuspendUserRequest,
  ToggleLikeRequest,
  UnsuspendUserRequest,
  UpdateLearningNoteRequest,
  UpdateLearningReplyRequest,
  UpdateLearningThreadRequest,
  LearningUploadResponse,
  LearningReply,
  LearningThread,
  LearningNote,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { learningInteractionsService } from "./learning-interactions.service";
import { interactionCreationCoordinator } from "./interaction-creation-coordinator";
import {
  getOptimisticEditFields,
  optimisticEditCoordinator,
  type OptimisticEditFields,
  type OptimisticEditKind,
} from "./optimistic-edit-coordinator";
import { updateOptimisticEditInCaches } from "./edit-cache-updaters";

export interface OptimisticEditMutationMeta {
  clientId: string;
  serverId: string;
  baseline: OptimisticEditFields;
  optimistic: OptimisticEditFields;
}

interface OptimisticEditMutationContext extends OptimisticEditMutationMeta {
  kind: OptimisticEditKind;
}

function beginOptimisticEdit(
  queryClient: ReturnType<typeof useQueryClient>,
  kind: OptimisticEditKind,
  meta: OptimisticEditMutationMeta,
): OptimisticEditMutationContext {
  const record = optimisticEditCoordinator.begin({ kind, ...meta });
  if (!record) throw new Error("This entity is already being edited.");
  updateOptimisticEditInCaches(
    queryClient,
    kind,
    meta.clientId,
    meta.serverId,
    meta.optimistic,
  );
  return { ...meta, kind };
}

function confirmOptimisticEdit(
  queryClient: ReturnType<typeof useQueryClient>,
  response: unknown,
  context: OptimisticEditMutationContext,
): void {
  const authoritative = getOptimisticEditFields(response, context.optimistic);
  if (
    optimisticEditCoordinator.confirm(
      context.kind,
      context.clientId,
      authoritative,
    )
  ) {
    updateOptimisticEditInCaches(
      queryClient,
      context.kind,
      context.clientId,
      context.serverId,
      authoritative,
    );
  }
}

function rollbackOptimisticEdit(
  queryClient: ReturnType<typeof useQueryClient>,
  context: OptimisticEditMutationContext,
): void {
  if (optimisticEditCoordinator.fail(context.kind, context.clientId)) {
    updateOptimisticEditInCaches(
      queryClient,
      context.kind,
      context.clientId,
      context.serverId,
      context.baseline,
    );
  }
}

export function useCreateLessonThread(courseId: string, lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation<
    LearningThread,
    ApiError,
    CreateLearningThreadRequest,
    { clientId: string }
  >({
    mutationFn: (payload) =>
      learningInteractionsService.createThread(courseId, lessonId, payload),
    onMutate: (payload) => {
      const record = interactionCreationCoordinator.beginThreadCreation({
        queryClient,
        context: { courseId, lessonId },
        payload,
      });
      return { clientId: record.clientId };
    },
    onSuccess: (serverThread, _payload, context) => {
      interactionCreationCoordinator.confirmThread(
        queryClient,
        context.clientId,
        serverThread,
      );
    },
    onError: (_error, _payload, context) => {
      if (context) {
        interactionCreationCoordinator.failThread(
          queryClient,
          context.clientId,
        );
      }
    },
  });
}

type UpdateThreadMutationInput =
  | {
      threadId?: string;
      payload: UpdateLearningThreadRequest;
      __optimistic?: OptimisticEditMutationMeta;
    }
  | UpdateLearningThreadRequest;

export function useUpdateThread(threadId?: string) {
  const queryClient = useQueryClient();
  return useMutation<
    any,
    ApiError,
    UpdateThreadMutationInput,
    OptimisticEditMutationContext | undefined
  >({
    mutationFn: (variables) => {
      if ("payload" in variables) {
        const id = variables.threadId ?? threadId;
        if (!id) throw new Error("threadId is required to update thread");
        return learningInteractionsService.updateThread(id, variables.payload);
      }
      if (!threadId) throw new Error("threadId is required to update thread");
      return learningInteractionsService.updateThread(threadId, variables);
    },
    onMutate: (variables) => {
      if (!("payload" in variables) || !variables.__optimistic)
        return undefined;
      return beginOptimisticEdit(queryClient, "thread", variables.__optimistic);
    },
    onSuccess: (data, _variables, context) => {
      if (context) confirmOptimisticEdit(queryClient, data, context);
    },
    onError: (_error, _variables, context) => {
      if (context) rollbackOptimisticEdit(queryClient, context);
    },
  });
}

export function useDeleteThread() {
  return useMutation<any, ApiError, string>({
    mutationFn: (threadId) =>
      learningInteractionsService.deleteThread(threadId),
  });
}

type CreateReplyMutationInput = CreateLearningReplyRequest & {
  /** Internal transport override; never included in the API payload. */
  __serverThreadId?: string;
};

type CreateNoteMutationInput = CreateLearningNoteRequest & {
  /** Local-only metadata used for the optimistic cache entity. */
  __attachments?: LearningNote["attachments"];
};

export function useCreateReply(threadId?: string) {
  return useMutation<LearningReply, ApiError, CreateReplyMutationInput>({
    mutationFn: (input) => {
      const { __serverThreadId, ...payload } = input;
      const transportThreadId = __serverThreadId ?? threadId;
      if (!transportThreadId)
        throw new Error("A confirmed server thread ID is required.");
      return learningInteractionsService.createReply(
        transportThreadId,
        payload,
      );
    },
  });
}

export function useUpdateReply(threadId?: string) {
  const queryClient = useQueryClient();
  return useMutation<
    any,
    ApiError,
    {
      replyId: string;
      payload: UpdateLearningReplyRequest;
      __optimistic?: OptimisticEditMutationMeta;
    },
    OptimisticEditMutationContext | undefined
  >({
    mutationFn: ({ replyId, payload }) =>
      learningInteractionsService.updateReply(replyId, payload),
    onMutate: (variables) => {
      if (!variables.__optimistic) return undefined;
      return beginOptimisticEdit(queryClient, "reply", variables.__optimistic);
    },
    onSuccess: (data, _variables, context) => {
      if (context) confirmOptimisticEdit(queryClient, data, context);
    },
    onError: (_error, _variables, context) => {
      if (context) rollbackOptimisticEdit(queryClient, context);
    },
  });
}

export function useDeleteReply(threadId?: string) {
  return useMutation<any, ApiError, string>({
    mutationFn: (replyId) => learningInteractionsService.deleteReply(replyId),
  });
}

export function useToggleLike() {
  return useMutation<any, ApiError, ToggleLikeRequest>({
    mutationFn: (payload) => learningInteractionsService.toggleLike(payload),
  });
}

export function useToggleBookmark() {
  return useMutation<any, ApiError, string>({
    mutationFn: (threadId) =>
      learningInteractionsService.toggleBookmark(threadId),
  });
}

export function useToggleFollow() {
  return useMutation<any, ApiError, string>({
    mutationFn: (threadId) =>
      learningInteractionsService.toggleFollow(threadId),
  });
}

export function useAcceptReply(defaultThreadId?: string) {
  const queryClient = useQueryClient();
  return useMutation<
    any,
    ApiError,
    { threadId?: string; replyId: string; payload?: AcceptReplyRequest }
  >({
    mutationFn: ({ replyId, payload }) =>
      learningInteractionsService.acceptReply(replyId, payload),
    onSuccess: (_data, variables) => {
      const targetThreadId = variables.threadId || defaultThreadId;
      if (targetThreadId) {
        queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.threadDetails(targetThreadId),
        });
        queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.threadRepliesRoot(targetThreadId),
        });
      }
    },
  });
}

export function useLockThread(defaultThreadId?: string) {
  const queryClient = useQueryClient();
  return useMutation<
    any,
    ApiError,
    { threadId?: string; payload: LockThreadRequest } | LockThreadRequest
  >({
    mutationFn: (variables) => {
      const threadId =
        "threadId" in variables && variables.threadId
          ? variables.threadId
          : defaultThreadId!;
      const payload =
        "payload" in variables && variables.payload
          ? variables.payload
          : (variables as LockThreadRequest);
      return learningInteractionsService.lockThread(threadId, payload);
    },
    onSuccess: (_data, variables) => {
      const targetThreadId =
        "threadId" in variables && variables.threadId
          ? variables.threadId
          : defaultThreadId;
      if (targetThreadId) {
        queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.threadDetails(targetThreadId),
        });
      }
    },
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation<
    LearningNote,
    ApiError,
    CreateNoteMutationInput,
    { clientId: string }
  >({
    mutationFn: ({ __attachments: _attachments, ...payload }) =>
      learningInteractionsService.createNote(payload),
    onMutate: (payload) => {
      const { __attachments, ...notePayload } = payload;
      const record = interactionCreationCoordinator.beginNoteCreation({
        queryClient,
        context: {
          courseId: notePayload.courseId,
          lessonId: notePayload.lessonId,
        },
        payload: notePayload,
        attachments: __attachments,
        dispatch: (notePayload) =>
          learningInteractionsService.createNote(notePayload),
      });
      return { clientId: record.clientId };
    },
    onSuccess: (serverNote, _payload, context) => {
      interactionCreationCoordinator.confirmNote(
        queryClient,
        context.clientId,
        serverNote,
      );
    },
    onError: (_error, _payload, context) => {
      if (context) {
        interactionCreationCoordinator.failNote(queryClient, context.clientId);
      }
    },
  });
}

type UpdateNoteMutationInput =
  | {
      noteId?: string;
      payload: UpdateLearningNoteRequest;
      __optimistic?: OptimisticEditMutationMeta;
    }
  | UpdateLearningNoteRequest;

export function useUpdateNote(noteId?: string) {
  const queryClient = useQueryClient();
  return useMutation<
    any,
    ApiError,
    UpdateNoteMutationInput,
    OptimisticEditMutationContext | undefined
  >({
    mutationFn: (variables) => {
      if ("payload" in variables) {
        const id = variables.noteId ?? noteId;
        if (!id) throw new Error("noteId is required to update note");
        return learningInteractionsService.updateNote(id, variables.payload);
      }
      if (!noteId) throw new Error("noteId is required to update note");
      return learningInteractionsService.updateNote(noteId, variables);
    },
    onMutate: (variables) => {
      if (!("payload" in variables) || !variables.__optimistic)
        return undefined;
      return beginOptimisticEdit(queryClient, "note", variables.__optimistic);
    },
    onSuccess: (data, _variables, context) => {
      if (context) confirmOptimisticEdit(queryClient, data, context);
    },
    onError: (_error, _variables, context) => {
      if (context) rollbackOptimisticEdit(queryClient, context);
    },
  });
}

export function useDeleteNote() {
  return useMutation<any, ApiError, string>({
    mutationFn: (noteId) => learningInteractionsService.deleteNote(noteId),
  });
}

export function useCreateReport() {
  return useMutation<any, ApiError, CreateReportRequest>({
    mutationFn: (payload) => learningInteractionsService.createReport(payload),
  });
}

export function useModerateThread(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, ModerateThreadRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.moderatePlatformThread(threadId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useModerateReply(replyId: string, threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, ModerateReplyRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.moderatePlatformReply(replyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadRepliesRoot(threadId),
      });
    },
  });
}

export function useSuspendUser() {
  return useMutation<any, ApiError, SuspendUserRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.suspendPlatformUser(payload.userId, payload),
  });
}

export function useUnsuspendUser() {
  return useMutation<any, ApiError, UnsuspendUserRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.unsuspendPlatformUser(
        payload.userId,
        payload,
      ),
  });
}

export function useUploadDiscussionAttachment() {
  return useMutation<LearningUploadResponse, ApiError, File>({
    mutationFn: (file: File) =>
      learningInteractionsService.uploadAttachmentDirect(file),
  });
}
