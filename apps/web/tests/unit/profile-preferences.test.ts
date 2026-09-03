import { beforeEach, describe, expect, it } from "vitest";
import {
  getProfileIdentity,
  getStoredProfilePreferences,
  getProfileStorageKey,
  saveProfilePreferences,
} from "../../src/settings/profilePreferences.js";

describe("academy-local profile preferences", () => {
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

  it("ignores legacy browser profile data when building the identity", () => {
    expect(
      saveProfilePreferences("student", {
        displayName: "Avery Patel",
        avatarDataUrl: null,
      }),
    ).toBe(true);

    expect(getProfileIdentity("student")).toMatchObject({
      displayName: "",
      avatarDataUrl: null,
      roleLabel: "Student",
    });
    expect(getStoredProfilePreferences("student")).toEqual({
      displayName: "Avery Patel",
      avatarDataUrl: null,
    });
    expect(getStoredProfilePreferences("creator")).toBeNull();
  });

  it("repairs invalid or incomplete stored data from role defaults", () => {
    localStorage.setItem(getProfileStorageKey("student"), "{");
    expect(getProfileIdentity("student").displayName).toBe("");

    localStorage.setItem(
      getProfileStorageKey("student"),
      JSON.stringify({
        displayName: "   ",
        avatarDataUrl: 42,
      }),
    );
    expect(getProfileIdentity("student")).toMatchObject({
      displayName: "",
      avatarDataUrl: null,
    });
    expect(getStoredProfilePreferences("student")).toBeNull();
  });

  it("persists public visibility choices with the profile", () => {
    saveProfilePreferences("student", {
      displayName: "Avery Patel",
      avatarDataUrl: "/assets/sofia-avatar.jpg",
      emailPublic: true,
      mobilePublic: true,
      linkedinPublic: false,
      githubPublic: true,
      websitePublic: false,
    });

    expect(getProfileIdentity("student")).toMatchObject({
      emailPublic: false,
      mobilePublic: false,
      linkedinPublic: false,
      githubPublic: false,
      websitePublic: false,
    });
  });
});
