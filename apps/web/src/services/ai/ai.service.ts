import {
  aiAvailabilitySchema,
  aiSettingsResponseSchema,
  testAiConnectionResponseSchema,
  type AiCustomModelRequest,
  type AiProvider,
  type SaveAiProviderRequest,
  type TestAiConnectionRequest,
  type UpdateAiSettingsRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const aiService = {
  getSettings: async () =>
    aiSettingsResponseSchema.parse(
      await api.get<unknown>("/platform/ai-settings"),
    ),
  updateSettings: async (payload: UpdateAiSettingsRequest) =>
    aiSettingsResponseSchema.parse(
      await api.patch<unknown>("/platform/ai-settings", payload),
    ),
  saveProvider: async ({
    provider,
    ...payload
  }: SaveAiProviderRequest & { provider: AiProvider }) =>
    aiSettingsResponseSchema.parse(
      await api.put<unknown>(`/platform/ai-providers/${provider}`, payload),
    ),
  addModel: async (payload: AiCustomModelRequest) =>
    aiSettingsResponseSchema.parse(
      await api.post<unknown>("/platform/ai-models", payload),
    ),
  removeModel: async (modelId: string) =>
    aiSettingsResponseSchema.parse(
      await api.delete<unknown>(
        `/platform/ai-models/${encodeURIComponent(modelId)}`,
      ),
    ),
  testConnection: async (payload: TestAiConnectionRequest = {}) =>
    testAiConnectionResponseSchema.parse(
      await api.post<unknown>("/platform/ai-settings/test", payload),
    ),
  getAvailability: async () =>
    aiAvailabilitySchema.parse(await api.get<unknown>("/ai/availability")),
};
