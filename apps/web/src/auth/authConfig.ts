type RegisterVerificationMode = "either" | "both" | "email" | "mobile";

type ValidAuthConfig = {
  ALLOW_EMAIL_LOGIN: boolean;
  ALLOW_MOBILE_LOGIN: boolean;
  REGISTER_VERIFY: RegisterVerificationMode;
} & ({ ALLOW_EMAIL_LOGIN: true } | { ALLOW_MOBILE_LOGIN: true });

export const AUTH_CONFIG: ValidAuthConfig = {
  // Login / Start screen options (At least one MUST be true)
  ALLOW_EMAIL_LOGIN: true,
  ALLOW_MOBILE_LOGIN: false,

  // Registration requirement: "either" | "both" | "email" | "mobile"
  // "either" = Single step (uses whatever method the user entered)
  // "both"   = Requires both Email and Mobile
  // "email"  = Requires Email verification
  // "mobile" = Requires Mobile verification
  REGISTER_VERIFY: "either" as RegisterVerificationMode,
} as const;

export function isEmailLoginEnabled(): boolean {
  return AUTH_CONFIG.ALLOW_EMAIL_LOGIN || !AUTH_CONFIG.ALLOW_MOBILE_LOGIN;
}

export function isMobileLoginEnabled(): boolean {
  return AUTH_CONFIG.ALLOW_MOBILE_LOGIN;
}

export function getSecondaryVerificationMethodRequired(
  currentMethod: "email" | "mobile",
): "email" | "mobile" | null {
  const mode = AUTH_CONFIG.REGISTER_VERIFY;
  if (mode === "either") return null;
  if (mode === "both") {
    return currentMethod === "mobile" ? "email" : "mobile";
  }
  if (mode === "email" && currentMethod === "mobile") {
    return "email";
  }
  if (mode === "mobile" && currentMethod === "email") {
    return "mobile";
  }
  return null;
}

export function getDefaultLoginMethod(): "email" | "mobile" {
  if (isMobileLoginEnabled()) return "mobile";
  return "email";
}

export function isMethodSwitchVisible(): boolean {
  return isEmailLoginEnabled() && isMobileLoginEnabled();
}

export function isIdentifierMethodEnabled(method: "email" | "mobile"): boolean {
  return method === "email" ? isEmailLoginEnabled() : isMobileLoginEnabled();
}
