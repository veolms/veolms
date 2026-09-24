import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_ROLE, INSTRUCTOR_ROLE, STUDENT_ROLE } from "./auth.constants.ts";
import { isMfaMandatoryAccount, sessionNeedsMfaChallenge } from "./mfa-policy.ts";

describe("MFA Policy", () => {
  describe("isMfaMandatoryAccount", () => {
    it("should require MFA for admins and instructors by default", () => {
      assert.equal(isMfaMandatoryAccount(false, [ADMIN_ROLE]), true);
      assert.equal(isMfaMandatoryAccount(false, [INSTRUCTOR_ROLE]), true);
      assert.equal(isMfaMandatoryAccount(false, [STUDENT_ROLE]), false);
      assert.equal(isMfaMandatoryAccount(false, []), false);
    });

    it("should respect storedFlag when true", () => {
      assert.equal(isMfaMandatoryAccount(true, [STUDENT_ROLE]), true);
      assert.equal(isMfaMandatoryAccount(true, []), true);
    });

    it("should skip MFA for admins when skipAdminMfa is true", () => {
      assert.equal(
        isMfaMandatoryAccount(false, [ADMIN_ROLE], { skipAdminMfa: true }),
        false,
      );
      assert.equal(
        isMfaMandatoryAccount(true, [ADMIN_ROLE], { skipAdminMfa: true }),
        false,
      );
      // Other mandatory roles like instructor must still require MFA
      assert.equal(
        isMfaMandatoryAccount(false, [INSTRUCTOR_ROLE], { skipAdminMfa: true }),
        true,
      );
    });
  });

  describe("sessionNeedsMfaChallenge", () => {
    it("should require MFA challenge if mandatory and no factor configured", () => {
      assert.equal(
        sessionNeedsMfaChallenge({
          mfaMandatory: true,
          totpEnabled: false,
          passkeyEnabled: false,
          mfaVerified: false,
        }),
        true,
      );
    });

    it("should require MFA challenge if factor enabled but session not verified", () => {
      assert.equal(
        sessionNeedsMfaChallenge({
          mfaMandatory: false,
          totpEnabled: true,
          passkeyEnabled: false,
          mfaVerified: false,
        }),
        true,
      );
      assert.equal(
        sessionNeedsMfaChallenge({
          mfaMandatory: false,
          totpEnabled: false,
          passkeyEnabled: true,
          mfaVerified: false,
        }),
        true,
      );
    });

    it("should not require MFA challenge if session is verified or not mandatory without factors", () => {
      assert.equal(
        sessionNeedsMfaChallenge({
          mfaMandatory: false,
          totpEnabled: false,
          passkeyEnabled: false,
          mfaVerified: false,
        }),
        false,
      );
      assert.equal(
        sessionNeedsMfaChallenge({
          mfaMandatory: false,
          totpEnabled: true,
          passkeyEnabled: false,
          mfaVerified: true,
        }),
        false,
      );
    });
  });
});
