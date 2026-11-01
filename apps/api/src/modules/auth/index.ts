/**
 * Public Auth module surface. Repositories and feature internals stay private;
 * other modules may depend on service contracts exposed here.
 */
export {
  createAuthService,
  type AuthService,
  type AuthServiceOptions,
} from "./authentication/authentication.service.ts";
export {
  createSessionService,
  type SessionService,
  type SessionServiceOptions,
} from "./session/session.service.ts";
export {
  clearSessionAuthCache,
  evictCachedUserSessions,
} from "./shared/session-auth-cache.ts";
export { setSignInClaim, type SignInClaim } from "./shared/sign-in-claim.ts";
export {
  forgetAcademy,
  getAcademyId,
  getAcademyRow,
} from "./setup/academy-cache.ts";
export * from "./shared/auth.constants.ts";
export * from "./shared/auth.types.ts";
