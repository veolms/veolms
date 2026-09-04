import { fireEvent, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SecuritySettings } from "../../src/settings/SecuritySettings.tsx";
import { renderWithAppProviders } from "./test-utils.tsx";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36";

const authState = {
  totpEnabled: false,
  passkeyEnabled: false,
  userLoading: false,
};

vi.mock("../../src/auth/webauthn", () => ({
  isPasskeySupported: () => true,
  startPasskeyRegistration: vi.fn(),
}));

vi.mock("../../src/services/auth", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/auth")
  >("../../src/services/auth");

  return {
    ...actual,
    useCurrentUser: () => ({
      data: authState.userLoading
        ? undefined
        : {
            totpEnabled: authState.totpEnabled,
            passkeyEnabled: authState.passkeyEnabled,
          },
      isLoading: authState.userLoading,
    }),
    useSessions: () => ({
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          ipAddress: "127.0.0.1",
          userAgent: CHROME_WINDOWS,
          isCurrent: true,
          lastUsedAt: new Date().toISOString(),
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          ipAddress: "127.0.0.1",
          userAgent: CHROME_WINDOWS,
          isCurrent: false,
          lastUsedAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    }),
    useRevokeSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useRevokeAllOtherSessions: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useSetupTotp: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useEnableTotp: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePasskeyRegisterOptions: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    usePasskeyRegisterVerify: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
  };
});

describe("security settings layout", () => {
  beforeEach(() => {
    authState.totpEnabled = false;
    authState.passkeyEnabled = false;
    authState.userLoading = false;
  });

  it("uses settings rows for first-time MFA instead of the auth card", () => {
    renderWithAppProviders(<SecuritySettings />);

    expect(
      screen.getByRole("heading", { name: "Secure your account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Register passkey" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.queryByText("ProCodrr")).not.toBeInTheDocument();
    expect(screen.queryByText(/before you continue/i)).not.toBeInTheDocument();
  });

  it("shows a short device label instead of the raw user agent", () => {
    renderWithAppProviders(<SecuritySettings />);

    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getAllByText("Chrome on Windows")).toHaveLength(1);
    expect(screen.queryByText(CHROME_WINDOWS)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out all other devices" }),
    ).toBeInTheDocument();
  });

  it("opens the authenticator modal on the document body so it can center", () => {
    renderWithAppProviders(<SecuritySettings />);

    fireEvent.click(screen.getByRole("button", { name: "Set up" }));

    const dialog = screen.getByRole("dialog", { name: "Set up authenticator" });
    expect(dialog.parentElement).toBe(document.body);
  });

  it("disables account-security actions while signed out", () => {
    renderWithAppProviders(<SecuritySettings isAuthenticated={false} />);

    expect(
      screen.getByRole("button", { name: "Register passkey" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Set up" })).toBeDisabled();
    expect(screen.queryByText("This device")).not.toBeInTheDocument();
    expect(
      screen.getByText("Sign in to manage active sessions."),
    ).toBeInTheDocument();
  });
});
