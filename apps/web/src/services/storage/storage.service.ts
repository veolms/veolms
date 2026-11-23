import type {
  ApproveStorageRequest,
  BlockStorageRequest,
  CreateStorageRequest,
  DeclineStorageRequest,
  MyStorageResponse,
  SetStorageLimitRequest,
  StorageLearnerDetailResponse,
  StorageLearnerResponse,
  StorageLearnersQuery,
  StorageLearnersResponse,
  StorageRequestResponse,
  StorageSettings,
  UpdateStorageSettingsRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

const learnerPath = (userId: string) =>
  `/storage/learners/${encodeURIComponent(userId)}`;
const requestPath = (requestId: string) =>
  `/storage/requests/${encodeURIComponent(requestId)}`;

/**
 * Learners' storage space: a learner's own (used, limit, request for more)
 * and, for admins, everyone's (Settings > Student storage).
 */
export const storageService = {
  mine(): Promise<MyStorageResponse> {
    return api.get<MyStorageResponse>("/storage/me");
  },

  requestMore(body: CreateStorageRequest): Promise<StorageRequestResponse> {
    return api.post<StorageRequestResponse>("/storage/me/requests", body);
  },

  cancelRequest(): Promise<StorageRequestResponse> {
    return api.post<StorageRequestResponse>("/storage/me/requests/cancel");
  },

  learners(query: StorageLearnersQuery): Promise<StorageLearnersResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return api.get<StorageLearnersResponse>(`/storage/learners?${params}`);
  },

  learner(userId: string): Promise<StorageLearnerDetailResponse> {
    return api.get<StorageLearnerDetailResponse>(learnerPath(userId));
  },

  setLimit(
    userId: string,
    body: SetStorageLimitRequest,
  ): Promise<StorageLearnerResponse> {
    return api.put<StorageLearnerResponse>(
      `${learnerPath(userId)}/limit`,
      body,
    );
  },

  block(userId: string, body: BlockStorageRequest) {
    return api.post<StorageLearnerResponse>(
      `${learnerPath(userId)}/block`,
      body,
    );
  },

  unblock(userId: string) {
    return api.post<StorageLearnerResponse>(`${learnerPath(userId)}/unblock`);
  },

  recount(userId: string) {
    return api.post<StorageLearnerResponse>(`${learnerPath(userId)}/recount`);
  },

  approve(requestId: string, body: ApproveStorageRequest) {
    return api.post<StorageLearnerResponse>(
      `${requestPath(requestId)}/approve`,
      body,
    );
  },

  decline(requestId: string, body: DeclineStorageRequest) {
    return api.post<StorageLearnerResponse>(
      `${requestPath(requestId)}/decline`,
      body,
    );
  },

  settings(): Promise<StorageSettings> {
    return api.get<StorageSettings>("/storage/settings");
  },

  updateSettings(body: UpdateStorageSettingsRequest): Promise<StorageSettings> {
    return api.put<StorageSettings>("/storage/settings", body);
  },
};
