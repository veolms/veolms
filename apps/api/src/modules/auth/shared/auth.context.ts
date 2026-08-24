import { config } from "../../../config.ts";
import type { RoutePluginOptions } from "../../../lib/route-plugin.ts";
import {
  createAuthMiddleware,
  type AuthMiddleware,
} from "../../../middlewares/auth.middleware.ts";
import {
  createAuthService,
  type AuthService,
} from "../authentication/authentication.service.ts";
import { createMfaService, type MfaService } from "../mfa/mfa.service.ts";
import {
  createOauthService,
  type OauthService,
} from "../oauth/oauth.service.ts";
import { createOtpService, type OtpService } from "../otp/otp.service.ts";
import {
  createSessionService,
  type SessionService,
} from "../session/session.service.ts";
import {
  createSetupService,
  type SetupService,
} from "../setup/setup.service.ts";

export interface AuthContext {
  middleware: AuthMiddleware;
  authService: AuthService;
  otpService: OtpService;
  oauthService: OauthService;
  sessionService: SessionService;
  mfaService: MfaService;
  setupService: SetupService;
  /** Requires a valid session, without asserting MFA step-up. */
  authenticated: AuthMiddleware["authenticate"][];
  /** Requires a valid session that has cleared MFA where the account has it. */
  mfaVerified: AuthMiddleware["authenticate"][];
}

/**
 * Assembles the collaborators every auth route plugin needs.
 *
 * The `authenticated` / `mfaVerified` arrays exist so the preHandler chains are
 * declared once. Spelling them out per route is how a step in the chain gets
 * quietly omitted on one endpoint.
 */
export function createAuthContext({
  database,
  services,
}: RoutePluginOptions): AuthContext {
  const otpService = createOtpService({
    database,
    services,
    academyName: config.RP_NAME,
  });
  const sessionService = createSessionService({ database });
  const middleware = createAuthMiddleware(sessionService);
  const authService = createAuthService({
    database,
    otpService,
    sessionService,
  });
  const oauthService = createOauthService({ authService, sessionService });
  const mfaService = createMfaService({ database, sessionService });
  const setupService = createSetupService({
    database,
    authService,
    sessionService,
  });

  const authenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
  ];

  return {
    middleware,
    authService,
    otpService,
    oauthService,
    sessionService,
    mfaService,
    setupService,
    authenticated,
    mfaVerified: [...authenticated, middleware.requireMfaVerified],
  };
}
