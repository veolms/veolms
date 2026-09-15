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
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { learningInteractionsService } from "./learning-interactions.service";
import { interactionCreationCoordinator } from "./interaction-creation-coordinator";

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

export function useUpdateThread(threadId?: string) {
  const queryClient = useQueryClient();
  return useMutation<
    any,
    ApiError,
    | { threadId?: string; payload: UpdateLearningThreadRequest }
    | UpdateLearningThreadRequest
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
    onSuccess: (_data, variables) => {
      const id =
        "payload" in variables ? (variables.threadId ?? threadId) : threadId;
      if (id) {
        queryClient.invalidateQueries({
          queryKey: learningInteractionKeys.threadDetails(id),
        });
      }
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, string>({
    mutationFn: (threadId) =>
      learningInteractionsService.deleteThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

type CreateReplyMutationInput = CreateLearningReplyRequest & {
  /** Internal transport override; never included in the API payload. */
  __serverThreadId?: string;
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
    { replyId: string; payload: UpdateLearningReplyRequest }
  >({
    mutationFn: ({ replyId, payload }) =>
      learningInteractionsService.updateReply(replyId, payload),
    onSuccess: () => {
      if (!threadId) return;
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadRepliesRoot(threadId),
      });
    },
  });
}

export function useDeleteReply(threadId?: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, string>({
    mutationFn: (replyId) => learningInteractionsService.deleteReply(replyId),
    onSuccess: () => {
      if (!threadId) return;
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadRepliesRoot(threadId),
      });
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
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
  return useMutation<any, ApiError, CreateLearningNoteRequest>({
    mutationFn: (payload) => learningInteractionsService.createNote(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.notesRoot(),
      });
    },
  });
}

export function useUpdateNote(noteId?: string) {
  const queryClient = useQueryClient();
  return useMutation<
    any,
    ApiError,
    | { noteId?: string; payload: UpdateLearningNoteRequest }
    | UpdateLearningNoteRequest
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
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.notesRoot(),
      });
    },
  });
}

export function useDeleteNote() {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, string>({
    mutationFn: (noteId) => learningInteractionsService.deleteNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.notesRoot(),
      });
    },
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
