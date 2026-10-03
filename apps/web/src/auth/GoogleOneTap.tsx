import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import type { ApiError } from "../lib/api-client";
import { useAuthConfig, useCurrentUser, useGoogleOneTapLogin } from "../services/auth";
import { useAuthStore } from "../store/auth.store";
import { normalizeAppPath, sanitizeReturnTo } from "../routing/routeAccess";
import { resolvePostAuthPath } from "./postAuthNavigation";
import { ToastNotification } from "../ToastNotification";
import { GoogleBrandIcon } from "./SocialBrandIcons";

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

function OneTapVerifyingOverlay() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs px-4 text-(--text) animate-in fade-in duration-200"
      role="status"
      aria-live="polite"
      aria-label="Signing in with Google"
    >
      <div className="relative flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-(--border-subtle) bg-(--surface) p-6 text-center shadow-(--surface-depth-shadow)">
        <div className="grid size-14 place-items-center rounded-2xl bg-(--surface-active) shadow-(--surface-depth-shadow)">
          <GoogleBrandIcon size={32} />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold tracking-tight text-(--text)">
            Signing you in with Google
          </p>
          <p className="text-xs leading-5 text-(--muted)">
            Verifying your account… please wait a moment.
          </p>
        </div>
        <div className="flex items-center gap-1.5 pt-1" aria-hidden="true">
          <span className="size-1.5 animate-pulse rounded-full bg-(--accent) motion-reduce:animate-none" />
          <span className="size-1.5 animate-pulse rounded-full bg-(--accent) [animation-delay:160ms] motion-reduce:animate-none" />
          <span className="size-1.5 animate-pulse rounded-full bg-(--accent) [animation-delay:320ms] motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );
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
  const [isVerifying, setIsVerifying] = useState(false);

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

            setIsVerifying(true);
            loginRef.current(
              { credential: response.credential },
              {
                onSuccess: (result) => {
                  setIsVerifying(false);
                  navigateRef.current(
                    resolvePostAuthPath(result, returnToRef.current),
                    { replace: true },
                  );
                },
                onError: (error) => {
                  setIsVerifying(false);
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
      {isVerifying ? <OneTapVerifyingOverlay /> : null}
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

