import { useQuery } from "@tanstack/react-query";
import type { LearningHistoryResponse } from "@veolms/contracts";

import { getApiError, type ApiError } from "../../lib/api-error";
import { learningGoalKeys } from "./learning-goals.keys";
import { learningGoalsService } from "./learning-goals.service";

/**
 * How long today's learning is taken as current. A copy is kept in the tab
 * (see `services/accountSessionCopies.ts`): within this a reload shows it
 * and asks nothing; after it, it is shown and asked for again. Learning in
 * this tab marks it out of date as soon as it is synced.
 */
export const LEARNING_SUMMARY_STALE_MS = 60_000;

export function useLearningSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: learningGoalKeys.summary(),
    queryFn: learningGoalsService.summary,
    enabled: options?.enabled ?? true,
    staleTime: LEARNING_SUMMARY_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useLearningGoalSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: learningGoalKeys.settings(),
    queryFn: learningGoalsService.getSettings,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

/**
 * One learner's days from `from` to `to` (both `YYYY-MM-DD`, both
 * included). Without a username it is the viewer's own history.
 */
export function useLearningHistory(
  range: { username?: string | null; from: string; to: string },
  options?: { enabled?: boolean },
) {
  const username = range.username ?? null;
  return useQuery({
    queryKey: learningGoalKeys.history(username, range.from, range.to),
    queryFn: (): Promise<LearningHistoryResponse> =>
      learningGoalsService.history({
        from: range.from,
        to: range.to,
        ...(username ? { username } : {}),
      }),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // "Not shared" and "not found" are answers, not faults to try again.
    retry: (failureCount, error) => {
      const { status } = getApiError(error);
      return status !== 403 && status !== 404 && failureCount < 2;
    },
  });
}

/** The members who share their progress, with their last seven days. */
export function useLearningCommunity(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: learningGoalKeys.community(),
    queryFn: learningGoalsService.community,
    enabled: options?.enabled ?? true,
    staleTime: 60_000,
  });
}

export type LearningGoalQueryError = ApiError;
