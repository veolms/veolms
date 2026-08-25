export * from "./course.ts";
export * from "./media.ts";
export * from "./commerce.ts";

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
  LoginResponse,
  AuthMessageResponse,
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
