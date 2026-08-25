import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProfileSettings } from "../../src/settings/ProfileSettings.tsx";
import { renderWithQueryClient } from "./test-utils.tsx";

beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

describe("ProfileSettings mobile visibility confirmation", () => {
  beforeEach(() => window.localStorage.clear());

  it("requires acknowledgement but keeps the mobile number private while publishing is unconnected", async () => {
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileVisibility = screen.getByRole("checkbox", {
      name: "Show mobile number on your public profile",
    });
    expect(mobileVisibility).not.toBeChecked();

    fireEvent.click(mobileVisibility);

    const dialog = await screen.findByRole("dialog", {
      name: "Show your mobile number publicly?",
    });
    const consent = within(dialog).getByRole("checkbox", {
      name: /I understand that anyone can call or message me on WhatsApp/i,
    });
    const confirm = within(dialog).getByRole("button", {
      name: "I understand, keep private",
    });

    expect(mobileVisibility).not.toBeChecked();
    expect(confirm).toBeDisabled();

    fireEvent.click(consent);
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(mobileVisibility).not.toBeChecked();
    expect(
      screen.getByText(
        /Mobile publishing is unavailable until server verification is connected/i,
      ),
    ).toBeInTheDocument();
  });

  it("leaves the mobile number private when confirmation is cancelled", async () => {
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileVisibility = screen.getByRole("checkbox", {
      name: "Show mobile number on your public profile",
    });
    fireEvent.click(mobileVisibility);

    const dialog = await screen.findByRole("dialog", {
      name: "Show your mobile number publicly?",
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(mobileVisibility).not.toBeChecked();
  });

  it("keeps a changed mobile number private until it is verified again", async () => {
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileNumber = screen.getByLabelText("Mobile number");
    const mobileVisibility = screen.getByRole("checkbox", {
      name: "Show mobile number on your public profile",
    });

    fireEvent.change(mobileNumber, { target: { value: "+91 90000 00000" } });
    expect(
      within(
        mobileNumber.closest(".settings-profile__phone-control")!,
      ).getByText("Not verified"),
    ).toBeInTheDocument();
    fireEvent.click(mobileVisibility);

    expect(
      screen.getByText("Verify your mobile number before showing it publicly."),
    ).toBeInTheDocument();
    expect(mobileVisibility).not.toBeChecked();
    expect(
      screen.queryByRole("dialog", {
        name: "Show your mobile number publicly?",
      }),
    ).not.toBeInTheDocument();
  });

  it("does not accept a client-only verification code", async () => {
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileNumber = screen.getByLabelText("Mobile number");
    fireEvent.change(mobileNumber, { target: { value: "+91 90000 00000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify number" }));

    expect(
      await screen.findByText("Mobile verification unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByText(/No code was sent/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Verification code" }),
    ).not.toBeInTheDocument();
    expect(
      within(
        mobileNumber.closest(".settings-profile__phone-control")!,
      ).getByText("Not verified"),
    ).toBeInTheDocument();
  });

  it("rejects profile photos larger than 2 MB before reading them", () => {
    renderWithQueryClient(<ProfileSettings role="student" />);

    const photo = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(screen.getByLabelText("Profile photo file"), {
      target: { files: [photo] },
    });

    expect(
      screen.getByText("Choose a profile photo that is 2 MB or smaller."),
    ).toBeInTheDocument();
  });
});
