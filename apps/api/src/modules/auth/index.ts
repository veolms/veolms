/**
 * Public Auth module surface. Repositories and feature internals stay private;
 * other modules may depend on service contracts exposed here.
 */
export type { AuthService } from "./authentication/authentication.service.ts";
export type { SessionService } from "./session/session.service.ts";
