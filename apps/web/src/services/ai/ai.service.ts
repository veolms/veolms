import {
  aiAvailabilitySchema,
  aiSettingsResponseSchema,
  testAiConnectionResponseSchema,
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
  testConnection: async () =>
    testAiConnectionResponseSchema.parse(
      await api.post<unknown>("/platform/ai-settings/test"),
    ),
  getAvailability: async () =>
    aiAvailabilitySchema.parse(await api.get<unknown>("/ai/availability")),
};
