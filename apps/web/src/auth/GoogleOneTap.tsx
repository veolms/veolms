import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { ApiError } from "../lib/api-client";
import { useAuthConfig, useCurrentUser, useGoogleOneTapLogin } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { normalizeAppPath, sanitizeReturnTo } from "../routing/routeAccess";
import { resolvePostAuthPath } from "./postAuthNavigation";
import { ToastNotification } from "../ToastNotification";

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

export function cancelGoogleOneTap(): void {
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
        googleIdentity.prompt();
      })
      .catch(() => {
        // The existing Google button remains the fallback.
      });

    return () => {
      active = false;
      cancelGoogleOneTap();
    };
  }, [clientId]);

  return null;
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

  const clientId = authConfig?.googleClientId || "";
  const normalizedPath = normalizeAppPath(location.pathname);

  const isUserAuthenticated = isAuthenticated || Boolean(user);
  const isExcludedRoute = EXCLUDED_ONE_TAP_PATHS.has(normalizedPath);
  const shouldPrompt = !isUserAuthenticated && !isExcludedRoute && (!isLoading || isFetched);

  // Compute return target
  let returnTo: string | null = null;
  if (normalizedPath === "/login") {
    const searchParams = new URLSearchParams(location.search);
    returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  } else {
    returnTo = sanitizeReturnTo(`${location.pathname}${location.search}`) || location.pathname;
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

            loginRef.current(
              { credential: response.credential },
              {
                onSuccess: (result) => {
                  navigateRef.current(
                    resolvePostAuthPath(result, returnToRef.current),
                    { replace: true },
                  );
                },
                onError: (error) => {
                  setErrorMessage(toOneTapErrorMessage(error));
                },
              },
            );
          },
        });
        googleIdentity.prompt();
      })
      .catch(() => {
        // Fallback gracefully
      });

    return () => {
      active = false;
      cancelGoogleOneTap();
    };
  }, [shouldPrompt, clientId, normalizedPath]);

  return (
    <>
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

