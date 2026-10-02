import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AppError } from "../../../lib/errors.ts";
import type { AuthService } from "../authentication/authentication.service.ts";
import type { SessionService } from "../session/session.service.ts";
import type { SessionUser } from "../shared/auth.types.ts";
import { createOauthService } from "./oauth.service.ts";
import {
  googleIdTokenToProfile,
  type GoogleIdTokenClaims,
} from "./oauth.provider.ts";

const CLIENT_ID = "client-id.apps.googleusercontent.com";

const verifiedClaims: GoogleIdTokenClaims = {
  sub: "google-subject",
  email: "ada@example.com",
  email_verified: true,
  name: "Ada Lovelace",
  picture: "https://lh3.googleusercontent.com/a/ada",
  aud: CLIENT_ID,
  iss: "https://accounts.google.com",
};

const user: SessionUser = {
  id: "user-1",
  username: "ada",
  display_name: "Ada Lovelace",
  avatar_data_url: null,
  bio: null,
  email_public: false,
  mobile_public: false,
  linkedin_url: null,
  linkedin_public: false,
  github_url: null,
  github_public: false,
  website_url: null,
  website_public: false,
  email: "ada@example.com",
  email_verified_at: new Date("2026-01-01T00:00:00.000Z"),
  phone_no: null,
  phone_verified_at: null,
  is_deleted: false,
  mfa_mandatory: false,
};

const request = {
  ip: "127.0.0.1",
  userAgent: null,
};

function createService(
  onLookup?: (provider: string, providerUserId: string) => void,
) {
  return createOauthService({
    authService: {
      findUserByOauthAccountIncludingDeleted: async (
        provider: string,
        providerUserId: string,
      ) => {
        onLookup?.(provider, providerUserId);
        return user;
      },
      syncProviderAvatar: async () => {},
      requireUser: async () => user,
      getUserRoles: async () => ["student"],
    } as unknown as AuthService,
    sessionService: {
      establishSession: async () => ({
        token: "session-token",
        sessionId: "session-id",
        mfa: {
          totpEnabled: false,
          passkeyEnabled: false,
          mfaMandatory: true,
          mfaRequired: true,
        },
      }),
    } as unknown as SessionService,
  });
}

void describe("Google One Tap", () => {
  void it("logs in with the verified Google profile", async () => {
    let lookup: { provider: string; providerUserId: string } | null = null;
    const service = createService((provider, providerUserId) => {
      lookup = { provider, providerUserId };
    });

    const result = await service.loginWithGoogleCredential(
      "credential",
      request,
      async () => googleIdTokenToProfile(verifiedClaims, CLIENT_ID),
    );

    assert.deepEqual(lookup, {
      provider: "google",
      providerUserId: "google-subject",
    });
    assert.deepEqual(result.user.roles, ["student"]);
    assert.equal(result.session.mfa.mfaRequired, true);
    assert.equal(result.session.token, "session-token");
  });

  void it("rejects an unverified email before login", async () => {
    let reachedLogin = false;
    const service = createService(() => {
      reachedLogin = true;
    });

    await assert.rejects(
      () =>
        service.loginWithGoogleCredential("credential", request, async () =>
          googleIdTokenToProfile(
            { ...verifiedClaims, email_verified: false },
            CLIENT_ID,
          ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "OAUTH_VERIFICATION_FAILED");
        assert.match(error.message, /not verified/);
        return true;
      },
    );
    assert.equal(reachedLogin, false);
  });

  void it("rejects a token for the wrong audience before login", async () => {
    let reachedLogin = false;
    const service = createService(() => {
      reachedLogin = true;
    });

    await assert.rejects(
      () =>
        service.loginWithGoogleCredential("credential", request, async () =>
          googleIdTokenToProfile(
            {
              ...verifiedClaims,
              aud: "other-client.apps.googleusercontent.com",
            },
            CLIENT_ID,
          ),
        ),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "OAUTH_VERIFICATION_FAILED");
        assert.match(error.message, /audience is invalid/);
        return true;
      },
    );
    assert.equal(reachedLogin, false);
  });
});
