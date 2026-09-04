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

const PROFILE_STORAGE_KEYS: Readonly<Record<ProfileRole, string>> = {
  student: "veolms-profile-student",
  creator: "veolms-profile-creator",
};
const PROFILE_DRAFT_STORAGE_PREFIX = "veolms-profile-draft";

const getEmptyProfileIdentity = (role: ProfileRole): ProfileIdentity => ({
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

const isStoredAvatar = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

export const getStoredProfilePreferences = (
  role: ProfileRole,
): ProfilePreferences | null => {
  if (typeof window === "undefined") return null;

  try {
    const storedValue = window.localStorage.getItem(PROFILE_STORAGE_KEYS[role]);
    if (!storedValue) return null;

    const parsedValue: unknown = JSON.parse(storedValue);
    if (typeof parsedValue !== "object" || parsedValue === null) return null;

    const storedProfile = parsedValue as Partial<ProfilePreferences>;
    if (
      typeof storedProfile.displayName !== "string" ||
      !storedProfile.displayName.trim() ||
      !isStoredAvatar(storedProfile.avatarDataUrl)
    )
      return null;

    return {
      displayName: storedProfile.displayName.trim(),
      avatarDataUrl: storedProfile.avatarDataUrl,
      ...(typeof storedProfile.username === "string"
        ? { username: storedProfile.username }
        : {}),
      ...(typeof storedProfile.bio === "string"
        ? { bio: storedProfile.bio }
        : {}),
      ...(typeof storedProfile.mobileNumber === "string"
        ? { mobileNumber: storedProfile.mobileNumber }
        : {}),
      ...(typeof storedProfile.mobileVerified === "boolean"
        ? { mobileVerified: storedProfile.mobileVerified }
        : {}),
      ...(typeof storedProfile.mobilePublic === "boolean"
        ? { mobilePublic: storedProfile.mobilePublic }
        : {}),
      ...(typeof storedProfile.emailPublic === "boolean"
        ? { emailPublic: storedProfile.emailPublic }
        : {}),
      ...(typeof storedProfile.linkedinUrl === "string"
        ? { linkedinUrl: storedProfile.linkedinUrl }
        : {}),
      ...(typeof storedProfile.linkedinPublic === "boolean"
        ? { linkedinPublic: storedProfile.linkedinPublic }
        : {}),
      ...(typeof storedProfile.githubUrl === "string"
        ? { githubUrl: storedProfile.githubUrl }
        : {}),
      ...(typeof storedProfile.githubPublic === "boolean"
        ? { githubPublic: storedProfile.githubPublic }
        : {}),
      ...(typeof storedProfile.websitePublic === "boolean"
        ? { websitePublic: storedProfile.websitePublic }
        : {}),
      ...(typeof storedProfile.websiteUrl === "string"
        ? { websiteUrl: storedProfile.websiteUrl }
        : {}),
    };
  } catch {
    return null;
  }
};

export const getProfileIdentity = (role: ProfileRole): ProfileIdentity => {
  // Profile identity is server-owned. This helper remains as an empty-state
  // factory for settings previews and must never invent a demo account.
  return getEmptyProfileIdentity(role);
};

export const getDefaultProfileIdentity = (role: ProfileRole): ProfileIdentity =>
  getEmptyProfileIdentity(role);

export const saveProfilePreferences = (
  role: ProfileRole,
  profile: ProfilePreferences,
): boolean => {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      PROFILE_STORAGE_KEYS[role],
      JSON.stringify(profile),
    );
    return true;
  } catch {
    return false;
  }
};

export const clearStoredProfilePreferences = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PROFILE_STORAGE_KEYS.student);
    window.localStorage.removeItem(PROFILE_STORAGE_KEYS.creator);
  } catch {
    // ignore
  }
};

export const getProfileStorageKey = (role: ProfileRole) =>
  PROFILE_STORAGE_KEYS[role];

export const getProfileDraftStorageKey = (role: ProfileRole, userId: string) =>
  `${PROFILE_DRAFT_STORAGE_PREFIX}-${role}-${encodeURIComponent(userId)}`;

const parseStoredProfileDraft = (value: unknown): ProfilePreferences | null => {
  if (typeof value !== "object" || value === null) return null;

  const candidate =
    "profile" in value && typeof value.profile === "object" && value.profile
      ? value.profile
      : value;
  if (typeof candidate !== "object" || candidate === null) return null;

  const storedProfile = candidate as Partial<ProfilePreferences>;
  if (
    typeof storedProfile.displayName !== "string" ||
    !isStoredAvatar(storedProfile.avatarDataUrl)
  )
    return null;

  return {
    displayName: storedProfile.displayName,
    avatarDataUrl: storedProfile.avatarDataUrl,
    ...(typeof storedProfile.username === "string"
      ? { username: storedProfile.username }
      : {}),
    ...(typeof storedProfile.bio === "string"
      ? { bio: storedProfile.bio }
      : {}),
    ...(typeof storedProfile.mobileNumber === "string"
      ? { mobileNumber: storedProfile.mobileNumber }
      : {}),
    ...(typeof storedProfile.mobileVerified === "boolean"
      ? { mobileVerified: storedProfile.mobileVerified }
      : {}),
    ...(typeof storedProfile.mobilePublic === "boolean"
      ? { mobilePublic: storedProfile.mobilePublic }
      : {}),
    ...(typeof storedProfile.emailPublic === "boolean"
      ? { emailPublic: storedProfile.emailPublic }
      : {}),
    ...(typeof storedProfile.linkedinUrl === "string"
      ? { linkedinUrl: storedProfile.linkedinUrl }
      : {}),
    ...(typeof storedProfile.linkedinPublic === "boolean"
      ? { linkedinPublic: storedProfile.linkedinPublic }
      : {}),
    ...(typeof storedProfile.githubUrl === "string"
      ? { githubUrl: storedProfile.githubUrl }
      : {}),
    ...(typeof storedProfile.githubPublic === "boolean"
      ? { githubPublic: storedProfile.githubPublic }
      : {}),
    ...(typeof storedProfile.websitePublic === "boolean"
      ? { websitePublic: storedProfile.websitePublic }
      : {}),
    ...(typeof storedProfile.websiteUrl === "string"
      ? { websiteUrl: storedProfile.websiteUrl }
      : {}),
  };
};

export const getStoredProfileDraft = (
  role: ProfileRole,
  userId: string,
): ProfilePreferences | null => {
  if (typeof window === "undefined") return null;

  try {
    const storedValue = window.localStorage.getItem(
      getProfileDraftStorageKey(role, userId),
    );
    return storedValue
      ? parseStoredProfileDraft(JSON.parse(storedValue))
      : null;
  } catch {
    return null;
  }
};

export const saveProfileDraft = (
  role: ProfileRole,
  userId: string,
  profile: ProfilePreferences,
): boolean => {
  if (typeof window === "undefined") return false;

  try {
    window.localStorage.setItem(
      getProfileDraftStorageKey(role, userId),
      JSON.stringify({ version: 1, updatedAt: Date.now(), profile }),
    );
    return true;
  } catch {
    return false;
  }
};

export const clearStoredProfileDraft = (
  role: ProfileRole,
  userId: string,
): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getProfileDraftStorageKey(role, userId));
  } catch {
    // ignore
  }
};
