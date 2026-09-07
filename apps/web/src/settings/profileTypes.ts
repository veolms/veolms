export type ProfileRole = "student" | "creator";

export interface ProfilePreferences {
  displayName: string;
  avatarDataUrl: string | null;
  username?: string;
  bio?: string;
  mobileNumber?: string;
  mobileVerified?: boolean;
  mobilePublic?: boolean;
  emailPublic?: boolean;
  linkedinUrl?: string;
  linkedinPublic?: boolean;
  githubUrl?: string;
  githubPublic?: boolean;
  websitePublic?: boolean;
  websiteUrl?: string;
}

export interface ProfileIdentity extends ProfilePreferences {
  email: string;
  roleLabel: string;
}

export const getDefaultProfileIdentity = (
  role: ProfileRole,
): ProfileIdentity => ({
  displayName: "",
  email: "",
  avatarDataUrl: null,
  username: "",
  bio: "",
  mobileNumber: "",
  mobileVerified: false,
  mobilePublic: false,
  emailPublic: false,
  linkedinUrl: "",
  linkedinPublic: false,
  githubUrl: "",
  githubPublic: false,
  websitePublic: false,
  websiteUrl: "",
  roleLabel: role === "creator" ? "Instructor" : "Student",
});

export const getProfileIdentity = getDefaultProfileIdentity;
