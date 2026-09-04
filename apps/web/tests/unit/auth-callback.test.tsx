import { waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MFA_CHALLENGE_PATH,
  resolvePostAuthPath,
} from "../../src/auth/postAuthNavigation.ts";
import { APP_HOME_PATH } from "../../src/routing/routeAccess.ts";
import AuthCallbackRoute from "../../src/routes/auth-callback.tsx";
import { authStore } from "../../src/store/auth.store.ts";
import {
  OAUTH_PROVIDER_STORAGE_KEY,
  OAUTH_RETURN_TO_STORAGE_KEY,
} from "../../src/auth/oauthFlow.ts";
import { renderWithAppProviders } from "./test-utils.tsx";

const navigate = vi.fn();
const mutateAsync = vi.fn();

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useNavigate: () => navigate,
    useSearchParams: () => [new URLSearchParams("code=oauth-code&state=abc")],
  };
});

vi.mock("../../src/services/auth", () => ({
  useOauthLogin: () => ({
    mutateAsync,
  }),
}));

const loginUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "learner",
  displayName: "Anurag",
  email: "learner@procodrr.com",
  phoneNo: null,
};

describe("oauth callback", () => {
  beforeEach(() => {
    navigate.mockReset();
    mutateAsync.mockReset();
    authStore.clearAuth();
    sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, "google");
  });

  it("sends Google and GitHub straight to MFA when the session still needs it", async () => {
    mutateAsync.mockResolvedValue({
      user: loginUser,
      mfaRequired: true,
      mfaMandatory: false,
      totpEnabled: true,
      passkeyEnabled: true,
    });

    renderWithAppProviders(<AuthCallbackRoute />, ["/auth/callback"]);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(MFA_CHALLENGE_PATH, {
        replace: true,
      });
    });
    expect(authStore.getState().isAuthenticated).toBe(true);
    expect(navigate).not.toHaveBeenCalledWith(APP_HOME_PATH, {
      replace: true,
    });
  });

  it("opens the profile when OAuth login does not require MFA", async () => {
    mutateAsync.mockResolvedValue({
      user: loginUser,
      mfaRequired: false,
      mfaMandatory: false,
      totpEnabled: false,
      passkeyEnabled: false,
    });

    renderWithAppProviders(<AuthCallbackRoute />, ["/auth/callback"]);

    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith(APP_HOME_PATH, {
        replace: true,
      });
    });
  });

  it("uses the OAuth login callback to provision a new account", async () => {
    sessionStorage.setItem(OAUTH_RETURN_TO_STORAGE_KEY, "/learn/course/lesson");
    mutateAsync.mockResolvedValue({
      user: loginUser,
      mfaRequired: false,
      mfaMandatory: false,
      totpEnabled: false,
      passkeyEnabled: false,
    });

    renderWithAppProviders(<AuthCallbackRoute />, ["/auth/callback"]);

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        provider: "google",
        code: "oauth-code",
        state: "abc",
        redirectUri: `${window.location.origin}/auth/callback`,
      });
    });
    expect(navigate).toHaveBeenCalledWith("/learn/course/lesson", {
      replace: true,
    });
    expect(sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem(OAUTH_RETURN_TO_STORAGE_KEY)).toBeNull();
  });
});
