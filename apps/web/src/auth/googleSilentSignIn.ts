import { useEffect, useRef, type RefObject } from "react";
import { askOauthProviderSilently } from "./oauthPopup";
import { useAuthConfig } from "../services/auth";

// What the API's Google sign-in asks for (createAuthorizationUrl in
// apps/api/src/modules/auth/oauth/oauth.service.ts). The question below has
// to be the same one, or Google's answer to it can differ.
const GOOGLE_SIGN_IN_SCOPE = "openid profile email";

/**
 * Whether Google would sign the visitor in without showing them anything:
 * one Google account in this browser, and it has agreed to this app
 * before. Asked when the login pop-up opens, so that a press on its Google
 * button already knows whether a window is needed at all.
 *
 * Only the answer's kind is kept. The question is built here, without the
 * state the API keeps for a real sign-in, so the code Google sends back
 * cannot be used and is dropped; the button asks again for real.
 */
export async function canSignInWithGoogleSilently(
  clientId: string,
  signal?: AbortSignal,
  /** The account to ask about (see lastGoogleAccount); any, without one. */
  loginHint?: string,
): Promise<boolean> {
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(
    {
      client_id: clientId,
      redirect_uri: `${window.location.origin}/auth/callback`,
      response_type: "code",
      scope: GOOGLE_SIGN_IN_SCOPE,
      state: "silent-check",
      ...(loginHint ? { login_hint: loginHint } : {}),
    },
  ).toString()}`;
  const answer = await askOauthProviderSilently(url, signal);
  return answer?.has("code") ?? false;
}

export interface GoogleSilentSignInCheck {
  /** True or false once Google has answered; null while it has not. */
  settled: boolean | null;
  answer: Promise<boolean>;
  /** Google asked for the visitor after all: open its window next time. */
  markNeedsVisitor: () => void;
}

/**
 * Puts the question above to Google once the login pop-up is open (when
 * `enabled`), about `loginHint`'s account when there is one, and keeps the
 * answer for the Google button. Null until the
 * question has been asked; called off when the pop-up closes.
 */
export function useGoogleSilentSignInCheck(
  enabled: boolean,
  loginHint?: string,
): RefObject<GoogleSilentSignInCheck | null> {
  const { data: authConfig } = useAuthConfig();
  const clientId = authConfig?.googleClientId;
  const checkRef = useRef<GoogleSilentSignInCheck | null>(null);

  useEffect(() => {
    if (!enabled || !clientId) return undefined;
    const controller = new AbortController();
    const check: GoogleSilentSignInCheck = {
      settled: null,
      answer: Promise.resolve(false),
      markNeedsVisitor: () => {
        check.settled = false;
      },
    };
    check.answer = canSignInWithGoogleSilently(
      clientId,
      controller.signal,
      loginHint,
    ).then((silent) => {
      check.settled = silent;
      return silent;
    });
    checkRef.current = check;
    return () => {
      controller.abort();
      if (checkRef.current === check) checkRef.current = null;
    };
  }, [clientId, enabled, loginHint]);

  return checkRef;
}
