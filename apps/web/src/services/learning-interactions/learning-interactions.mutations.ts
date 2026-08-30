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
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { learningInteractionsService } from "./learning-interactions.service";

export function useCreateLessonThread(courseId: string, lessonId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, CreateLearningThreadRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.createThread(courseId, lessonId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useUpdateThread(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, UpdateLearningThreadRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.updateThread(threadId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadDetails(threadId),
      });
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useDeleteThread() {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, string>({
    mutationFn: (threadId) => learningInteractionsService.deleteThread(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useCreateReply(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, CreateLearningReplyRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.createReply(threadId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadReplies(threadId),
      });
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useUpdateReply(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, { replyId: string; payload: UpdateLearningReplyRequest }>({
    mutationFn: ({ replyId, payload }) =>
      learningInteractionsService.updateReply(replyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadReplies(threadId),
      });
    },
  });
}

export function useDeleteReply(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, string>({
    mutationFn: (replyId) => learningInteractionsService.deleteReply(replyId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadReplies(threadId),
      });
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useToggleLike() {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, ToggleLikeRequest>({
    mutationFn: (payload) => learningInteractionsService.toggleLike(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useToggleBookmark() {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, string>({
    mutationFn: (threadId) => learningInteractionsService.toggleBookmark(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useToggleFollow() {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, string>({
    mutationFn: (threadId) => learningInteractionsService.toggleFollow(threadId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useAcceptReply(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, { replyId: string; payload?: AcceptReplyRequest }>({
    mutationFn: ({ replyId, payload }) =>
      learningInteractionsService.acceptReply(replyId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadDetails(threadId),
      });
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadReplies(threadId),
      });
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useLockThread(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, LockThreadRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.lockThread(threadId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.threadDetails(threadId),
      });
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.all,
      });
    },
  });
}

export function useCreateNote() {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, CreateLearningNoteRequest>({
    mutationFn: (payload) => learningInteractionsService.createNote(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.notes(),
      });
    },
  });
}

export function useUpdateNote(noteId: string) {
  const queryClient = useQueryClient();
  return useMutation<any, ApiError, UpdateLearningNoteRequest>({
    mutationFn: (payload) =>
      learningInteractionsService.updateNote(noteId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: learningInteractionKeys.notes(),
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
        queryKey: learningInteractionKeys.notes(),
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
        queryKey: learningInteractionKeys.threadReplies(threadId),
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
      learningInteractionsService.unsuspendPlatformUser(payload.userId, payload),
  });
}
