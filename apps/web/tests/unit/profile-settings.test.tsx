import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileSettings } from "../../src/settings/ProfileSettings.tsx";
import { renderWithQueryClient } from "./test-utils.tsx";

const authMocks = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  useSendEmailVerificationOtp: vi.fn(),
  useSendPhoneVerificationOtp: vi.fn(),
  useUpdateProfile: vi.fn(),
  useVerifyEmail: vi.fn(),
  useVerifyPhoneNumber: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPhoneVerification: vi.fn(),
  mutateAsync: vi.fn(),
  verifyEmail: vi.fn(),
  verifyPhoneNumber: vi.fn(),
}));

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: authMocks.useCurrentUser,
  useSendEmailVerificationOtp: authMocks.useSendEmailVerificationOtp,
  useSendPhoneVerificationOtp: authMocks.useSendPhoneVerificationOtp,
  useUpdateProfile: authMocks.useUpdateProfile,
  useVerifyEmail: authMocks.useVerifyEmail,
  useVerifyPhoneNumber: authMocks.useVerifyPhoneNumber,
}));

const profileUser = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "nileshyadav",
  displayName: "Nilesh Yadav",
  avatarDataUrl: null,
  bio: "",
  emailPublic: false,
  mobilePublic: false,
  linkedinUrl: null,
  linkedinPublic: false,
  githubUrl: null,
  githubPublic: false,
  websiteUrl: null,
  websitePublic: false,
  email: "nilesh@example.com",
  emailVerified: true,
  phoneNo: "+91 98765 43210",
  mobileVerified: true,
  roles: ["student"],
  permissions: [],
  menus: [],
  mfaVerified: true,
  totpEnabled: false,
  passkeyEnabled: false,
  mfaMandatory: false,
};

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
  beforeEach(() => {
    window.localStorage.clear();
    authMocks.useCurrentUser.mockReturnValue({
      data: profileUser,
      isFetched: true,
    });
    authMocks.mutateAsync.mockReset();
    authMocks.sendEmailVerification.mockReset();
    authMocks.sendPhoneVerification.mockReset();
    authMocks.verifyEmail.mockReset();
    authMocks.verifyPhoneNumber.mockReset();
    authMocks.sendEmailVerification.mockResolvedValue({
      message: "Email verification OTP sent successfully.",
    });
    authMocks.sendPhoneVerification.mockResolvedValue({
      message: "Mobile verification OTP sent successfully.",
    });
    authMocks.verifyEmail.mockResolvedValue({
      message: "Email address verified successfully.",
    });
    authMocks.verifyPhoneNumber.mockResolvedValue({
      message: "Mobile number verified successfully.",
    });
    authMocks.useSendPhoneVerificationOtp.mockReturnValue({
      isPending: false,
      mutateAsync: authMocks.sendPhoneVerification,
    });
    authMocks.useSendEmailVerificationOtp.mockReturnValue({
      isPending: false,
      mutateAsync: authMocks.sendEmailVerification,
    });
    authMocks.useUpdateProfile.mockReturnValue({
      isPending: false,
      mutateAsync: authMocks.mutateAsync,
    });
    authMocks.useVerifyPhoneNumber.mockReturnValue({
      isPending: false,
      mutateAsync: authMocks.verifyPhoneNumber,
    });
    authMocks.useVerifyEmail.mockReturnValue({
      isPending: false,
      mutateAsync: authMocks.verifyEmail,
    });
  });

  it("disables profile editing while signed out", () => {
    renderWithQueryClient(
      <ProfileSettings role="student" isAuthenticated={false} />,
    );

    for (const label of [
      "Display name",
      "Username",
      "Bio",
      "Email address",
      "Mobile number",
      "LinkedIn URL",
      "GitHub URL",
      "Portfolio",
    ]) {
      expect(screen.getByRole("textbox", { name: label })).toBeDisabled();
    }

    expect(
      screen.getByRole("checkbox", { name: /show email/i }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("requires acknowledgement before publishing a verified mobile number", async () => {
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
      name: "I understand, show publicly",
    });

    expect(mobileVisibility).not.toBeChecked();
    expect(confirm).toBeDisabled();

    fireEvent.click(consent);
    expect(confirm).toBeEnabled();

    fireEvent.click(confirm);

    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(mobileVisibility).toBeChecked();
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

  it("shows missing social links inline instead of using a toast", () => {
    const setNotice = vi.fn();
    renderWithQueryClient(
      <ProfileSettings role="student" setNotice={setNotice} />,
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Show LinkedIn profile on your public profile",
      }),
    );

    expect(setNotice).not.toHaveBeenCalled();
    expect(
      screen.getByText("Add your LinkedIn link before showing it publicly."),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Add your LinkedIn link before showing it publicly.",
    );

    fireEvent.change(screen.getByLabelText("LinkedIn URL"), {
      target: { value: "linkedin.com/in/nilesh" },
    });
    expect(
      screen.queryByText("Add your LinkedIn link before showing it publicly."),
    ).not.toBeInTheDocument();
  });

  it("shows sign-in feedback when a signed-out profile control is clicked", () => {
    authMocks.useCurrentUser.mockReturnValue({ data: null, isFetched: true });
    renderWithQueryClient(
      <ProfileSettings role="student" isAuthenticated={false} />,
    );

    fireEvent.click(screen.getByRole("textbox", { name: "Display name" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Sign in to edit your display name.",
    );
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Sign in required");

    const displayNameLock = screen.getByRole("button", {
      name: "Sign in to edit display name",
    });
    const usernameLock = screen.getByRole("button", {
      name: "Sign in to edit username",
    });

    fireEvent.mouseEnter(displayNameLock.parentElement!);
    expect(displayNameLock).toHaveAttribute(
      "aria-describedby",
      "profile-auth-tooltip-display-name",
    );

    fireEvent.mouseEnter(usernameLock.parentElement!);
    expect(displayNameLock).not.toHaveAttribute("aria-describedby");
    expect(usernameLock).toHaveAttribute(
      "aria-describedby",
      "profile-auth-tooltip-username",
    );
    expect(screen.getAllByRole("tooltip")).toHaveLength(1);
  });

  it("keeps a verified mobile number read-only", () => {
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileNumber = screen.getByLabelText("Mobile number");
    expect(mobileNumber).toHaveAttribute("readonly");
    expect(mobileNumber).toHaveValue("98765 43210");
    expect(screen.queryByText(/number is verified/i)).not.toBeInTheDocument();
  });

  it("allows an unverified account to enter a number and request an OTP", async () => {
    authMocks.useCurrentUser.mockReturnValue({
      data: { ...profileUser, phoneNo: null, mobileVerified: false },
      isFetched: true,
    });
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileNumber = screen.getByLabelText("Mobile number");
    expect(mobileNumber).not.toHaveAttribute("readonly");
    expect(mobileNumber).toHaveValue("");
    fireEvent.change(mobileNumber, {
      target: { value: "+91 98765 43210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify now" }));

    expect(screen.queryByText("Not verified")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(authMocks.sendPhoneVerification).toHaveBeenCalledWith({
        phoneNo: "+919876543210",
      }),
    );
    expect(
      await screen.findByLabelText("Verification code"),
    ).toBeInTheDocument();
  });

  it("keeps empty and non-numeric mobile input empty", () => {
    authMocks.useCurrentUser.mockReturnValue({
      data: { ...profileUser, phoneNo: null, mobileVerified: false },
      isFetched: true,
    });
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileNumber = screen.getByLabelText("Mobile number");
    fireEvent.change(mobileNumber, { target: { value: "letters" } });
    expect(mobileNumber).toHaveValue("");

    fireEvent.change(mobileNumber, { target: { value: "98765" } });
    expect(mobileNumber).toHaveValue("98765");

    fireEvent.change(mobileNumber, { target: { value: "" } });
    expect(mobileNumber).toHaveValue("");
  });

  it("verifies the mobile number with the received OTP", async () => {
    authMocks.useCurrentUser.mockReturnValue({
      data: { ...profileUser, phoneNo: null, mobileVerified: false },
      isFetched: true,
    });
    renderWithQueryClient(<ProfileSettings role="student" />);

    const mobileNumber = screen.getByLabelText("Mobile number");
    fireEvent.change(mobileNumber, {
      target: { value: "+91 98765 43210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify now" }));

    await screen.findByLabelText("Verification code");
    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify OTP" }));

    await waitFor(() =>
      expect(authMocks.verifyPhoneNumber).toHaveBeenCalledWith({
        phoneNo: "+919876543210",
        code: "123456",
      }),
    );
    expect(screen.getAllByText("Verified")).toHaveLength(2);
  });

  it("verifies an unverified email address with the received OTP", async () => {
    authMocks.useCurrentUser.mockReturnValue({
      data: { ...profileUser, emailVerified: false },
      isFetched: true,
    });
    renderWithQueryClient(<ProfileSettings role="student" />);

    fireEvent.click(screen.getByRole("button", { name: "Verify now" }));

    await waitFor(() =>
      expect(authMocks.sendEmailVerification).toHaveBeenCalledWith({}),
    );
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify OTP" }));

    await waitFor(() =>
      expect(authMocks.verifyEmail).toHaveBeenCalledWith({ code: "123456" }),
    );
    expect(screen.getAllByText("Verified")).toHaveLength(2);
  });

  it("shows a blank signed-out profile instead of demo data", () => {
    authMocks.useCurrentUser.mockReturnValue({ data: null, isFetched: true });

    renderWithQueryClient(<ProfileSettings role="student" />);

    expect(screen.getByLabelText("Display name")).toHaveValue("");
    expect(screen.getByLabelText("Username")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(
      screen.getByText("Sign in to edit and save your profile."),
    ).toBeInTheDocument();
  });

  it("saves profile edits only after the explicit save action", async () => {
    const updatedProfile = {
      ...profileUser,
      displayName: "Nilesh Kumar",
      username: "nileshkumar",
      bio: "Building useful products.",
    };
    authMocks.mutateAsync.mockResolvedValue(updatedProfile);

    renderWithQueryClient(<ProfileSettings role="student" />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Nilesh Kumar" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "nileshkumar" },
    });
    fireEvent.change(screen.getByLabelText("Bio"), {
      target: { value: "Building useful products." },
    });

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save).toBeEnabled();
    expect(authMocks.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(save);

    await waitFor(() => expect(authMocks.mutateAsync).toHaveBeenCalledTimes(1));
    expect(authMocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Nilesh Kumar",
        username: "nileshkumar",
        bio: "Building useful products.",
      }),
    );
    expect(
      await screen.findByText("Your profile is up to date."),
    ).toBeInTheDocument();
  });

  it("persists email visibility through the profile update payload", async () => {
    authMocks.mutateAsync.mockResolvedValue({
      ...profileUser,
      emailPublic: true,
    });

    renderWithQueryClient(<ProfileSettings role="student" />);

    const emailVisibility = screen.getByRole("checkbox", {
      name: "Show email address on your public profile",
    });
    fireEvent.click(emailVisibility);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(authMocks.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ emailPublic: true }),
      ),
    );
    expect(emailVisibility).toBeChecked();
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
