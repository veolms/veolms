import type {
  LearningCommunityResponse,
  LearningGoalSettingsResponse,
  LearningHistoryResponse,
  LearningSummaryResponse,
  ProgressSharingResponse,
  UpdateLearningGoalSettingsRequest,
  UpdateProgressSharingRequest,
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

  /** A learner's days in a range; without a username, the viewer's own. */
  history: (params: {
    from: string;
    to: string;
    username?: string;
  }): Promise<LearningHistoryResponse> =>
    api.get<LearningHistoryResponse>("/learning/history", { params }),

  /** The members who share their progress. */
  community: (): Promise<LearningCommunityResponse> =>
    api.get<LearningCommunityResponse>("/learning/community"),

  updateSharing: (
    input: UpdateProgressSharingRequest,
  ): Promise<ProgressSharingResponse> =>
    api.put<ProgressSharingResponse>("/learning/progress-sharing", input),
};
