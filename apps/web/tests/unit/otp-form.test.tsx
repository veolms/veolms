import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OtpForm } from "../../src/auth/OtpForm.tsx";
import type { OtpFormProps } from "../../src/auth/OtpForm.tsx";
import type { AuthIdentifier } from "../../src/auth/authFlow.ts";

const emailIdentifier: AuthIdentifier = {
  method: "email",
  email: "learner@procodrr.com",
};

const mobileIdentifier: AuthIdentifier = {
  method: "mobile",
  phoneNo: "+919876543210",
};

const renderForm = (props: Partial<OtpFormProps> = {}) => {
  const onCodeChange = vi.fn();
  const onIdentifierChange = vi.fn();
  const onResend = vi.fn();
  const onSubmit = vi.fn();
  const form = (overrides: Partial<OtpFormProps>) => (
    <OtpForm
      code=""
      failure={null}
      identifier={emailIdentifier}
      onCodeChange={onCodeChange}
      onIdentifierChange={onIdentifierChange}
      onResend={onResend}
      onSubmit={onSubmit}
      sendCount={1}
      status="idle"
      {...props}
      {...overrides}
    />
  );
  const view = render(form({}));

  return {
    ...view,
    onCodeChange,
    onIdentifierChange,
    onResend,
    onSubmit,
    rerenderWith: (overrides: Partial<OtpFormProps>) =>
      view.rerender(form(overrides)),
  };
};

const follows = (earlier: Element, later: Element) =>
  Boolean(
    earlier.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING,
  );

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("code destination", () => {
  it("names the screen and echoes the email the code went to", () => {
    renderForm();

    expect(
      screen.getByRole("heading", { name: "Verify your OTP" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Enter the 6-digit code sent to your email"),
    ).toBeInTheDocument();
    expect(screen.getByText("Code sent to")).toBeInTheDocument();
    expect(screen.getByText("le●●●●●@procodrr.com")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change email" }),
    ).toBeInTheDocument();
  });

  it("carries the id the auth card is labelled by", () => {
    renderForm();

    expect(
      screen.getByRole("heading", { name: "Verify your OTP" }),
    ).toHaveAttribute("id", "auth-card-heading");
  });

  it("dot-masks the mobile number and offers to change it instead", () => {
    renderForm({ identifier: mobileIdentifier });

    expect(
      screen.getByText("Enter the 6-digit code sent to your mobile number"),
    ).toBeInTheDocument();
    expect(screen.getByText("+91 ●●●●● ●●210")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Change mobile number" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Change email" }),
    ).not.toBeInTheDocument();
  });

  it("sends the learner back to the identifier screen on request", () => {
    const { onIdentifierChange } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Change email" }));

    expect(onIdentifierChange).toHaveBeenCalledTimes(1);
  });
});

describe("the order of the card", () => {
  it("runs heading, destination, code, resend, verify, change", () => {
    renderForm();

    const heading = screen.getByRole("heading", { name: "Verify your OTP" });
    const destination = screen.getByText("Code sent to");
    const firstDigit = screen.getByLabelText("Verification code digit 1 of 6");
    const resend = screen.getByRole("button", { name: "Resend in 60s" });
    const verify = screen.getByRole("button", { name: "Verify & Continue" });
    const change = screen.getByRole("button", { name: "Change email" });

    expect(follows(heading, destination)).toBe(true);
    expect(follows(destination, firstDigit)).toBe(true);
    expect(follows(firstDigit, resend)).toBe(true);
    expect(follows(resend, verify)).toBe(true);
    expect(follows(verify, change)).toBe(true);
  });

  it("hangs every part off a rendered auth-otp-form block", () => {
    const { container } = renderForm();

    const block = container.querySelector(".auth-otp-form");
    expect(block).not.toBeNull();
    expect(
      block?.contains(screen.getByRole("button", { name: "Change email" })),
    ).toBe(true);
  });
});

describe("entering the code", () => {
  it("passes each digit up to the caller as it is typed", () => {
    const { onCodeChange } = renderForm({ code: "14" });

    fireEvent.change(screen.getByLabelText("Verification code digit 3 of 6"), {
      target: { value: "0" },
    });

    expect(onCodeChange).toHaveBeenCalledWith("140");
  });

  it("hands the full six-digit code to the caller on submit", () => {
    const { onSubmit } = renderForm({ code: "140926" });

    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    expect(onSubmit).toHaveBeenCalledWith("140926");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses a short code and asks for all six digits instead", () => {
    const { onSubmit } = renderForm({ code: "140" });

    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter the 6-digit code.",
    );
  });

  it("flags every position and points it at the message", () => {
    renderForm({ code: "140" });

    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));

    const alert = screen.getByRole("alert");
    const position = screen.getByLabelText("Verification code digit 1 of 6");
    expect(position).toHaveAttribute("aria-invalid", "true");
    expect(position).toHaveAttribute("aria-describedby", alert.id);
  });

  it("drops its own message as soon as the code is edited again", () => {
    const { onCodeChange } = renderForm({ code: "140" });

    fireEvent.click(screen.getByRole("button", { name: "Verify & Continue" }));
    fireEvent.change(screen.getByLabelText("Verification code digit 4 of 6"), {
      target: { value: "9" },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onCodeChange).toHaveBeenCalledWith("1409");
  });
});

describe("while the code is being checked", () => {
  it("locks the primary action in place and says it is working", () => {
    renderForm({ code: "140926", status: "verifying" });

    const submit = screen.getByRole("button", { name: "Verifying..." });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("button", { name: "Verify & Continue" }),
    ).not.toBeInTheDocument();
  });

  it("locks every code position so the code cannot change mid-check", () => {
    renderForm({ code: "140926", status: "verifying" });

    for (const position of screen.getAllByRole("textbox")) {
      expect(position).toBeDisabled();
    }
  });
});

describe("a rejected code", () => {
  it("names the fault when the code is wrong", () => {
    renderForm({ code: "140926", failure: "incorrect" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Incorrect OTP");
    expect(alert).toHaveTextContent("The code you entered is incorrect.");
  });

  it("says the code expired and a new one is needed", () => {
    renderForm({ code: "140926", failure: "expired" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("OTP Expired");
    expect(alert).toHaveTextContent(
      "This OTP has expired. Please request a new one.",
    );
  });

  it("says the code was tried too many times", () => {
    renderForm({ code: "140926", failure: "attemptsExceeded" });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Too Many Attempts");
    expect(alert).toHaveTextContent(
      "Too many attempts. Please request a new code.",
    );
  });

  it("apologises without a heading when the check itself fails", () => {
    renderForm({ code: "140926", failure: "verifyFailed" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't verify your code. Please try again.",
    );
    expect(screen.getByRole("alert").textContent).toBe(
      "We couldn't verify your code. Please try again.",
    );
  });

  it("keeps the wrong code on screen beside the message", () => {
    renderForm({ code: "140926", failure: "incorrect" });

    expect(screen.getByRole("alert")).toBeInTheDocument();

    const expected = ["1", "4", "0", "9", "2", "6"];
    screen.getAllByRole("textbox").forEach((position, index) => {
      expect(position).toHaveValue(expected[index]);
    });
  });
});

describe("asking for another code", () => {
  it("prompts for a resend and counts the cooldown down on a locked action", () => {
    renderForm();

    expect(screen.getByText("Didn't receive the code?")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resend in 60s" }),
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(
      screen.getByRole("button", { name: "Resend in 59s" }),
    ).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(58_000);
    });

    expect(screen.getByRole("button", { name: "Resend in 1s" })).toBeDisabled();
  });

  it("hands the request over once the cooldown has run out", () => {
    const { onResend } = renderForm();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const resend = screen.getByRole("button", { name: "Resend OTP" });
    expect(resend).toBeEnabled();

    fireEvent.click(resend);

    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("locks the action for a fresh minute when another code goes out", () => {
    const { rerenderWith } = renderForm();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByRole("button", { name: "Resend OTP" })).toBeEnabled();

    rerenderWith({ sendCount: 2 });

    expect(
      screen.getByRole("button", { name: "Resend in 60s" }),
    ).toBeDisabled();
  });

  it("announces the wait once, then announces that it is over", () => {
    renderForm();

    const announcement = screen.getByText("You can request a new code in 60s.");
    expect(announcement).toHaveAttribute("role", "status");

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(announcement).toHaveTextContent(
      "You can request a new code in 60s.",
    );

    act(() => {
      vi.advanceTimersByTime(59_000);
    });

    expect(announcement).toHaveTextContent("You can request a new code now.");
  });

  it("stops counting when the screen is taken away", () => {
    const { unmount } = renderForm();

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops counting once the cooldown is over", () => {
    renderForm();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(vi.getTimerCount()).toBe(0);
  });
});
