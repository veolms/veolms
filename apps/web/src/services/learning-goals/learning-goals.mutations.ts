import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { LearningHistoryResponse } from "@veolms/contracts";

import { learningGoalKeys } from "./learning-goals.keys";
import { learningGoalsService } from "./learning-goals.service";

export function useUpdateLearningGoalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: learningGoalsService.updateSettings,
    onSuccess: async (settings) => {
      queryClient.setQueryData(learningGoalKeys.settings(), settings);
      // The summary derives today's % and targets from the goal, and today
      // in the history is judged against the goal as it now stands.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: learningGoalKeys.summary(),
        }),
        queryClient.invalidateQueries({
          queryKey: learningGoalKeys.histories(),
        }),
      ]);
    },
  });
}

/** Turns sharing the learner's progress with other members on or off. */
export function useUpdateProgressSharing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: learningGoalsService.updateSharing,
    onSuccess: async ({ shared }) => {
      // Every range of the learner's own history says whether it is
      // shared. They are told at once rather than fetched again: until a
      // fetch came back the switch would show what it showed before.
      queryClient.setQueriesData<LearningHistoryResponse>(
        { queryKey: learningGoalKeys.histories() },
        (history) => (history?.isOwn ? { ...history, shared } : history),
      );
      // The list of members who share has gained or lost them.
      await queryClient.invalidateQueries({
        queryKey: learningGoalKeys.community(),
      });
    },
  });
}
