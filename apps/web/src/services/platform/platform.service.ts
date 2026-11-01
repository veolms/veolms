import type {
  PlatformSettingsResponse,
  PublicPlatformSettingsResponse,
  UpdatePlatformSettingsRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const platformService = {
  /** The settings in force, saved or default (administrators only). */
  getSettings(): Promise<PlatformSettingsResponse> {
    return api.get<PlatformSettingsResponse>("/platform/settings");
  },
  /** The same settings, as every visitor's browser reads them. */
  getPublicSettings(): Promise<PublicPlatformSettingsResponse> {
    return api.get<PublicPlatformSettingsResponse>("/platform/public-settings");
  },
  updateSettings(
    changes: UpdatePlatformSettingsRequest,
  ): Promise<PlatformSettingsResponse> {
    return api.patch<PlatformSettingsResponse>("/platform/settings", changes);
  },
};
