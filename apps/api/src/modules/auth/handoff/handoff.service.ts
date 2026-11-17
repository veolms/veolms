import { signInHandoffProvider } from "@veolms/config";

import { AppError } from "../../../lib/errors.ts";
import type { AuthService } from "../authentication/authentication.service.ts";
import type { SessionService } from "../session/session.service.ts";
import type { SessionLocation } from "../shared/request-location.ts";

/**
 * Signs in someone handed over from another site of the same deployment
 * (see `setSignInHandoffProvider`): the provider spends the token and says
 * who they are; their account here is found by that verified email or
 * mobile, or made, and a session starts as after a code.
 *
 * A new account here is made the way setup makes the first one: if the site
 * has no account yet, it becomes the administrator (an academy's owner
 * arriving from its launch); otherwise it is an ordinary learner's.
 */
export function createHandoffService({
  authService,
  sessionService,
}: {
  authService: AuthService;
  sessionService: SessionService;
}) {
  async function signIn(
    token: string,
    request: {
      ip: string;
      userAgent: string | null;
      existingSessionToken?: string | null;
      location?: SessionLocation | null;
    },
  ) {
    const provider = signInHandoffProvider();
    if (!provider) {
      throw new AppError(404, "NOT_FOUND", "Route not found.");
    }
    const person = await provider(token);
    if (!person || (!person.email && !person.phoneNo)) {
      throw new AppError(
        401,
        "HANDOFF_INVALID",
        "This sign-in link has expired or was already used. Sign in instead.",
      );
    }

    const identifierType = person.email ? "email" : "phone";
    const identifier = (person.email ?? person.phoneNo)!;
    const existing = await authService.findUserByIdentifierIncludingDeleted(
      identifier,
      identifierType,
    );
    if (existing?.is_deleted) {
      throw new AppError(
        403,
        "ACCOUNT_DEACTIVATED",
        "This account has been deactivated.",
      );
    }

    const userId =
      existing?.id ??
      (await authService.createUser({
        email: person.email,
        phoneNo: person.phoneNo,
        username: await authService.generateUniqueUsername(
          person.email?.split("@")[0] ?? person.displayName,
        ),
        displayName: person.displayName,
        emailVerified: Boolean(person.email),
        phoneVerified: Boolean(person.phoneNo),
        allowBootstrapAdmin: true,
      }));

    const user = await authService.requireUser(userId);
    const session = await sessionService.establishSession(user, request);
    return { user: { ...user, roles: session.roles }, session };
  }

  return { signIn };
}
