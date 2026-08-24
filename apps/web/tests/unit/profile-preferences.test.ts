import { beforeEach, describe, expect, it } from "vitest";
import {
  getProfileIdentity,
  getStoredProfilePreferences,
  getProfileStorageKey,
  saveProfilePreferences,
} from "../../src/settings/profilePreferences.js";

describe("academy-local profile preferences", () => {
  beforeEach(() => localStorage.clear());

  it("keeps role defaults independent", () => {
    expect(getProfileIdentity("student")).toMatchObject({
      displayName: "Ashi Singh",
      roleLabel: "Student",
      avatarDataUrl: "/assets/sofia-avatar-160.webp",
    });
    expect(getProfileIdentity("creator")).toMatchObject({
      displayName: "Anurag Singh",
      roleLabel: "Instructor",
      avatarDataUrl: "/assets/ethan-avatar-160.webp",
    });
  });

  it("persists only the editable profile for the selected role", () => {
    expect(
      saveProfilePreferences("student", {
        displayName: "Avery Patel",
        avatarDataUrl: null,
      }),
    ).toBe(true);

    expect(getProfileIdentity("student")).toMatchObject({
      displayName: "Avery Patel",
      avatarDataUrl: null,
      roleLabel: "Student",
    });
    expect(getProfileIdentity("creator").displayName).toBe("Anurag Singh");
    expect(getStoredProfilePreferences("student")).toEqual({
      displayName: "Avery Patel",
      avatarDataUrl: null,
    });
    expect(getStoredProfilePreferences("creator")).toBeNull();
  });

  it("repairs invalid or incomplete stored data from role defaults", () => {
    localStorage.setItem(getProfileStorageKey("student"), "{");
    expect(getProfileIdentity("student").displayName).toBe("Ashi Singh");

    localStorage.setItem(
      getProfileStorageKey("student"),
      JSON.stringify({
        displayName: "   ",
        avatarDataUrl: 42,
      }),
    );
    expect(getProfileIdentity("student")).toMatchObject({
      displayName: "Ashi Singh",
      avatarDataUrl: "/assets/sofia-avatar-160.webp",
    });
    expect(getStoredProfilePreferences("student")).toBeNull();
  });

  it("persists public visibility choices with the profile", () => {
    saveProfilePreferences("student", {
      displayName: "Ashi Singh",
      avatarDataUrl: "/assets/sofia-avatar.jpg",
      emailPublic: true,
      mobilePublic: true,
      linkedinPublic: false,
      githubPublic: true,
      websitePublic: false,
    });

    expect(getProfileIdentity("student")).toMatchObject({
      emailPublic: true,
      mobilePublic: true,
      linkedinPublic: false,
      githubPublic: true,
      websitePublic: false,
    });
  });
});
