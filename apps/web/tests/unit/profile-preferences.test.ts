import { beforeEach, describe, expect, it } from "vitest";
import { getProfileIdentity } from "../../src/settings/profileTypes.js";

describe("profile identity defaults", () => {
  beforeEach(() => localStorage.clear());

  it("does not invent a demo identity for either role", () => {
    expect(getProfileIdentity("student")).toMatchObject({
      displayName: "",
      roleLabel: "Student",
      avatarDataUrl: null,
    });
    expect(getProfileIdentity("creator")).toMatchObject({
      displayName: "",
      roleLabel: "Instructor",
      avatarDataUrl: null,
    });
  });

  it("starts with private profile visibility defaults", () => {
    expect(getProfileIdentity("student")).toMatchObject({
      emailPublic: false,
      mobilePublic: false,
      linkedinPublic: false,
      githubPublic: false,
      websitePublic: false,
    });
  });
});
