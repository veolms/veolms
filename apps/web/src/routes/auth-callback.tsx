import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AuthBrandMark } from "../auth/AuthBrandPanel";
import { AUTH_CARD_HEADING_ID } from "../auth/authFlow";
import { getAuthRouteMeta, productName } from "../routing/routeDescriptors";
import { useOauthLogin } from "../services/auth";
import { authStore } from "../store/auth.store";

export function meta() {
  return Object.entries(
    getAuthRouteMeta(
      "Authenticating",
      `Completing authentication with ${productName}.`,
    ),
  ).map(([name, content]) =>
    name === "title" ? { title: content } : { name, content },
  );
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

    const code = searchParams.get("code");
    const state = searchParams.get("state") ?? undefined;
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      setErrorMessage(errorDescription || "Authentication was cancelled or failed.");
      return;
    }

    if (!code) {
      setErrorMessage("No authorization code was returned. Please try again.");
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;
    const storedProvider = sessionStorage.getItem("veolms_oauth_provider") as "google" | "github" | null;
    const isGithub = searchParams.get("iss")?.includes("github") || storedProvider === "github";
    const provider: "google" | "github" = isGithub ? "github" : (storedProvider ?? "google");

    oauthLoginMutation
      .mutateAsync({
        provider,
        code,
        state,
        redirectUri,
      })
      .then((response) => {
        authStore.setUser(response.user);
        navigate("/settings/profile", { replace: true });
      })
      .catch((err: unknown) => {
        const errorObj = err as { message?: string };
        const message = errorObj?.message || "Authentication failed. Please try again.";
        setErrorMessage(message);
      });
  }, [searchParams, navigate, oauthLoginMutation]);

  return (
    <section aria-labelledby={AUTH_CARD_HEADING_ID} className="auth-card">
      <AuthBrandMark />
      <h1 className="auth-card__heading" id={AUTH_CARD_HEADING_ID}>
        {errorMessage ? "Authentication Failed" : "Signing in..."}
      </h1>
      <p className="auth-card__subheading">
        {errorMessage
          ? errorMessage
          : "Please wait while we verify your credentials."}
      </p>

      {!errorMessage ? (
        <div
          className="auth-card__form-slot"
          style={{
            marginTop: "1.5rem",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            padding: "16px",
            borderRadius: "10px",
            background: "color-mix(in srgb, var(--canvas) 60%, var(--surface))",
            border: "1px solid var(--auth-line)",
          }}
        >
          <div
            className="auth-mfa-setup__spinner"
            style={{
              width: "20px",
              height: "20px",
              border: "2px solid var(--auth-line)",
              borderTopColor: "var(--accent)",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
            Verifying account and establishing secure session…
          </span>
        </div>
      ) : (
        <div className="auth-card__form-slot" style={{ marginTop: "1.5rem" }}>
          <button
            className="auth-form__submit"
            onClick={() => navigate("/login", { replace: true })}
            type="button"
          >
            <span className="auth-form__submit-label">Back to Login</span>
          </button>
        </div>
      )}
    </section>
  );
}
