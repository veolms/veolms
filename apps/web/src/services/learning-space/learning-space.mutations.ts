import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  LearningSpaceSession,
  LearningSpaceSessionsResponse,
  UpsertLearningSpaceSessionRequest,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { learningSpaceKeys } from "./learning-space.keys";
import { learningSpaceService } from "./learning-space.service";

export interface UpsertLearningSpaceSessionInput {
  courseKey: string;
  payload: UpsertLearningSpaceSessionRequest;
}

export interface CloseLearningSpaceSessionInput {
  courseKey: string;
}

function addSessionToCache(
  queryClient: QueryClient,
  userId: string | null | undefined,
  session: LearningSpaceSession,
) {
  if (!userId) return;
  const queryKey = learningSpaceKeys.sessions(userId);
  const current =
    queryClient.getQueryData<LearningSpaceSessionsResponse>(queryKey);
  queryClient.setQueryData<LearningSpaceSessionsResponse>(queryKey, {
    sessions: [
      session,
      ...(current?.sessions ?? []).filter(
        (existing) => existing.courseId !== session.courseId,
      ),
    ],
  });
}

export function useUpsertLearningSpaceSession(userId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation<
    LearningSpaceSession,
    ApiError,
    UpsertLearningSpaceSessionInput
  >({
    mutationFn: ({ courseKey, payload }) =>
      learningSpaceService.upsert(courseKey, payload),
    onSuccess: (session) => {
      addSessionToCache(queryClient, userId, session);
    },
  });
}

export function useCloseLearningSpaceSession(userId?: string | null) {
  const queryClient = useQueryClient();
  const queryKey = learningSpaceKeys.sessions(userId);

  return useMutation<
    { closed: true },
    ApiError,
    CloseLearningSpaceSessionInput,
    { previous: LearningSpaceSessionsResponse | undefined }
  >({
    mutationFn: ({ courseKey }) => learningSpaceService.close(courseKey),
    onMutate: async ({ courseKey }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<LearningSpaceSessionsResponse>(queryKey);
      if (previous) {
        queryClient.setQueryData<LearningSpaceSessionsResponse>(queryKey, {
          sessions: previous.sessions.filter(
            (session) =>
              session.courseSlug !== courseKey &&
              session.courseId !== courseKey,
          ),
        });
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });
}
