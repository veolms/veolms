import { otpVerifyRequestSchema } from "@veolms/contracts";
import {
  DEFAULT_COUNTRY_ID,
  findCountry,
  toNationalDigits,
} from "./identifier.ts";
import type { CountryOption } from "./identifier.ts";

export type AuthIdentifier =
  | { readonly method: "email"; readonly email: string }
  | { readonly method: "mobile"; readonly phoneNo: string };

export type AuthFlowState =
  | { readonly status: "identifier"; readonly message: string | null }
  | {
      readonly status: "sendingOtp";
      readonly identifier: AuthIdentifier;
      readonly sendCount: number;
    }
  | {
      readonly status: "otp";
      readonly identifier: AuthIdentifier;
      readonly code: string;
      readonly sendCount: number;
      readonly failure: OtpFailureReason | null;
    }
  | {
      readonly status: "verifyingOtp";
      readonly identifier: AuthIdentifier;
      readonly code: string;
      readonly sendCount: number;
    }
  | {
      readonly status: "newUserName";
      readonly identifier: AuthIdentifier;
      readonly name: string;
      readonly message: string | null;
    }
  | {
      readonly status: "creatingAccount";
      readonly identifier: AuthIdentifier;
      readonly name: string;
    }
  | {
      readonly status: "twoFactorPasskey";
      readonly identifier: AuthIdentifier;
      readonly code: string;
      readonly message: string | null;
    }
  | {
      readonly status: "twoFactorAuthenticator";
      readonly identifier: AuthIdentifier;
      readonly code: string;
      readonly message: string | null;
    }
  | {
      readonly status: "verifyingTwoFactor";
      readonly identifier: AuthIdentifier;
      readonly method: TwoFactorMethod;
      readonly code: string;
    }
  | {
      readonly status: "adminMfaSetup";
      readonly identifier: AuthIdentifier;
      readonly message: string | null;
    }
  | { readonly status: "authenticated" }
  | { readonly status: "error"; readonly message: string };

export type OtpFailureReason =
  "incorrect" | "expired" | "attemptsExceeded" | "verifyFailed";

export type TwoFactorMethod = "passkey" | "authenticator";

export type OtpVerifiedOutcome =
  | "newUserName"
  | "twoFactorPasskey"
  | "twoFactorAuthenticator"
  | "adminMfaSetup"
  | "authenticated";

export type OtpMessageKey = OtpFailureReason | "sendFailed" | "unexpected";

export interface OtpMessage {
  readonly title: string | null;
  readonly body: string;
}

export const OTP_MESSAGES: Record<OtpMessageKey, OtpMessage> = {
  incorrect: {
    title: "Incorrect OTP",
    body: "The code you entered is incorrect.",
  },
  expired: {
    title: "OTP Expired",
    body: "This OTP has expired. Please request a new one.",
  },
  attemptsExceeded: {
    title: "Too Many Attempts",
    body: "Too many attempts. Please request a new code.",
  },
  sendFailed: {
    title: null,
    body: "We couldn't send the verification code. Please try again.",
  },
  verifyFailed: {
    title: null,
    body: "We couldn't verify your code. Please try again.",
  },
  unexpected: {
    title: null,
    body: "Something went wrong. Please try again.",
  },
};

export const AUTH_CARD_HEADING_ID = "auth-card-heading";

export const OTP_ACTION_LABELS = {
  verify: "Verify & Continue",
  verifying: "Verifying...",
  resend: "Resend OTP",
  changeEmail: "Change email",
  changeMobile: "Change mobile number",
} as const;

export const RESEND_COOLDOWN_SECONDS = 60;

export function formatResendCountdown(seconds: number): string {
  return `${Math.max(0, seconds)}s`;
}

const INCOMPLETE_OTP_MESSAGE = "Please enter the 6-digit code.";

export function validateOtpCode(code: string): string | null {
  const result = otpVerifyRequestSchema.shape.code.safeParse(code);

  return result.success ? null : INCOMPLETE_OTP_MESSAGE;
}

const MASK_CHARACTER = "●";
const MOBILE_GROUP_DIGITS = 5;
const VISIBLE_MOBILE_DIGITS = 3;
const VISIBLE_EMAIL_CHARACTERS = 2;

function requireDefaultCountry(): CountryOption {
  const country = findCountry(DEFAULT_COUNTRY_ID);

  if (!country) {
    throw new Error("DEFAULT_COUNTRY_ID must name one of SUPPORTED_COUNTRIES.");
  }

  return country;
}

const DEFAULT_COUNTRY = requireDefaultCountry();

function groupMobile(masked: string): string {
  return masked.length <= MOBILE_GROUP_DIGITS
    ? masked
    : `${masked.slice(0, MOBILE_GROUP_DIGITS)} ${masked.slice(MOBILE_GROUP_DIGITS)}`;
}

function maskMobile(phoneNo: string): string {
  const digits = toNationalDigits(phoneNo).slice(
    -DEFAULT_COUNTRY.nationalDigits,
  );
  const hidden = Math.max(0, digits.length - VISIBLE_MOBILE_DIGITS);

  return `${DEFAULT_COUNTRY.dialCode} ${groupMobile(MASK_CHARACTER.repeat(hidden) + digits.slice(hidden))}`;
}

function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");

  if (at < 1) {
    return email;
  }

  const local = email.slice(0, at);
  const visible = Math.min(VISIBLE_EMAIL_CHARACTERS, local.length - 1);

  return `${local.slice(0, visible)}${MASK_CHARACTER.repeat(local.length - visible)}${email.slice(at)}`;
}

export function maskIdentifier(identifier: AuthIdentifier): string {
  return identifier.method === "email"
    ? maskEmail(identifier.email)
    : maskMobile(identifier.phoneNo);
}

export type AuthFlowAction =
  | { readonly type: "SUBMIT_IDENTIFIER"; readonly identifier: AuthIdentifier }
  | { readonly type: "OTP_SENT" }
  | { readonly type: "OTP_SEND_FAILED" }
  | { readonly type: "CHANGE_OTP_CODE"; readonly code: string }
  | { readonly type: "SUBMIT_OTP" }
  | { readonly type: "OTP_REJECTED"; readonly reason: OtpFailureReason }
  | { readonly type: "OTP_VERIFIED"; readonly next: OtpVerifiedOutcome }
  | { readonly type: "RESEND_OTP" }
  | { readonly type: "CHANGE_IDENTIFIER" }
  | { readonly type: "CHANGE_ACCOUNT_NAME"; readonly name: string }
  | { readonly type: "SUBMIT_ACCOUNT_NAME"; readonly name: string }
  | { readonly type: "ACCOUNT_CREATED" }
  | { readonly type: "ACCOUNT_CREATED_REQUIRES_MFA" }
  | { readonly type: "ACCOUNT_CREATION_FAILED"; readonly message: string }
  | {
      readonly type: "CHANGE_TWO_FACTOR_METHOD";
      readonly method: TwoFactorMethod;
    }
  | { readonly type: "CHANGE_TWO_FACTOR_CODE"; readonly code: string }
  | { readonly type: "SUBMIT_TWO_FACTOR" }
  | { readonly type: "TWO_FACTOR_VERIFIED" }
  | { readonly type: "TWO_FACTOR_REJECTED"; readonly message: string }
  | { readonly type: "ADMIN_MFA_SETUP_DONE" }
  | { readonly type: "ADMIN_MFA_SETUP_FAILED"; readonly message: string }
  | { readonly type: "UNEXPECTED_FAILURE" };

const TWO_FACTOR_STATUS = {
  passkey: "twoFactorPasskey",
  authenticator: "twoFactorAuthenticator",
} as const;

export const TWO_FACTOR_METHOD = {
  twoFactorPasskey: "passkey",
  twoFactorAuthenticator: "authenticator",
} as const;

type TwoFactorState = Extract<
  AuthFlowState,
  { status: "twoFactorPasskey" | "twoFactorAuthenticator" }
>;

function isTwoFactorState(state: AuthFlowState): state is TwoFactorState {
  return (
    state.status === "twoFactorPasskey" ||
    state.status === "twoFactorAuthenticator"
  );
}

export const initialAuthFlowState: AuthFlowState = {
  status: "identifier",
  message: null,
};

export function authFlowReducer(
  state: AuthFlowState,
  action: AuthFlowAction,
): AuthFlowState {
  if (action.type === "UNEXPECTED_FAILURE") {
    return { status: "error", message: OTP_MESSAGES.unexpected.body };
  }

  if (state.status === "identifier" && action.type === "SUBMIT_IDENTIFIER") {
    return {
      status: "sendingOtp",
      identifier: action.identifier,
      sendCount: 0,
    };
  }

  if (action.type === "CHANGE_IDENTIFIER") {
    return initialAuthFlowState;
  }

  if (
    (state.status === "sendingOtp" ||
      state.status === "newUserName" ||
      state.status === "creatingAccount") &&
    action.type === "OTP_SENT"
  ) {
    return {
      status: "otp",
      identifier: state.identifier,
      code: "",
      sendCount: "sendCount" in state ? state.sendCount + 1 : 1,
      failure: null,
    };
  }

  if (state.status === "sendingOtp" && action.type === "OTP_SEND_FAILED") {
    return { status: "identifier", message: OTP_MESSAGES.sendFailed.body };
  }

  if (state.status === "otp" && action.type === "CHANGE_OTP_CODE") {
    return { ...state, code: action.code };
  }

  if (state.status === "otp" && action.type === "SUBMIT_OTP") {
    return {
      status: "verifyingOtp",
      identifier: state.identifier,
      code: state.code,
      sendCount: state.sendCount,
    };
  }

  if (state.status === "otp" && action.type === "RESEND_OTP") {
    return {
      status: "sendingOtp",
      identifier: state.identifier,
      sendCount: state.sendCount,
    };
  }

  if (state.status === "verifyingOtp" && action.type === "OTP_REJECTED") {
    return { ...state, status: "otp", failure: action.reason };
  }

  if (state.status === "verifyingOtp" && action.type === "OTP_VERIFIED") {
    if (action.next === "authenticated") {
      return { status: "authenticated" };
    }

    if (action.next === "newUserName") {
      return {
        status: "newUserName",
        identifier: state.identifier,
        name: "",
        message: null,
      };
    }

    if (action.next === "adminMfaSetup") {
      return {
        status: "adminMfaSetup",
        identifier: state.identifier,
        message: null,
      };
    }

    return {
      status: action.next,
      identifier: state.identifier,
      code: "",
      message: null,
    };
  }

  if (state.status === "newUserName" && action.type === "CHANGE_ACCOUNT_NAME") {
    return { ...state, name: action.name };
  }

  if (state.status === "newUserName" && action.type === "SUBMIT_ACCOUNT_NAME") {
    return {
      status: "creatingAccount",
      identifier: state.identifier,
      name: action.name,
    };
  }

  if (state.status === "creatingAccount" && action.type === "ACCOUNT_CREATED") {
    return { status: "authenticated" };
  }

  if (
    state.status === "creatingAccount" &&
    action.type === "ACCOUNT_CREATED_REQUIRES_MFA"
  ) {
    return {
      status: "adminMfaSetup",
      identifier: state.identifier,
      message: null,
    };
  }

  if (
    state.status === "creatingAccount" &&
    action.type === "ACCOUNT_CREATION_FAILED"
  ) {
    return { ...state, status: "newUserName", message: action.message };
  }

  if (isTwoFactorState(state) && action.type === "CHANGE_TWO_FACTOR_METHOD") {
    return { ...state, status: TWO_FACTOR_STATUS[action.method] };
  }

  if (isTwoFactorState(state) && action.type === "CHANGE_TWO_FACTOR_CODE") {
    return { ...state, code: action.code };
  }

  if (isTwoFactorState(state) && action.type === "SUBMIT_TWO_FACTOR") {
    return {
      status: "verifyingTwoFactor",
      identifier: state.identifier,
      method: TWO_FACTOR_METHOD[state.status],
      code: state.code,
    };
  }

  if (
    state.status === "verifyingTwoFactor" &&
    action.type === "TWO_FACTOR_VERIFIED"
  ) {
    return { status: "authenticated" };
  }

  if (
    state.status === "verifyingTwoFactor" &&
    action.type === "TWO_FACTOR_REJECTED"
  ) {
    return {
      status: TWO_FACTOR_STATUS[state.method],
      identifier: state.identifier,
      code: state.code,
      message: action.message,
    };
  }

  if (
    state.status === "adminMfaSetup" &&
    action.type === "ADMIN_MFA_SETUP_DONE"
  ) {
    return { status: "authenticated" };
  }

  if (
    state.status === "adminMfaSetup" &&
    action.type === "ADMIN_MFA_SETUP_FAILED"
  ) {
    return { ...state, message: action.message };
  }

  return state;
}
