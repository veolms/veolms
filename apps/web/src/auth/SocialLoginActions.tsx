import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { AuthConfigResponse } from "@veolms/contracts";
import { cancelGoogleOneTap, toOneTapErrorMessage } from "./GoogleOneTap";
import { GitHubBrandIcon } from "./SocialBrandIcons";
import { GoogleAccountButton, GoogleSignInButton } from "./GoogleSignInButton";
import {
  rememberGoogleSignIn,
  useLastGoogleAccount,
} from "./lastGoogleAccount";
import {
  clearOauthHandoff,
  clearOauthRedirectResult,
  peekOauthRedirectResult,
  rememberOauthDialogPage,
  rememberOauthHandoff,
} from "./oauthFlow";
import { useGoogleSilentSignInCheck } from "./googleSilentSignIn";
import { rememberLoginDialogSnapshot } from "./loginDialogSnapshot";
import {
  askOauthProviderSilently,
  listenForOauthPopup,
  openOauthPopup,
} from "./oauthPopup";
import { resolvePostAuthPath } from "./postAuthNavigation";
import {
  authKeys,
  authService,
  useGoogleOneTapLogin,
  useOauthLogin,
  useOauthUrl,
} from "../services/auth";
import type { ApiError } from "../lib/api-client";
import {
  useNativeGoogleSignIn,
  type GoogleSignInMode,
  type NativeGoogleSignIn,
} from "../native-bridge";
import { authStore } from "../store/auth.store";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { LoginFieldError } from "./LoginCardParts";

/**
 * How long a press on the Google button waits for the pop-up's own question
 * to Google (see useGoogleSilentSignInCheck) when it has not been answered
 * yet, before it opens Google's window anyway.
 */
const SILENT_CHECK_WAIT_MS = 1500;

/** The id of the message under the buttons, which they point to. */
const SOCIAL_ERROR_ID = "auth-social-error";

/**
 * What a failed social sign-in says. The API refuses to send the visitor
 * back to an origin it does not know (a LAN address, say): that one says
 * what to do instead.
 */
function toSocialErrorMessage(
  providerName: string,
  err: unknown,
  fallback: string,
): string {
  const errorObj = err as { code?: string; message?: string } | null;
  if (errorObj?.code === "INVALID_REDIRECT_URI") {
    return `${providerName} sign-in isn't available on this address. Use your email below, or open the site at its usual address.`;
  }
  return errorObj?.message || fallback;
}

/** GitHub sign-in is hidden for the time being; everything else of it stays. */
const SHOW_GITHUB_SIGN_IN = false;

/**
 * Adds Google's own options to the address the API gives for its sign-in:
 * the account to sign in with, or that Google is to show its chooser.
 */
function withGoogleOptions(
  url: string,
  options: { loginHint?: string; chooseAccount?: boolean },
): string {
  const address = new URL(url);
  if (options.loginHint) {
    address.searchParams.set("login_hint", options.loginHint);
  }
  if (options.chooseAccount)
    address.searchParams.set("prompt", "select_account");
  return address.toString();
}

interface OauthOptions {
  /** The arrow on the account's button: Google's chooser, no hint. */
  chooseAccount?: boolean;
}

interface SocialLoginActionsProps {
  /** A Google (or other social) sign-in failure, shown under the buttons. */
  errorMessage?: string | null;
  onError?: (message: string | null) => void;
  oneTapPending?: boolean;
  returnTo?: string | null;
}

export function SocialLoginActions({
  errorMessage,
  onError,
  oneTapPending = false,
  returnTo,
}: SocialLoginActionsProps) {
  // Back from the provider after a full-tab sign-in (its window was
  // blocked): the answer waits for this pop-up, which opens already saying
  // it is signing in, as it looked when the tab left.
  const [redirectReturn] = useState(peekOauthRedirectResult);
  const [loadingProvider, setLoadingProvider] = useState<
    "google" | "github" | null
  >(redirectReturn?.provider ?? null);
  // "popup": waiting on the provider's window; "leaving": the whole tab is
  // on its way to the provider (its window was blocked); "native": inside
  // the app, waiting on the phone's own Google account picker; "verifying":
  // its code (or Google's token) is being exchanged for a session here,
  // inside the login pop-up.
  const [popupStage, setPopupStage] = useState<
    "popup" | "leaving" | "native" | "verifying" | null
  >(redirectReturn ? "verifying" : null);
  const redirectReturnStartedRef = useRef(false);
  const oauthUrlMutation = useOauthUrl();
  const oauthLoginMutation = useOauthLogin();
  const oneTapLoginMutation = useGoogleOneTapLogin();
  const queryClient = useQueryClient();
  // The phone's own Google account picker, inside an app build that has it;
  // null in every browser, where Google's button works as it always has.
  const nativeGoogleSignIn = useNativeGoogleSignIn();
  const navigate = useNavigate();
  const stopListeningRef = useRef<(() => void) | null>(null);
  // Whether Google would sign the visitor in without asking anything; asked
  // as the pop-up opens.
  // The Google account this browser last used, offered by name; the check
  // asks Google about that account.
  const { account: lastGoogleAccount, lastUsed: googleLastUsed } =
    useLastGoogleAccount();
  const googleSilentCheckRef = useGoogleSilentSignInCheck(
    !redirectReturn,
    lastGoogleAccount?.email,
  );

  // Whether the buttons are still on screen. When the login dialog has gone
  // by the time the phone's Google picker answers, its token is not sent, no
  // browser sign-in opens and no error is shown. Set again on every mount:
  // StrictMode runs this cleanup once before the real mount.
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopListeningRef.current?.();
    };
  }, []);

  const reset = (options?: { keepSharedCopy?: boolean }) => {
    clearOauthHandoff(options);
    setLoadingProvider(null);
    setPopupStage(null);
  };

  const fail = (
    provider: "google" | "github",
    err: unknown,
    fallback: string,
  ) => {
    reset();
    onError?.(
      toSocialErrorMessage(
        provider === "google" ? "Google" : "GitHub",
        err,
        fallback,
      ),
    );
  };

  const finishFromPopup = async (
    provider: "google" | "github",
    params: URLSearchParams,
    redirectUri: string,
  ) => {
    const code = params.get("code") ?? params.get("token");
    const error = params.get("error");
    if (error || !code) {
      // Closing Google's window or pressing Cancel there is not a failure
      // worth a message; anything else is.
      if (error === "access_denied") {
        reset();
        return;
      }
      fail(
        provider,
        null,
        params.get("error_description") ||
          "Authentication was cancelled or failed.",
      );
      return;
    }

    setPopupStage("verifying");
    try {
      const response = await oauthLoginMutation.mutateAsync({
        provider,
        code,
        state: params.get("state") ?? undefined,
        redirectUri,
      });
      clearOauthHandoff();
      if (provider === "google") rememberGoogleSignIn(response.user);
      authStore.setUser(response.user);
      navigate(resolvePostAuthPath(response, returnTo), { replace: true });
    } catch (err: unknown) {
      fail(provider, err, "Authentication failed. Please try again.");
    }
  };

  useEffect(() => {
    if (!redirectReturn || redirectReturnStartedRef.current) return;
    redirectReturnStartedRef.current = true;
    clearOauthRedirectResult();
    void finishFromPopup(
      redirectReturn.provider,
      redirectReturn.params,
      `${window.location.origin}/auth/callback`,
    );
    // Once, on opening; the handlers are this render's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const googleBusy = oneTapPending || loadingProvider === "google";
  const actionsLocked =
    oneTapPending || (loadingProvider !== null && popupStage !== "popup");

  /**
   * Carries on in the provider's window, or in the whole tab when the
   * window was blocked.
   */
  const continueInWindow = (
    provider: "google" | "github",
    popup: Window | null,
    url: string,
    redirectUri: string,
  ) => {
    if (!popup || popup.closed) {
      // The pop-up is shown now as it will be on the way back, and a copy
      // of it is kept so the page can put it up from its first frame (see
      // loginDialogSnapshot).
      flushSync(() => setPopupStage("verifying"));
      rememberOauthDialogPage();
      rememberLoginDialogSnapshot();
      // Nothing is being verified yet: until the tab leaves, it says so.
      flushSync(() => setPopupStage("leaving"));
      window.location.href = url;
      return;
    }

    popup.location.href = url;
    stopListeningRef.current = listenForOauthPopup(popup, (outcome) => {
      if (outcome.kind === "result") {
        stopListeningRef.current = null;
        void finishFromPopup(provider, outcome.params, redirectUri);
        return;
      }
      // Closed without an answer: the buttons work again. The listener
      // stays, in case the answer is still on its way. The shared copy
      // stays too: on Android the window also closes when Chrome hands the
      // answer to the installed app, which reads it (see oauthFlow).
      reset({ keepSharedCopy: true });
    });
  };

  const handleOauth = (
    provider: "google" | "github",
    options: OauthOptions = {},
  ) => {
    if (actionsLocked) return;
    if (provider === "google" && nativeGoogleSignIn) {
      void signInWithGoogleInApp(nativeGoogleSignIn, options);
      return;
    }
    void signInInWindow(provider, options);
  };

  /**
   * Inside an app build that has it: the phone's own Google account picker,
   * whose token signs in as Google One Tap does. Whenever the app cannot do
   * it, the sign-in carries on as in a browser (the app opens it for the
   * person).
   *
   * "Continue as [name]" first asks with `AUTO`: with an account that signed
   * in here before, Google signs in without a tap, or (right after a
   * sign-out) asks with one Continue button. When AUTO has no account to
   * offer, the full picker follows at once, with the same nonce. "Continue
   * with Google" and the arrow (another account) open the full picker only:
   * only it offers adding an account. The picker takes no account hint.
   */
  const signInWithGoogleInApp = async (
    native: NativeGoogleSignIn,
    options: OauthOptions,
  ) => {
    cancelGoogleOneTap();
    onError?.(null);
    stopListeningRef.current?.();
    stopListeningRef.current = null;
    setLoadingProvider("google");
    setPopupStage("native");
    const stop = () => {
      setLoadingProvider(null);
      setPopupStage(null);
    };
    const inWindow = () => {
      stop();
      return signInInWindow("google", options);
    };

    let clientId: string;
    try {
      // From the cache when the page already has it; otherwise fetched once
      // and kept there, sharing a fetch already on its way.
      const config = await queryClient.ensureQueryData<AuthConfigResponse>({
        queryKey: authKeys.config(),
        queryFn: () => authService.getAuthConfig(),
      });
      clientId = config.googleClientId ?? "";
      if (!clientId || !(await native.isSupported(clientId))) {
        return inWindow();
      }
    } catch {
      return inWindow();
    }

    let mode: GoogleSignInMode =
      lastGoogleAccount && !options.chooseAccount ? "AUTO" : "BUTTON";
    // A nonce that has expired or was used meanwhile is replaced once, and
    // asked for again in the same mode. The loop always ends: the nonce is
    // replaced once at most, and AUTO steps to the full picker once at most.
    let nonceReplaced = false;
    for (;;) {
      let nonce: string;
      try {
        // The nonce is kept until a login request uses it, so AUTO and the
        // full picker after it share one.
        ({ nonce } = await authService.getGoogleOneTapNonce());
      } catch {
        return inWindow();
      }

      const outcome = await native.signIn(clientId, nonce, mode);
      // The dialog went while Google was asked: nothing more to do here.
      if (!mountedRef.current) return;
      if (outcome.kind === "fallback") return inWindow();
      if (outcome.kind === "noAccount" && mode === "AUTO") {
        // Still "Waiting for Google…": no flicker between the two.
        mode = "BUTTON";
        continue;
      }
      if (outcome.kind !== "token") {
        stop();
        return;
      }

      setPopupStage("verifying");
      try {
        const result = await oneTapLoginMutation.mutateAsync({
          credential: outcome.idToken,
        });
        // Not checked against the dialog: signing in can close it before this
        // runs, and the page must still go on (to the two-step step, say), as
        // after the pop-up and One Tap.
        rememberGoogleSignIn(result.user);
        navigate(resolvePostAuthPath(result, returnTo), { replace: true });
        return;
      } catch (err: unknown) {
        if (!mountedRef.current) return;
        const error = err as ApiError;
        if (error?.code === "ONE_TAP_NONCE_INVALID" && !nonceReplaced) {
          nonceReplaced = true;
          authService.clearGoogleOneTapNonce();
          setPopupStage("native");
          continue;
        }
        stop();
        onError?.(toOneTapErrorMessage(error));
        return;
      }
    }
  };

  const signInInWindow = async (
    provider: "google" | "github",
    { chooseAccount = false }: OauthOptions,
  ) => {
    cancelGoogleOneTap();
    onError?.(null);
    stopListeningRef.current?.();
    stopListeningRef.current = null;
    setLoadingProvider(provider);

    // Written before the window opens: it starts with a copy of this tab's
    // session storage, which it needs if it has to finish signing in itself.
    rememberOauthHandoff(provider, returnTo);
    const redirectUri = `${window.location.origin}/auth/callback`;
    const providerName = provider === "google" ? "Google" : "GitHub";
    const googleOptions =
      provider === "google"
        ? chooseAccount
          ? { chooseAccount: true }
          : { loginHint: lastGoogleAccount?.email }
        : {};

    // When Google would sign the visitor in without asking anything (one
    // account that has agreed before), a window opened here only flashed
    // open and shut. Then the sign-in runs in a hidden frame instead, and a
    // window opens only if Google asks for the visitor after all.
    const silentCheck =
      provider === "google" && !chooseAccount
        ? googleSilentCheckRef.current
        : null;
    if (silentCheck && silentCheck.settled !== false) {
      try {
        const silent =
          silentCheck.settled ??
          (await Promise.race([
            silentCheck.answer,
            new Promise<boolean>((resolve) =>
              window.setTimeout(() => resolve(false), SILENT_CHECK_WAIT_MS),
            ),
          ]));
        if (silent) {
          setPopupStage("verifying");
          const response = await oauthUrlMutation.mutateAsync({
            provider,
            redirectUri,
          });
          if (!response.url) {
            throw new Error("The OAuth provider did not return a login URL.");
          }
          const url = withGoogleOptions(response.url, googleOptions);
          const answer = await askOauthProviderSilently(url);
          if (answer?.has("code")) {
            await finishFromPopup(provider, answer, redirectUri);
            return;
          }
          // Google wants the visitor after all (signed out since, or a
          // second account). The window opens now, after the wait; should
          // the browser block it for that, the whole tab goes instead.
          silentCheck.markNeedsVisitor();
          const popup = openOauthPopup(providerName);
          setPopupStage(popup ? "popup" : null);
          continueInWindow(provider, popup, url, redirectUri);
          return;
        }
      } catch (err: unknown) {
        fail(
          provider,
          err,
          "Unable to initialize social login. Please try again.",
        );
        return;
      }
    }

    // Opened now, in the click, or the browser blocks it. When it is
    // blocked anyway the whole tab goes to the provider, as it used to.
    const popup = openOauthPopup(providerName);
    if (popup) setPopupStage("popup");

    try {
      const response = await oauthUrlMutation.mutateAsync({
        provider,
        redirectUri,
      });

      if (!response.url) {
        throw new Error("The OAuth provider did not return a login URL.");
      }

      continueInWindow(
        provider,
        popup,
        provider === "google"
          ? withGoogleOptions(response.url, googleOptions)
          : response.url,
        redirectUri,
      );
    } catch (err: unknown) {
      popup?.close();
      fail(
        provider,
        err,
        "Unable to initialize social login. Please try again.",
      );
    }
  };

  const providerLabel = loadingProvider === "github" ? "GitHub" : "Google";
  const googleBusyLabel = googleBusy
    ? popupStage === "popup" || popupStage === "native"
      ? "Waiting for Google…"
      : popupStage === "leaving"
        ? "Opening Google…"
        : "Verifying…"
    : null;
  const pendingMessage = oneTapPending
    ? "Verifying your Google account…"
    : popupStage === "popup"
      ? `Finish signing in with ${providerLabel} in the window that opened.`
      : popupStage === "native"
        ? "Choose your Google account."
        : popupStage === "leaving"
          ? `Opening ${providerLabel}…`
          : popupStage === "verifying"
            ? "Signing you in…"
            : null;

  return (
    // The way in the pop-up leads with; the email form follows it under an
    // "or" (see LoginView).
    <div className="flex w-full flex-col">
      {/* Said to screen readers only: the Google button itself shows that
          it is verifying, and a line of its own here made the pop-up grow
          and jump as the sign-in started. Always in the page, so a change
          of its words is announced. */}
      <p className="sr-only" role="status">
        {pendingMessage ?? ""}
      </p>

      <div className="flex w-full flex-col gap-3">
        {lastGoogleAccount ? (
          <GoogleAccountButton
            account={lastGoogleAccount}
            busyLabel={googleBusyLabel}
            describedBy={errorMessage ? SOCIAL_ERROR_ID : undefined}
            disabled={actionsLocked}
            lastUsed={googleLastUsed}
            onChooseAccount={() =>
              handleOauth("google", { chooseAccount: true })
            }
            onContinue={() => handleOauth("google")}
          />
        ) : (
          <GoogleSignInButton
            busyLabel={googleBusyLabel}
            describedBy={errorMessage ? SOCIAL_ERROR_ID : undefined}
            disabled={actionsLocked}
            onClick={() => handleOauth("google")}
          />
        )}

        {/* Off for now (see SHOW_GITHUB_SIGN_IN); the sign-in itself still
            works and the API keeps its GitHub routes. */}
        {SHOW_GITHUB_SIGN_IN ? (
          <button
            aria-busy={loadingProvider === "github"}
            aria-describedby={errorMessage ? SOCIAL_ERROR_ID : undefined}
            aria-label={
              loadingProvider === "github" ? "Connecting to GitHub" : undefined
            }
            className="auth-social__button"
            disabled={actionsLocked}
            onClick={() => handleOauth("github")}
            type="button"
          >
            <GitHubBrandIcon size={18} />
            {loadingProvider === "github" ? (
              <LoadingSpinnerIcon size={18} />
            ) : (
              "Continue with GitHub"
            )}
          </button>
        ) : null}

        {errorMessage ? (
          <LoginFieldError id={SOCIAL_ERROR_ID}>{errorMessage}</LoginFieldError>
        ) : null}
      </div>
    </div>
  );
}
