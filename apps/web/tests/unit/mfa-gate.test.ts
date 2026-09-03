import { describe, expect, it } from "vitest";
import {
  accountRequiresMfaEnrollment,
  resolveMfaSetupView,
} from "../../src/auth/mfaGate.ts";
import {
  MFA_CHALLENGE_PATH,
  resolvePostAuthPath,
} from "../../src/auth/postAuthNavigation.ts";
import { APP_HOME_PATH } from "../../src/routing/routeAccess.ts";
describe("resolvePostAuthPath", () => {
  it("keeps Google and GitHub on the MFA challenge when the new session still needs it", () => {
    expect(resolvePostAuthPath({ mfaRequired: true })).toBe(MFA_CHALLENGE_PATH);
  });

  it("opens courses after MFA is no longer required", () => {
    expect(resolvePostAuthPath({ mfaRequired: false })).toBe(APP_HOME_PATH);
  });
});

describe("resolveMfaSetupView", () => {
  it("sends signed-out visitors to login", () => {
    expect(resolveMfaSetupView(undefined)).toBe("login");
    expect(resolveMfaSetupView(null)).toBe("login");
  });

  it("skips setup when the session already completed MFA", () => {
    expect(
      resolveMfaSetupView({
        mfaVerified: true,
        totpEnabled: true,
        passkeyEnabled: true,
      }),
    ).toBe("done");
  });

  it("reuses the login verify screen when a factor is already enrolled", () => {
    expect(
      resolveMfaSetupView({
        mfaVerified: false,
        totpEnabled: false,
        passkeyEnabled: true,
      }),
    ).toBe("verify");
    expect(
      resolveMfaSetupView({
        mfaVerified: false,
        totpEnabled: true,
        passkeyEnabled: false,
      }),
    ).toBe("verify");
  });

  it("shows enrollment only when MFA is still missing", () => {
    expect(
      resolveMfaSetupView({
        mfaVerified: false,
        totpEnabled: false,
        passkeyEnabled: false,
      }),
    ).toBe("enroll");
  });

  it("forces an admin with no factor to enroll even if the session looks verified", () => {
    expect(
      resolveMfaSetupView({
        mfaVerified: true,
        totpEnabled: false,
        passkeyEnabled: false,
        roles: ["admin"],
      }),
    ).toBe("enroll");
  });

  it("keeps an admin with an enrolled factor on the normal verify path", () => {
    expect(
      resolveMfaSetupView({
        mfaVerified: false,
        totpEnabled: false,
        passkeyEnabled: true,
        roles: ["admin"],
      }),
    ).toBe("verify");
  });

  it("lets a student without MFA continue", () => {
    expect(
      resolveMfaSetupView({
        mfaVerified: true,
        totpEnabled: false,
        passkeyEnabled: false,
        roles: ["student"],
      }),
    ).toBe("done");
  });
});

describe("accountRequiresMfaEnrollment", () => {
  it("treats the admin role as mandatory", () => {
    expect(accountRequiresMfaEnrollment({ roles: ["Admin"] })).toBe(true);
    expect(accountRequiresMfaEnrollment({ roles: ["student"] })).toBe(false);
    expect(accountRequiresMfaEnrollment({ mfaMandatory: true })).toBe(true);
  });
});
