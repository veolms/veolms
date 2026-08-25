import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { AccountForm } from "../../src/auth/AccountForm.tsx";
import type { AccountFormProps } from "../../src/auth/AccountForm.tsx";
import type { AuthIdentifier } from "../../src/auth/authFlow.ts";

const emailIdentifier: AuthIdentifier = {
  method: "email",
  email: "learner@procodrr.com",
};

const mobileIdentifier: AuthIdentifier = {
  method: "mobile",
  phoneNo: "+919876543210",
};

const renderForm = (props: Partial<AccountFormProps> = {}) => {
  const onNameChange = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <AccountForm
      identifier={emailIdentifier}
      name=""
      onNameChange={onNameChange}
      onSubmit={onSubmit}
      status="idle"
      {...props}
    />,
  );

  return { ...view, onNameChange, onSubmit };
};

describe("the account card", () => {
  it("welcomes the learner by name and says what is left to do", () => {
    renderForm();

    expect(
      screen.getByRole("heading", { name: "Welcome to ProCodrr" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Let's finish setting up your account"),
    ).toBeInTheDocument();
  });

  it("carries the id the auth card is labelled by", () => {
    renderForm();

    expect(
      screen.getByRole("heading", { name: "Welcome to ProCodrr" }),
    ).toHaveAttribute("id", "auth-card-heading");
  });

  it("confirms the verified email behind dots", () => {
    renderForm();

    expect(screen.getByText("le●●●●●@procodrr.com")).toBeInTheDocument();
    expect(screen.getByText("verified")).toBeInTheDocument();
  });

  it("confirms the verified mobile number behind dots", () => {
    renderForm({ identifier: mobileIdentifier });

    expect(screen.getByText("+91 ●●●●● ●●210")).toBeInTheDocument();
    expect(screen.getByText("verified")).toBeInTheDocument();
  });

  it("asks for the name with a placeholder rather than a bare box", () => {
    renderForm();

    expect(screen.getByLabelText("Your name")).toHaveAttribute(
      "placeholder",
      "Enter your name",
    );
  });

  it("spells out the terms the account is created under", () => {
    renderForm();

    expect(screen.getByText(/By creating an account/)).toHaveTextContent(
      "By creating an account, you agree to our Terms of Service and Privacy Policy.",
    );
    expect(
      screen.getByRole("button", { name: "Terms of Service" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Privacy Policy" }),
    ).toBeInTheDocument();
  });
});

describe("naming the account", () => {
  it("passes each keystroke up to the caller", () => {
    const { onNameChange } = renderForm();

    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "Ada" },
    });

    expect(onNameChange).toHaveBeenCalledWith("Ada");
  });

  it("hands the trimmed name to the caller on submit", () => {
    const { onSubmit } = renderForm({ name: "  Ada Lovelace  " });

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(onSubmit).toHaveBeenCalledWith("Ada Lovelace");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses a name that is nothing but spaces", () => {
    const { onSubmit } = renderForm({ name: "   " });

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter your name.",
    );
  });

  it("refuses an empty name", () => {
    const { onSubmit } = renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Please enter your name.",
    );
  });

  it("drops its own message as soon as the name is edited again", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "A" },
    });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("while the account is being created", () => {
  it("locks the primary action in place and says it is working", () => {
    renderForm({ name: "Ada Lovelace", status: "creating" });

    const submit = screen.getByRole("button", { name: "Creating account..." });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute("aria-busy", "true");
    expect(
      screen.queryByRole("button", { name: "Create account" }),
    ).not.toBeInTheDocument();
  });
});

describe("error reporting", () => {
  it("announces the message and marks the field invalid", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    const field = screen.getByLabelText("Your name");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Please enter your name.");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby", alert.id);
  });

  it("shows a message the caller supplies, such as a failed sign-up", () => {
    const failure = "We couldn't create your account. Please try again.";
    renderForm({ errorMessage: failure });

    expect(screen.getByRole("alert")).toHaveTextContent(failure);
    expect(screen.getByLabelText("Your name")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("leaves the field clean and undescribed while there is nothing to say", () => {
    renderForm({ name: "Ada Lovelace" });

    const field = screen.getByLabelText("Your name");
    expect(field).toHaveAttribute("aria-invalid", "false");
    expect(field).not.toHaveAttribute("aria-describedby");
  });
});
