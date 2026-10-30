/**
 * Public Platform module surface: other modules read the academy-wide
 * settings through this service.
 */
export {
  createPlatformSettingsService,
  type PlatformSettingsService,
} from "./platform-settings.service.ts";
