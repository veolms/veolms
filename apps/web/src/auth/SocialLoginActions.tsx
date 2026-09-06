import { useState } from "react";
import { GitHubBrandIcon, GoogleBrandIcon } from "./SocialBrandIcons";
import {
  OAUTH_PROVIDER_STORAGE_KEY,
  OAUTH_RETURN_TO_STORAGE_KEY,
  clearOauthHandoff,
} from "./oauthFlow";
import { useOauthUrl } from "../services/auth";

interface SocialLoginActionsProps {
  onError?: (message: string) => void;
  returnTo?: string | null;
}

export function SocialLoginActions({
  onError,
  returnTo,
}: SocialLoginActionsProps) {
  const [loadingProvider, setLoadingProvider] = useState<
    "google" | "github" | null
  >(null);
  const oauthUrlMutation = useOauthUrl();

  const handleOauth = async (provider: "google" | "github") => {
    if (loadingProvider !== null) return;
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
      const message =
        errorObj?.message ||
        "Unable to initialize social login. Please try again.";
      onError?.(message);
    }
  };

  return (
    <div className="auth-social">
      <p className="auth-social__divider">
        <span>OR</span>
      </p>

      <div className="auth-social__actions">
        <button
          className="auth-social__button"
          disabled={loadingProvider !== null}
          onClick={() => handleOauth("google")}
          type="button"
        >
          <GoogleBrandIcon size={18} />
          {loadingProvider === "google"
            ? "Connecting..."
            : "Continue with Google"}
        </button>

        <button
          className="auth-social__button"
          disabled={loadingProvider !== null}
          onClick={() => handleOauth("github")}
          type="button"
        >
          <GitHubBrandIcon size={18} />
          {loadingProvider === "github"
            ? "Connecting..."
            : "Continue with GitHub"}
        </button>
      </div>
    </div>
  );
}
