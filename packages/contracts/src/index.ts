export {
  courseListResponseSchema,
  courseSlugParamsSchema,
  courseSlugSchema,
  courseSummarySchema,
  publicCourseSchema,
} from "./course.ts";
export type {
  CourseSlugParams,
  CourseSummary,
  PublicCourse,
} from "./course.ts";

export { healthResponseSchema } from "./health.ts";
export type { HealthResponse } from "./health.ts";

export { errorResponseSchema } from "./error.ts";
export type { ErrorResponse, ValidationIssue } from "./error.ts";

export {
  otpSendRequestSchema,
  otpVerifyRequestSchema,
  registerRequestSchema,
  loginRequestSchema,
  oauthProviderSchema,
  oauthUrlRequestSchema,
  oauthUrlResponseSchema,
  oauthCallbackRequestSchema,
  oauthLoginRequestSchema,
  oauthRegisterRequestSchema,
  authConfigResponseSchema,
  passkeyRegisterVerifyRequestSchema,
  passkeyLoginVerifyRequestSchema,
  totpVerifyRequestSchema,
  totpEnableRequestSchema,
  authMessageResponseSchema,
  loginResponseSchema,
  userProfileResponseSchema,
  sessionParamsSchema,
  sessionResponseSchema,
  setupTokenRequestSchema,
  creatorRegisterRequestSchema,
  academyRequestSchema,
  academyResponseSchema,
  totpSetupResponseSchema,
  totpEnableResponseSchema,
  passkeyOptionsResponseSchema,
} from "./auth.ts";

export type {
  OtpSendRequest,
  OtpVerifyRequest,
  RegisterRequest,
  LoginRequest,
  OauthProvider,
  OauthUrlRequest,
  OauthUrlResponse,
  OauthCallbackRequest,
  OauthLoginRequest,
  OauthRegisterRequest,
  AuthConfigResponse,
  PasskeyRegisterVerifyRequest,
  PasskeyLoginVerifyRequest,
  UserProfileResponse,
  SessionParams,
  SessionResponse,
  SetupTokenRequest,
  CreatorRegisterRequest,
  AcademyRequest,
  AcademyResponse,
  TotpVerifyRequest,
  TotpEnableRequest,
} from "./auth.ts";

export {
  systemConfigItemSchema,
  systemConfigResponseSchema,
  themePresetSchema,
  themeListResponseSchema,
  createThemePresetInputSchema,
  updateThemePresetInputSchema,
  userPreferencesSchema,
  updateSystemConfigItemSchema,
} from "./system-config.ts";

export type {
  SystemConfigItem,
  SystemConfigResponse,
  ThemePreset,
  ThemeListResponse,
  CreateThemePresetInput,
  UpdateThemePresetInput,
  UserPreferences,
  UpdateSystemConfigItem,
} from "./system-config.ts";

