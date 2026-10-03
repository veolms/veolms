import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AuthProgress } from "../auth/AuthProgress";
import { AuthBrandMark } from "../auth/AuthBrandPanel";
import { AUTH_CARD_HEADING_ID } from "../auth/authFlow";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors";
import { resolvePostAuthPath } from "../auth/postAuthNavigation";
import {
  OAUTH_PROVIDER_STORAGE_KEY,
  OAUTH_RETURN_TO_STORAGE_KEY,
  clearOauthHandoff,
  isOauthProvider,
} from "../auth/oauthFlow";
import { useOauthLogin } from "../services/auth";
import { authStore } from "../store/auth.store";

export function meta() {
  return Object.entries(
    getAuthRouteMeta("Authenticating", `Completing authentication with ${productName}.`),
  ).map(([name, content]) => (name === "title" ? { title: content } : { name, content }));
}

export default function AuthCallbackRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oauthLoginMutation = useOauthLogin();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const executedRef = useRef(false);

  useEffect(() => {
    if (executedRef.current) return;
    executedRef.current = true;

    const code = searchParams.get("code") ?? searchParams.get("token");
    const state = searchParams.get("state") ?? undefined;
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      clearOauthHandoff();
      setErrorMessage(errorDescription || "Authentication was cancelled or failed.");
      return;
    }

    if (!code) {
      clearOauthHandoff();
      setErrorMessage("No authorization code was returned. Please try again.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;
    const storedProvider = sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY);
    if (!isOauthProvider(storedProvider)) {
      clearOauthHandoff();
      setErrorMessage("We could not identify the OAuth provider. Please restart sign-in.");
      return;
    }
    const returnTo = sessionStorage.getItem(OAUTH_RETURN_TO_STORAGE_KEY);

    // OAuth login is also the account-provisioning path. The API creates a
    // missing account or links an existing email account before returning the
    // authenticated session cookie.
    oauthLoginMutation
      .mutateAsync({
        provider: storedProvider,
        code,
        state,
        redirectUri,
      })
      .then((response) => {
        clearOauthHandoff();
        authStore.setUser(response.user);
        navigate(resolvePostAuthPath(response, returnTo), { replace: true });
      })
      .catch((err: unknown) => {
        clearOauthHandoff();
        const errorObj = err as { message?: string };
        const message = errorObj?.message || "Authentication failed. Please try again.";
        setErrorMessage(message);
      });
  }, [searchParams, navigate, oauthLoginMutation]);

  if (!errorMessage) {
    return (
      <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
        <AuthProgress
          detail="Verifying your account and opening a secure session."
          title="Signing you in"
        />
      </section>
    );
  }

  return (
    <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        Authentication Failed
      </h1>
      <p className="auth-card__subheading">{errorMessage}</p>

      <div className="auth-card__form-slot" style={{ marginTop: "1.5rem" }}>
        <button
          className="auth-form__submit"
          onClick={() => navigate("/login", { replace: true })}
          type="button"
        >
          <span className="auth-form__submit-label">Back to Login</span>
        </button>
      </div>
    </section>
  );
}
