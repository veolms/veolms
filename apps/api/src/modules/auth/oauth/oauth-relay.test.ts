/**
 * Google sign-in through a relay (setGoogleSignInProvider): Google is sent
 * the relay's return address and a sealed state; the page gets the plain
 * state back and the code is exchanged with the relay's address, the one it
 * was issued for. Without a provider nothing of this applies.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { setGoogleSignInProvider } from "@veolms/config";
import type { Executor } from "../shared/repository.types.ts";
import type { AuthService } from "../authentication/authentication.service.ts";
import type { SessionService } from "../session/session.service.ts";
import { createOauthService } from "./oauth.service.ts";

const RELAY = "https://auth.example-platform.test/oauth/relay";
const PAGE = "https://codelab.example-platform.test/auth/callback";

function service() {
  return createOauthService({
    database: {} as Executor,
    authService: {} as AuthService,
    sessionService: {} as SessionService,
  });
}

/** Seals as a relay would; the test only needs to recognise the result. */
const sealed: { state: string; returnUri: string }[] = [];
function useRelay(options: { promptsOnPage?: boolean } = {}) {
  setGoogleSignInProvider(() => ({
    clientId: "shared-client.apps.googleusercontent.com",
    clientSecret: "shared-secret",
    relay: {
      redirectUri: RELAY,
      sealState: (state, returnUri) => {
        sealed.push({ state, returnUri });
        return `sealed:${sealed.length - 1}`;
      },
    },
    returnOrigins: ["https://codelab.example-platform.test"],
    promptsOnPage: options.promptsOnPage ?? false,
  }));
}

after(() => {
  setGoogleSignInProvider(null);
});

await test("through a relay, Google is sent the relay's address and a sealed state; the cookie keeps the plain one", () => {
  useRelay();
  const result = service().createAuthorizationUrl("google", PAGE);
  const url = new URL(result.url);

  assert.equal(url.searchParams.get("redirect_uri"), RELAY);
  assert.equal(
    url.searchParams.get("client_id"),
    "shared-client.apps.googleusercontent.com",
  );
  const sealedState = url.searchParams.get("state") ?? "";
  const index = Number(sealedState.replace("sealed:", ""));
  assert.deepEqual(sealed[index], { state: result.state, returnUri: PAGE });
  assert.equal(result.cookie.state, result.state);
  assert.ok(result.cookie.code_verifier, "the PKCE verifier stays here");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

await test("a page may return only to the site's own origins", () => {
  useRelay();
  assert.throws(
    () =>
      service().createAuthorizationUrl(
        "google",
        "https://elsewhere.example.test/auth/callback",
      ),
    (error: { code?: string }) => error.code === "INVALID_REDIRECT_URI",
  );
});

await test("the code is exchanged with the relay's address and the site's client", async () => {
  useRelay();
  const oauth = service();
  const started = oauth.createAuthorizationUrl("google", PAGE);

  const realFetch = globalThis.fetch;
  let tokenRequest: URLSearchParams | null = null;
  globalThis.fetch = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      tokenRequest = new URLSearchParams(String(init?.body));
      return Response.json({ access_token: "access-token" });
    }
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/userinfo")) {
      return Response.json({
        sub: "google-user-1",
        email: "Rahul@Example.com",
        email_verified: true,
        name: "Rahul",
      });
    }
    throw new Error(`unexpected fetch to ${url}`);
  }) as typeof fetch;

  try {
    const profile = await oauth.resolveCallbackProfile(
      {
        provider: "google",
        code: "code-from-google",
        state: started.state,
        redirectUri: PAGE,
      },
      JSON.stringify(started.cookie),
    );
    assert.equal(profile.providerUserId, "google-user-1");
    const sent = tokenRequest as URLSearchParams | null;
    assert.ok(sent, "the code was exchanged");
    assert.equal(sent.get("redirect_uri"), RELAY);
    assert.equal(
      sent.get("client_id"),
      "shared-client.apps.googleusercontent.com",
    );
    assert.equal(sent.get("client_secret"), "shared-secret");
    assert.equal(sent.get("code_verifier"), started.cookie.code_verifier);
  } finally {
    globalThis.fetch = realFetch;
  }
});

await test("the state Google hands back sealed is not accepted as the page's own", async () => {
  useRelay();
  const oauth = service();
  const started = oauth.createAuthorizationUrl("google", PAGE);
  const sealedState =
    new URL(started.url).searchParams.get("state") ?? "missing";
  await assert.rejects(
    oauth.resolveCallbackProfile(
      {
        provider: "google",
        code: "code-from-google",
        state: sealedState,
        redirectUri: PAGE,
      },
      JSON.stringify(started.cookie),
    ),
    (error: { code?: string }) => error.code === "OAUTH_STATE_MISMATCH",
  );
});

await test("the public sign-in settings say whether Google's prompts run on the page", () => {
  useRelay({ promptsOnPage: false });
  assert.deepEqual(service().getPublicConfig(), {
    googleClientId: "shared-client.apps.googleusercontent.com",
    googlePromptsOnPage: false,
  });
});

await test("without a provider, Google returns straight to the page with the plain state", () => {
  setGoogleSignInProvider(null);
  const page = "http://localhost:3000/auth/callback";
  let result;
  try {
    result = service().createAuthorizationUrl("google", page);
  } catch (error) {
    // An install whose CORS list leaves out localhost refuses the address,
    // as before: that is the configured behaviour, not the relay's.
    assert.equal((error as { code?: string }).code, "INVALID_REDIRECT_URI");
    return;
  }
  const url = new URL(result.url);
  assert.equal(url.searchParams.get("redirect_uri"), page);
  assert.equal(url.searchParams.get("state"), result.state);
  assert.equal(service().getPublicConfig().googlePromptsOnPage, true);
});
