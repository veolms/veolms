import type {
  LearningProgressBatchRequest,
  LearningProgressResponse,
  LearningProgressSyncResponse,
} from "@veolms/contracts";
import { getApiRequestUrl, api } from "../../lib/api-client";

const getProgressPath = (courseKey: string) =>
  `/learning-progress/${encodeURIComponent(courseKey)}`;

export const learningProgressService = {
  get(courseKey: string): Promise<LearningProgressResponse> {
    return api.get<LearningProgressResponse>(getProgressPath(courseKey));
  },

  sync(
    courseKey: string,
    payload: LearningProgressBatchRequest,
  ): Promise<LearningProgressSyncResponse> {
    return api.post<LearningProgressSyncResponse>(
      `${getProgressPath(courseKey)}/batch`,
      payload,
    );
  },

  getSyncUrl(courseKey: string): string {
    return getApiRequestUrl(`${getProgressPath(courseKey)}/batch`);
  },

  syncKeepalive(
    courseKey: string,
    payload: LearningProgressBatchRequest,
  ): Promise<void> {
    return fetch(this.getSyncUrl(courseKey), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then(() => undefined);
  },
};
