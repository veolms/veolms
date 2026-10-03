import { useState } from "react";
import { cancelGoogleOneTap } from "./GoogleOneTap";
import { GitHubBrandIcon, GoogleBrandIcon } from "./SocialBrandIcons";
import {
  OAUTH_PROVIDER_STORAGE_KEY,
  OAUTH_RETURN_TO_STORAGE_KEY,
  clearOauthHandoff,
} from "./oauthFlow";
import { useOauthUrl } from "../services/auth";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";

interface SocialLoginActionsProps {
  onError?: (message: string) => void;
  oneTapPending?: boolean;
  returnTo?: string | null;
}

export function SocialLoginActions({
  onError,
  oneTapPending = false,
  returnTo,
}: SocialLoginActionsProps) {
  const [loadingProvider, setLoadingProvider] = useState<"google" | "github" | null>(null);
  const oauthUrlMutation = useOauthUrl();

  const googleBusy = oneTapPending || loadingProvider === "google";
  const actionsLocked = oneTapPending || loadingProvider !== null;

  const handleOauth = async (provider: "google" | "github") => {
    if (actionsLocked) return;
    cancelGoogleOneTap();
    setLoadingProvider(provider);

    try {
      sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, provider);
      if (returnTo) {
        sessionStorage.setItem(OAUTH_RETURN_TO_STORAGE_KEY, returnTo);
      } else {
        sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
      }
      const redirectUri = `${window.location.origin}/auth/callback`;
      const response = await oauthUrlMutation.mutateAsync({
        provider,
        redirectUri,
      });

      if (!response.url) {
        throw new Error("The OAuth provider did not return a login URL.");
      }

      window.location.href = response.url;
    } catch (err: unknown) {
      clearOauthHandoff();
      setLoadingProvider(null);
      const errorObj = err as { message?: string };
      const message = errorObj?.message || "Unable to initialize social login. Please try again.";
      onError?.(message);
    }
  };

  return (
    <div className="auth-social">
      <p className="auth-social__divider">
        <span>OR</span>
      </p>

      {oneTapPending ? (
        <p className="auth-form__pending" role="status">
          Verifying your Google account…
        </p>
      ) : null}

      <div className="auth-social__actions">
        <button
          aria-busy={googleBusy}
          aria-label={googleBusy ? "Verifying Google sign-in" : undefined}
          className="auth-social__button"
          disabled={actionsLocked}
          onClick={() => handleOauth("google")}
          type="button"
        >
          <GoogleBrandIcon size={18} />
          {googleBusy ? (
            <>
              <LoadingSpinnerIcon size={18} />
              Verifying…
            </>
          ) : (
            "Continue with Google"
          )}
        </button>

        <button
          aria-busy={loadingProvider === "github"}
          aria-label={loadingProvider === "github" ? "Connecting to GitHub" : undefined}
          className="auth-social__button"
          disabled={actionsLocked}
          onClick={() => handleOauth("github")}
          type="button"
        >
          <GitHubBrandIcon size={18} />
          {loadingProvider === "github" ? <LoadingSpinnerIcon size={18} /> : "Continue with GitHub"}
        </button>
      </div>
    </div>
  );
}
