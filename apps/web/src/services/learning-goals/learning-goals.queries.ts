import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "../../lib/api-error";
import { learningGoalKeys } from "./learning-goals.keys";
import { learningGoalsService } from "./learning-goals.service";

export function useLearningSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: learningGoalKeys.summary(),
    queryFn: learningGoalsService.summary,
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
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

export type LearningGoalQueryError = ApiError;
