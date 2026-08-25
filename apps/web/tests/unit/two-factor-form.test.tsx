import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { TwoFactorForm } from "../../src/auth/TwoFactorForm.tsx";
import type { TwoFactorFormProps } from "../../src/auth/TwoFactorForm.tsx";

const renderForm = (props: Partial<TwoFactorFormProps> = {}) => {
  const onCodeChange = vi.fn();
  const onMethodChange = vi.fn();
  const onSubmit = vi.fn();
  const onUsePasskey = vi.fn();
  const view = render(
    <TwoFactorForm
      code=""
      method="passkey"
      onCodeChange={onCodeChange}
      onMethodChange={onMethodChange}
      onSubmit={onSubmit}
      onUsePasskey={onUsePasskey}
      status="idle"
      {...props}
    />,
  );

  return { ...view, onCodeChange, onMethodChange, onSubmit, onUsePasskey };
};

describe("choosing a second factor", () => {
  it("names the screen and offers both methods under one switch", () => {
    renderForm();

    expect(
      screen.getByRole("heading", { name: "Two-factor authentication" }),
    ).toHaveAttribute("id", "auth-card-heading");
    expect(
      screen.getByText("Choose a method to verify your identity"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "Verification method" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Passkey" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Authenticator app" }),
    ).toBeInTheDocument();
  });

  it("keeps aria-selected and the tab stop on the chosen method", () => {
    renderForm({ method: "authenticator" });

    const passkey = screen.getByRole("tab", { name: "Passkey" });
    const authenticator = screen.getByRole("tab", {
      name: "Authenticator app",
    });
    expect(passkey).toHaveAttribute("aria-selected", "false");
    expect(passkey).toHaveAttribute("tabindex", "-1");
    expect(authenticator).toHaveAttribute("aria-selected", "true");
    expect(authenticator).toHaveAttribute("tabindex", "0");
  });

  it("walks the two methods with the arrow keys", () => {
    const { onMethodChange } = renderForm();

    fireEvent.keyDown(screen.getByRole("tab", { name: "Passkey" }), {
      key: "ArrowRight",
    });

    expect(onMethodChange).toHaveBeenCalledWith("authenticator");
  });

  it("walks back to the passkey with the left arrow key", () => {
    const { onMethodChange } = renderForm({ method: "authenticator" });

    fireEvent.keyDown(screen.getByRole("tab", { name: "Authenticator app" }), {
      key: "ArrowLeft",
    });

    expect(onMethodChange).toHaveBeenCalledWith("passkey");
  });
});

describe("verifying with a passkey", () => {
  it("recommends the device and says where the check will happen", () => {
    renderForm();

    expect(screen.getByText("Recommended")).toBeInTheDocument();
    expect(screen.getByText("Sign in with your passkey")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your passkey is kept on this device or in your password manager, so there is no code to type.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with passkey" }),
    ).toBeInTheDocument();
  });

  it("keeps the authenticator code off the passkey screen", () => {
    renderForm();

    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryByText("Authentication code")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Verify & Continue" }),
    ).not.toBeInTheDocument();
  });

  it("hands the passkey ceremony to the caller", () => {
    const { onUsePasskey } = renderForm();

    fireEvent.click(
      screen.getByRole("button", { name: "Continue with passkey" }),
    );

    expect(onUsePasskey).toHaveBeenCalledTimes(1);
  });

  it("offers the authenticator app as the way out", () => {
    const { onMethodChange } = renderForm();

    fireEvent.click(
      screen.getByRole("button", { name: "Use authenticator app instead" }),
    );

    expect(onMethodChange).toHaveBeenCalledWith("authenticator");
  });
});

describe("verifying with an authenticator app", () => {
  const renderAuthenticator = (props: Partial<TwoFactorFormProps> = {}) =>
    renderForm({ method: "authenticator", ...props });

  it("asks for the six-digit code and says where to find it", () => {
    renderAuthenticator();

    expect(screen.getByText("Authentication code")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(6);
    expect(
      screen.getByText(
        "Open your authenticator app and enter the 6-digit code.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Works with Google Authenticator, Authy, or Microsoft Authenticator.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Verify & Continue" }),
    ).toBeInTheDocument();
  });

  it("keeps the passkey panel off the authenticator screen", () => {
    renderAuthenticator();

    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Continue with passkey" }),
    ).not.toBeInTheDocument();
  });

  it("offers the passkey as the way out", () => {
    const { onMethodChange } = renderAuthenticator();

    fireEvent.click(
      screen.getByRole("button", { name: "Use passkey instead" }),
    );

    expect(onMethodChange).toHaveBeenCalledWith("passkey");
  });

  it("passes each digit up to the caller as it is typed", () => {
    const { onCodeChange } = renderAuthenticator({ code: "18" });

    fireEvent.change(
      screen.getByLabelText("Authentication code digit 3 of 6"),
      { target: { value: "4" } },
    );

    expect(onCodeChange).toHaveBeenCalledWith("184");
  });

  it("hands the full six-digit code to the caller on submit", () => {
    const { onSubmit } = renderAuthenticator({ code: "184273" });

    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    expect(onSubmit).toHaveBeenCalledWith("184273");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses a short code and asks for all six digits instead", () => {
    const { onSubmit } = renderAuthenticator({ code: "184" });

    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    expect(onSubmit).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Please enter the 6-digit code.");
    expect(
      screen.getByLabelText("Authentication code digit 1 of 6"),
    ).toHaveAttribute("aria-describedby", alert.id);
  });

  it("locks the primary action and the code while the check runs", () => {
    renderAuthenticator({ code: "184273", status: "verifying" });

    const submit = screen.getByRole("button", { name: "Verifying..." });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("button", { name: "Verify & Continue" }),
    ).not.toBeInTheDocument();

    for (const position of screen.getAllByRole("textbox")) {
      expect(position).toBeDisabled();
    }
  });

  it("shows a message the caller supplies and keeps the typed code", () => {
    const failure = "That code did not match. Please try again.";
    renderAuthenticator({ code: "184273", errorMessage: failure });

    expect(screen.getByRole("alert")).toHaveTextContent(failure);

    const expected = ["1", "8", "4", "2", "7", "3"];
    screen.getAllByRole("textbox").forEach((position, index) => {
      expect(position).toHaveValue(expected[index]);
    });
  });
});
