import { screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MfaSetupRoute from "../../src/routes/mfa-setup.tsx";
import { renderWithAppProviders } from "./test-utils.tsx";

const userState = {
  mfaVerified: false,
  totpEnabled: false,
  passkeyEnabled: true,
};

vi.mock("../../src/services/auth", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/services/auth")
  >("../../src/services/auth");

  return {
    ...actual,
    useCurrentUser: () => ({
      data: {
        id: "00000000-0000-0000-0000-000000000001",
        username: "learner",
        displayName: "Anurag",
        email: "learner@procodrr.com",
        phoneNo: null,
        roles: ["student"],
        permissions: [],
        mfaVerified: userState.mfaVerified,
        totpEnabled: userState.totpEnabled,
        passkeyEnabled: userState.passkeyEnabled,
        mfaMandatory: false,
      },
      isLoading: false,
    }),
    useVerifyMfaTotp: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePasskeyLoginOptions: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePasskeyLoginVerify: () => ({ mutateAsync: vi.fn(), isPending: false }),
    usePasskeyRegisterOptions: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    usePasskeyRegisterVerify: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useSetupTotp: () => ({ mutateAsync: vi.fn(), isPending: false }),
    useEnableTotp: () => ({ mutateAsync: vi.fn(), isPending: false }),
  };
});

describe("mfa setup route", () => {
  beforeEach(() => {
    userState.mfaVerified = false;
    userState.totpEnabled = false;
    userState.passkeyEnabled = true;
  });

  it("reuses the login passkey screen when a passkey is already enrolled", async () => {
    renderWithAppProviders(<MfaSetupRoute />, ["/mfa-setup"]);

    expect(
      await screen.findByRole("heading", {
        name: "Two-factor authentication",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with passkey" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Register a passkey")).not.toBeInTheDocument();
    expect(screen.queryByText("Set up passkey")).not.toBeInTheDocument();
  });

  it("leaves when the session is already MFA-verified", async () => {
    userState.mfaVerified = true;
    renderWithAppProviders(<MfaSetupRoute />, ["/mfa-setup"]);

    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "Two-factor authentication" }),
      ).not.toBeInTheDocument();
    });
  });

  it("shows enrollment only when no factor exists yet", async () => {
    userState.passkeyEnabled = false;
    userState.totpEnabled = false;
    renderWithAppProviders(<MfaSetupRoute />, ["/mfa-setup"]);

    expect(
      await screen.findByRole("heading", { name: "Secure your account" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /authenticator app/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Two-factor authentication" }),
    ).not.toBeInTheDocument();
  });
});
