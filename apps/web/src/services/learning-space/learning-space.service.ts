import {
  closeLearningSpaceSessionResponseSchema,
  learningSpaceSessionSchema,
  learningSpaceSessionsResponseSchema,
  type LearningSpaceSession,
  type LearningSpaceSessionsResponse,
  type UpsertLearningSpaceSessionRequest,
} from "@veolms/contracts";

import { api } from "../../lib/api-client";

export const learningSpaceService = {
  list: async (): Promise<LearningSpaceSessionsResponse> => {
    const response = await api.get<unknown>("/learning-space/sessions");
    return learningSpaceSessionsResponseSchema.parse(response);
  },

  upsert: async (
    courseKey: string,
    input: UpsertLearningSpaceSessionRequest,
  ): Promise<LearningSpaceSession> => {
    const response = await api.put<unknown>(
      `/learning-space/sessions/${encodeURIComponent(courseKey)}`,
      input,
    );
    return learningSpaceSessionSchema.parse(response);
  },

  close: async (courseKey: string): Promise<{ closed: true }> => {
    const response = await api.delete<unknown>(
      `/learning-space/sessions/${encodeURIComponent(courseKey)}`,
    );
    return closeLearningSpaceSessionResponseSchema.parse(response);
  },
};
