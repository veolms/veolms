import { fireEvent, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDefaultLoginMethod,
  isEmailLoginEnabled,
  isMethodSwitchVisible,
  isMobileLoginEnabled,
} from "../../src/auth/authConfig.ts";
import LoginRoute from "../../src/routes/login.tsx";
import { authStore } from "../../src/store/auth.store.ts";
import { renderWithAppProviders } from "./test-utils.tsx";

vi.mock("../../src/services/auth/auth.service.ts", () => {
  const user = {
    id: "00000000-0000-0000-0000-000000000001",
    username: "learner",
    displayName: "Anurag",
    email: "learner@procodrr.com",
    phoneNo: "+919876543210",
  };

  return {
    authService: {
      getMe: vi.fn().mockRejectedValue(new Error("Not authenticated")),
      sendOtp: vi.fn().mockResolvedValue({ message: "OTP sent" }),
      login: vi.fn(async (payload: { email?: string; phoneNo?: string }) => {
        if (payload.email) {
          throw Object.assign(new Error("Registration required"), {
            code: "REGISTRATION_REQUIRED",
          });
        }

        return {
          user,
          mfaRequired: true,
          mfaMandatory: false,
          totpEnabled: true,
          passkeyEnabled: true,
        };
      }),
      register: vi.fn().mockResolvedValue({
        user,
        mfaRequired: false,
        mfaMandatory: false,
        totpEnabled: false,
        passkeyEnabled: false,
      }),
      verifyMfaTotp: vi.fn().mockResolvedValue({ message: "MFA verified" }),
      getPasskeyLoginOptions: vi.fn().mockResolvedValue({ challenge: "test" }),
      verifyPasskeyLogin: vi
        .fn()
        .mockResolvedValue({ message: "Passkey verified" }),
      getOauthUrl: vi.fn().mockResolvedValue({
        url: "https://accounts.example.test/oauth",
        state: "test-state",
      }),
    },
  };
});

vi.mock("../../src/auth/webauthn.ts", () => ({
  isPasskeySupported: () => true,
  startPasskeyAuthentication: vi.fn().mockResolvedValue({ id: "credential" }),
}));

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    options,
    value,
  }: {
    ariaLabel: string;
    options: readonly (readonly [string, string])[];
    value: string;
  }) => (
    <button type="button" role="combobox" aria-label={ariaLabel}>
      {options.find(([optionValue]) => optionValue === value)?.[1] ?? ariaLabel}
    </button>
  ),
}));

const submitEmail = async (address: string) => {
  if (isMethodSwitchVisible()) {
    fireEvent.click(screen.getByRole("tab", { name: "Email" }));
  }
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: address },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { level: 1, name: "Verify your OTP" });
};

const submitMobile = async (number: string) => {
  if (isMethodSwitchVisible()) {
    fireEvent.click(screen.getByRole("tab", { name: "Mobile" }));
  }
  fireEvent.change(screen.getByLabelText("Mobile number"), {
    target: { value: number },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { level: 1, name: "Verify your OTP" });
};

const typeCode = (code: string) => {
  [...code].forEach((digit, index) => {
    fireEvent.change(
      screen.getByLabelText(`Verification code digit ${index + 1} of 6`),
      { target: { value: digit } },
    );
  });
};

const typeAuthenticatorCode = (code: string) => {
  [...code].forEach((digit, index) => {
    fireEvent.change(
      screen.getByLabelText(`Authentication code digit ${index + 1} of 6`),
      { target: { value: digit } },
    );
  });
};

const itWhenEmailLoginIsEnabled = isEmailLoginEnabled() ? it : it.skip;
const itWhenMobileLoginIsEnabled = isMobileLoginEnabled() ? it : it.skip;

beforeEach(() => {
  authStore.clearAuth();
});

describe("the login flow", () => {
  it("opens on the identifier step with the social actions in place", () => {
    renderWithAppProviders(<LoginRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Welcome to ProCodrr" }),
    ).toBeInTheDocument();
    if (getDefaultLoginMethod() === "mobile") {
      expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
    } else {
      expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
  });

  itWhenEmailLoginIsEnabled(
    "moves to the code step, which echoes the email and drops the social actions",
    async () => {
      renderWithAppProviders(<LoginRoute />);

      await submitEmail("learner@procodrr.com");

      expect(
        screen.getByRole("heading", { level: 1, name: "Verify your OTP" }),
      ).toBeInTheDocument();
      expect(screen.getByText("le●●●●●@procodrr.com")).toBeInTheDocument();
      expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Continue with Google" }),
      ).not.toBeInTheDocument();
    },
  );

  itWhenMobileLoginIsEnabled(
    "masks the mobile number the code was sent to",
    async () => {
      renderWithAppProviders(<LoginRoute />);

      await submitMobile("9876543210");

      expect(screen.getByText("+91 ●●●●● ●●210")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Change mobile number" }),
      ).toBeInTheDocument();
    },
  );

  itWhenEmailLoginIsEnabled(
    "returns to the identifier step when the learner changes the email",
    async () => {
      renderWithAppProviders(<LoginRoute />);

      await submitEmail("learner@procodrr.com");
      fireEvent.click(screen.getByRole("button", { name: "Change email" }));

      expect(
        screen.getByRole("heading", { level: 1, name: "Welcome to ProCodrr" }),
      ).toBeInTheDocument();
      if (isMobileLoginEnabled()) {
        expect(screen.getByLabelText("Mobile number")).toBeInTheDocument();
      } else {
        expect(screen.getByLabelText("Email address")).toBeInTheDocument();
      }
      expect(
        screen.getByRole("button", { name: "Continue with Google" }),
      ).toBeInTheDocument();
    },
  );

  itWhenEmailLoginIsEnabled(
    "asks an email learner for a name once the code is accepted",
    async () => {
      renderWithAppProviders(<LoginRoute />);

      await submitEmail("learner@procodrr.com");
      typeCode("140926");

      expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
      expect(screen.getByText("le●●●●●@procodrr.com")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    },
  );

  itWhenEmailLoginIsEnabled(
    "closes the flow once the account is created, having no academy to open yet",
    async () => {
      renderWithAppProviders(<LoginRoute />);

      await submitEmail("learner@procodrr.com");
      typeCode("140926");
      fireEvent.change(await screen.findByLabelText("Your name"), {
        target: { value: "Anurag" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Create account" }));

      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: "Redirecting" }),
        ).toBeInTheDocument(),
      );
    },
  );

  itWhenMobileLoginIsEnabled(
    "walks a mobile learner through the second factor to the end of the flow",
    async () => {
      renderWithAppProviders(<LoginRoute />);

      await submitMobile("9876543210");
      typeCode("140926");

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: "Two-factor authentication",
        }),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", { name: "Use authenticator app instead" }),
      );
      typeAuthenticatorCode("184273");

      await waitFor(() =>
        expect(
          screen.getByText(/Redirecting to your profile/),
        ).toBeInTheDocument(),
      );
    },
  );

  itWhenMobileLoginIsEnabled(
    "ends the flow for a mobile learner straight from the passkey",
    async () => {
      renderWithAppProviders(<LoginRoute />);

      await submitMobile("9876543210");
      typeCode("140926");
      await screen.findByRole("heading", {
        level: 1,
        name: "Two-factor authentication",
      });
      fireEvent.click(
        screen.getByRole("button", { name: "Continue with passkey" }),
      );

      await waitFor(() =>
        expect(
          screen.getByText(/Redirecting to your profile/),
        ).toBeInTheDocument(),
      );
    },
  );
});
