import { useMutation, useQueryClient } from "@tanstack/react-query";

import { learningGoalKeys } from "./learning-goals.keys";
import { learningGoalsService } from "./learning-goals.service";

export function useUpdateLearningGoalSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: learningGoalsService.updateSettings,
    onSuccess: async (settings) => {
      queryClient.setQueryData(learningGoalKeys.settings(), settings);
      // The summary derives today's % and targets from the goal.
      await queryClient.invalidateQueries({
        queryKey: learningGoalKeys.summary(),
      });
    },
  });
}
