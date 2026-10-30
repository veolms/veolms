import { cacheTags, createCache, invalidateCache } from "@veolms/api-core";

import { config } from "../../../config.ts";
import type { AuthenticatedRequestContext } from "./auth.types.ts";

/**
 * The authentication context per session token, shared by every request
 * signed in with it. Building it costs four queries in two round trips
 * (session, then user, roles and MFA factors), and every authenticated
 * request needs it.
 *
 * Coherence:
 * - Entries live for SESSION_AUTH_CACHE_TTL_MS (0 disables the cache).
 * - Entries are labelled with their session, their user, `auth` and
 *   `rbac`, and the helpers below clear by label in EVERY API process (the
 *   cache bus): a logout, revocation, rotation or MFA verification
 *   (session.repository.ts), a change to the account itself
 *   (authentication.service.ts, mfa.service.ts), a role granted or revoked
 *   (team), a role edited (`rbac`) or the sign-in rules changed (`auth`).
 * - A session past its expiry is never served from the cache.
 * - Writes that bypass the API (the CLI) publish the same labels; anything
 *   else is seen when the entry expires.
 */
const authContexts = createCache<AuthenticatedRequestContext | null>({
  name: "auth.sessions",
  ttlMs: config.SESSION_AUTH_CACHE_TTL_MS,
  maxEntries: 20_000,
  maxBytes: 32 * 1024 * 1024,
});

/**
 * The context for `tokenHash`, from the cache while it is fresh, otherwise
 * from `load` (null for a token that signs nobody in, which is not kept).
 * Concurrent requests with the same token share one load.
 */
export async function getAuthContext(
  tokenHash: string,
  load: () => Promise<AuthenticatedRequestContext | null>,
): Promise<AuthenticatedRequestContext | null> {
  const context = await authContexts.fetch(tokenHash, load, {
    tagsOf: (loaded) =>
      loaded
        ? [
            cacheTags.session(loaded.session.id),
            cacheTags.user(loaded.session.user_id),
            cacheTags.auth,
            cacheTags.rbac,
          ]
        : [],
    keepIf: (loaded) => loaded !== null,
  });
  if (context && context.session.expires_at.getTime() <= Date.now()) {
    authContexts.delete(tokenHash);
    return null;
  }
  return context;
}

/** One session revoked, rotated or MFA-verified. */
export function evictCachedSession(sessionId: string): void {
  invalidateCache([cacheTags.session(sessionId)]);
}

/**
 * Every session of a user: revoke-all, deactivation, an account or role
 * change. Also clears what else is cached about the user (their roles).
 */
export function evictCachedUserSessions(userId: string): void {
  invalidateCache([cacheTags.user(userId)]);
}

/** Every session: the rules signing in follows have changed. */
export function clearSessionAuthCache(): void {
  invalidateCache([cacheTags.auth]);
}
