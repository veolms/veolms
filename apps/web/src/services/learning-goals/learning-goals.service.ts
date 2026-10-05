import type {
  LearningGoalSettingsResponse,
  LearningSummaryResponse,
  UpdateLearningGoalSettingsRequest,
} from "@veolms/contracts";

import { api } from "../../lib/api-client";

export const learningGoalsService = {
  summary: (): Promise<LearningSummaryResponse> =>
    api.get<LearningSummaryResponse>("/learning/summary"),

  getSettings: (): Promise<LearningGoalSettingsResponse> =>
    api.get<LearningGoalSettingsResponse>("/learning/goal-settings"),

  updateSettings: (
    input: UpdateLearningGoalSettingsRequest,
  ): Promise<LearningGoalSettingsResponse> =>
    api.put<LearningGoalSettingsResponse>("/learning/goal-settings", input),
};
