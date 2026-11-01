import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { ApiError } from "../lib/api-client";
import {
  useAuthConfig,
  useCurrentUser,
  useGoogleOneTapLogin,
} from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { normalizeAppPath, sanitizeReturnTo } from "../routing/routeAccess";
import { resolvePostAuthPath } from "./postAuthNavigation";
import { ToastNotification } from "../ToastNotification";
import { GoogleBrandIcon } from "./SocialBrandIcons";
import type { CredentialAccount } from "./OneTapSigningInCard";
import {
  readLastGoogleAccount,
  rememberGoogleSignIn,
} from "./lastGoogleAccount";

const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleIdentity {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
    use_fedcm_for_prompt: boolean;
    itp_support: boolean;
  }): void;
  prompt(): void;
  cancel(): void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleIdentity;
      };
    };
  }
}

let googleIdentityScript: Promise<void> | null = null;

// The Google Identity script is ~100KB of third-party JavaScript that is not
// needed for first paint or interaction. Waiting for an idle period keeps it
// from competing with route code and the LCP image during page load.
function scheduleIdleWork(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 4000 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 2000);
  return () => window.clearTimeout(handle);
}

const FIRST_INTERACTION_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
  "scroll",
] as const;

// On public pages the One Tap prompt waits for the first user gesture. A
// passive page load never runs it, which keeps Google's "Not signed in with
// the identity provider" console error (and the script's cost) out of visits
// that never engage; anyone actually using the page triggers it within
// moments. The login page keeps the idle schedule instead, since signing in
// is that page's purpose.
function scheduleAfterFirstInteraction(callback: () => void): () => void {
  const options: AddEventListenerOptions = { capture: true, passive: true };
  const cancel = () => {
    for (const eventName of FIRST_INTERACTION_EVENTS) {
      window.removeEventListener(eventName, handler, options);
    }
  };
  const handler = () => {
    cancel();
    callback();
  };
  for (const eventName of FIRST_INTERACTION_EVENTS) {
    window.addEventListener(eventName, handler, options);
  }
  return cancel;
}

function loadGoogleIdentityServices(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleIdentityScript) return googleIdentityScript;

  googleIdentityScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      googleIdentityScript = null;
      reject(new Error("Unable to load Google sign-in."));
    };
    document.head.appendChild(script);
  });

  return googleIdentityScript;
}

type SigningInModule = typeof import("./OneTapSigningInCard");
type SigningInCard = SigningInModule["OneTapSigningInCard"];

let signingInModule: Promise<SigningInModule> | null = null;

// The "Signing in…" card (or Android's sheet) is only needed once Google's
// prompt has been answered, so its code is fetched when the prompt goes up
// rather than with every page.
function loadSigningInModule(): Promise<SigningInModule> {
  signingInModule ??= import("./OneTapSigningInCard").catch((error) => {
    signingInModule = null;
    throw error;
  });
  return signingInModule;
}

const ONE_TAP_FAILED_MESSAGE = "Google sign-in failed. Please try again.";

// Token-verification failures carry internal detail ("audience is invalid"),
// so only pass through messages the user can act on.
function toOneTapErrorMessage(error: ApiError): string {
  if (error.status === 429) {
    return "Too many sign-in attempts. Please wait a minute and try again.";
  }
  if (error.code === "ACCOUNT_DEACTIVATED") return error.message;
  return ONE_TAP_FAILED_MESSAGE;
}

// Whether this tab has put a One Tap prompt up that has not been called off.
let oneTapPromptStarted = false;

/** Calls off a One Tap prompt this tab started. Does nothing otherwise. */
export function cancelGoogleOneTap(): void {
  if (!oneTapPromptStarted) return;
  oneTapPromptStarted = false;
  window.google?.accounts?.id?.cancel();
}

interface GoogleOneTapProps {
  onError?: (message: string) => void;
  onPendingChange?: (pending: boolean) => void;
  returnTo?: string | null;
}

export function GoogleOneTap({
  onError,
  onPendingChange,
  returnTo,
}: GoogleOneTapProps) {
  const navigate = useNavigate();
  const { data } = useAuthConfig();
  const login = useGoogleOneTapLogin();
  const clientId = data?.googleClientId || "";
  const onErrorRef = useRef(onError);
  const onPendingChangeRef = useRef(onPendingChange);
  const returnToRef = useRef(returnTo);
  const navigateRef = useRef(navigate);
  const loginRef = useRef(login.mutate);

  onErrorRef.current = onError;
  onPendingChangeRef.current = onPendingChange;
  returnToRef.current = returnTo;
  navigateRef.current = navigate;
  loginRef.current = login.mutate;

  useEffect(() => {
    if (!clientId) return;

    let active = true;

    const cancelIdleLoad = scheduleIdleWork(() => {
      void loadGoogleIdentityServices()
        .then(() => {
          const googleIdentity = window.google?.accounts?.id;
          if (!active || !googleIdentity) return;

          googleIdentity.initialize({
            client_id: clientId,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true,
            itp_support: true,
            callback: (response) => {
              if (!active || !response.credential) return;

              onPendingChangeRef.current?.(true);
              loginRef.current(
                { credential: response.credential },
                {
                  onSuccess: (result) => {
                    rememberGoogleSignIn(result.user);
                    navigateRef.current(
                      resolvePostAuthPath(result, returnToRef.current),
                      { replace: true },
                    );
                  },
                  onError: (error) => {
                    onPendingChangeRef.current?.(false);
                    onErrorRef.current?.(toOneTapErrorMessage(error));
                  },
                },
              );
            },
          });
          oneTapPromptStarted = true;
          googleIdentity.prompt();
        })
        .catch(() => {
          // The existing Google button remains the fallback.
        });
    });

    return () => {
      active = false;
      cancelIdleLoad();
      cancelGoogleOneTap();
    };
  }, [clientId]);

  return null;
}

/**
 * Who the credential Google handed over is for, read from its payload only
 * to say so while it is checked. Nothing here is trusted: the API verifies
 * the credential itself.
 */
function readCredentialAccount(credential: string): CredentialAccount {
  try {
    const part = credential.split(".")[1] ?? "";
    const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    const text = (value: unknown) =>
      typeof value === "string" ? value.trim() : "";
    const picture =
      typeof claims.picture === "string" && /^https:\/\//.test(claims.picture)
        ? claims.picture
        : undefined;
    return {
      // The whole name and the address, as the browser's card shows them.
      name: text(claims.name) || text(claims.given_name),
      email: text(claims.email),
      ...(picture ? { picture } : {}),
    };
  } catch {
    return { name: "", email: "" };
  }
}

const EXCLUDED_ONE_TAP_PATHS = new Set([
  "/mfa-setup",
  "/auth/callback",
  "/logout",
]);

/**
 * Global Google One Tap component.
 * Renders across all application pages when a user is not authenticated.
 * Handles credential exchange and MFA redirect.
 */
export function GlobalGoogleOneTap() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: user, isFetched, isLoading } = useCurrentUser();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { data: authConfig } = useAuthConfig();
  const login = useGoogleOneTapLogin();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // The account being checked after Google's prompt, while it is.
  const [verifyingAccount, setVerifyingAccount] =
    useState<CredentialAccount | null>(null);
  // The check is over: the card or sheet is on its way out.
  const [verifyingDone, setVerifyingDone] = useState(false);
  const [SigningInCard, setSigningInCard] = useState<SigningInCard | null>(
    null,
  );
  const handleSigningInLeft = useCallback(() => {
    setVerifyingAccount(null);
    setVerifyingDone(false);
  }, []);

  const clientId = authConfig?.googleClientId || "";
  const normalizedPath = normalizeAppPath(location.pathname);

  const isUserAuthenticated = isAuthenticated || Boolean(user);
  const isExcludedRoute = EXCLUDED_ONE_TAP_PATHS.has(normalizedPath);
  const shouldPrompt =
    !isUserAuthenticated && !isExcludedRoute && (!isLoading || isFetched);

  // Compute return target
  let returnTo: string | null = null;
  if (normalizedPath === "/login") {
    const searchParams = new URLSearchParams(location.search);
    returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  } else {
    returnTo =
      sanitizeReturnTo(`${location.pathname}${location.search}`) ||
      location.pathname;
  }

  const returnToRef = useRef(returnTo);
  returnToRef.current = returnTo;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const loginRef = useRef(login.mutate);
  loginRef.current = login.mutate;

  useEffect(() => {
    if (!shouldPrompt || !clientId) {
      cancelGoogleOneTap();
      return;
    }

    let active = true;

    const cancelScheduledLoad = scheduleAfterFirstInteraction(() => {
      void loadGoogleIdentityServices()
        .then(() => {
          const googleIdentity = window.google?.accounts?.id;
          if (!active || !googleIdentity) return;

          googleIdentity.initialize({
            client_id: clientId,
            auto_select: false,
            cancel_on_tap_outside: true,
            use_fedcm_for_prompt: true,
            itp_support: true,
            callback: (response) => {
              if (!active || !response.credential) return;

              setVerifyingDone(false);
              setVerifyingAccount(readCredentialAccount(response.credential));
              loginRef.current(
                { credential: response.credential },
                {
                  onSuccess: (result) => {
                    rememberGoogleSignIn(result.user);
                    setVerifyingDone(true);
                    navigateRef.current(
                      resolvePostAuthPath(result, returnToRef.current),
                      { replace: true },
                    );
                  },
                  onError: (error) => {
                    setVerifyingDone(true);
                    setErrorMessage(toOneTapErrorMessage(error));
                  },
                },
              );
            },
          });
          oneTapPromptStarted = true;
          googleIdentity.prompt();
          void loadSigningInModule()
            .then((module) => {
              if (!active) return;
              module.prepareOneTapSigningIn(readLastGoogleAccount()?.avatarUrl);
              setSigningInCard(() => module.OneTapSigningInCard);
            })
            .catch(() => {
              // Signing in still works, without the card.
            });
        })
        .catch(() => {
          // Fallback gracefully
        });
    });

    return () => {
      active = false;
      cancelScheduledLoad();
      cancelGoogleOneTap();
    };
    // Not the path: where the visitor is only matters through shouldPrompt
    // (excluded pages) and returnTo (read through a ref). With the path
    // listed, every navigation called the prompt off and put it up again,
    // and for a signed-in user asked Google to cancel a prompt that was
    // never shown.
  }, [shouldPrompt, clientId]);

  return (
    <>
      {verifyingAccount && SigningInCard ? (
        <SigningInCard
          account={verifyingAccount}
          leaving={verifyingDone}
          onLeft={handleSigningInLeft}
        />
      ) : null}
      {errorMessage ? (
        <ToastNotification
          message={errorMessage}
          type="error"
          onDismiss={() => setErrorMessage(null)}
        />
      ) : null}
    </>
  );
}
