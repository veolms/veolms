import { describe, expect, it } from "vitest";
import {
  APP_HOME_PATH,
  buildLoginPath,
  isCoursesPublicPath,
  isLearningPath,
  isPublicAcademyPath,
  isSettingsPath,
  requiresAcademyAuth,
  resolveAuthenticatedDestination,
  resolveSessionAccess,
  sanitizeReturnTo,
  shouldRedirectToMfaChallenge,
} from "../../src/routing/routeAccess.ts";

describe("route access policy", () => {
  it("treats courses, lessons, and settings as public academy routes", () => {
    expect(isCoursesPublicPath("/courses")).toBe(true);
    expect(isCoursesPublicPath("/courses/demo/overview")).toBe(true);
    expect(isCoursesPublicPath("/courses/create")).toBe(false);
    expect(isLearningPath("/learn/demo")).toBe(true);
    expect(isLearningPath("/learn/demo/lesson-1")).toBe(true);
    expect(isLearningPath("/courses/demo")).toBe(true);
    expect(isLearningPath("/courses/demo/lesson-1")).toBe(true);
    expect(isLearningPath("/courses/create")).toBe(false);
    expect(isLearningPath("/learn")).toBe(false);
    expect(isSettingsPath("/settings/security")).toBe(true);
    expect(isPublicAcademyPath("/settings/profile")).toBe(true);
    expect(isPublicAcademyPath("/learn/demo")).toBe(true);
  });

  it("requires authentication for workspace routes", () => {
    expect(requiresAcademyAuth("/")).toBe(true);
    expect(requiresAcademyAuth("/discussions")).toBe(true);
    expect(requiresAcademyAuth("/learn/demo")).toBe(false);
    expect(requiresAcademyAuth("/courses/demo/lesson-1")).toBe(false);
    expect(requiresAcademyAuth("/courses/create")).toBe(true);
    expect(requiresAcademyAuth("/courses")).toBe(false);
    expect(requiresAcademyAuth("/settings")).toBe(false);
    expect(requiresAcademyAuth("/logout")).toBe(false);
  });

  it("builds safe login redirects", () => {
    expect(buildLoginPath("/discussions")).toBe(
      "/login?returnTo=%2Fdiscussions",
    );
    expect(buildLoginPath("/login")).toBe("/login");
    expect(buildLoginPath("//evil.test")).toBe("/login");
  });

  it("resolves authenticated destinations", () => {
    expect(resolveAuthenticatedDestination(null)).toBe(APP_HOME_PATH);
    expect(resolveAuthenticatedDestination("/orders")).toBe("/orders");
    expect(resolveAuthenticatedDestination("/login")).toBe(APP_HOME_PATH);
  });

  it("tracks MFA pending sessions separately from signed-out visitors", () => {
    expect(
      resolveSessionAccess({
        user: {
          mfaVerified: false,
          totpEnabled: true,
          passkeyEnabled: false,
        },
        isAuthenticated: true,
      }),
    ).toMatchObject({
      isAuthenticated: true,
      needsMfaChallenge: true,
      isSessionReady: false,
    });

    expect(
      resolveSessionAccess({
        user: {
          mfaVerified: true,
          totpEnabled: true,
          passkeyEnabled: true,
        },
        isAuthenticated: true,
      }),
    ).toMatchObject({
      isSessionReady: true,
      needsMfaChallenge: false,
    });
  });

  it("sanitizes return targets", () => {
    expect(sanitizeReturnTo("/courses?tab=mine")).toBe("/courses?tab=mine");
    expect(sanitizeReturnTo("/mfa-setup")).toBeNull();
  });

  it("does not bounce public or auth screens to MFA on a 403", () => {
    const mfaError = { status: 403, code: "MFA_REQUIRED" };

    expect(shouldRedirectToMfaChallenge("/courses", mfaError)).toBe(false);
    expect(shouldRedirectToMfaChallenge("/learn/demo", mfaError)).toBe(false);
    expect(shouldRedirectToMfaChallenge("/settings/appearance", mfaError)).toBe(
      false,
    );
    expect(shouldRedirectToMfaChallenge("/", mfaError)).toBe(false);
    expect(shouldRedirectToMfaChallenge("/login", mfaError)).toBe(false);
    expect(shouldRedirectToMfaChallenge("/discussions", mfaError)).toBe(true);
    expect(
      shouldRedirectToMfaChallenge("/courses", {
        status: 401,
        code: "UNAUTHORIZED",
      }),
    ).toBe(false);
  });
});
