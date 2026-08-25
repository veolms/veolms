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

const PROFILE_DEFAULTS: Readonly<Record<ProfileRole, ProfileIdentity>> = {
  student: {
    displayName: "Ashi Singh",
    email: "ashi.singh@example.com",
    avatarDataUrl: "/assets/sofia-avatar-160.webp",
    username: "ashisingh",
    bio: "Computer science student and aspiring developer.\nBuilding projects, sharing learnings, and helping others grow.",
    mobileNumber: "+91 98765 43210",
    mobileVerified: true,
    mobilePublic: false,
    emailPublic: false,
    linkedinUrl: "linkedin.com/in/ashi-singh",
    linkedinPublic: true,
    githubUrl: "github.com/ashisingh",
    githubPublic: true,
    websitePublic: true,
    websiteUrl: "ashisingh.dev",
    roleLabel: "Student",
  },
  creator: {
    displayName: "Anurag Singh",
    email: "anurag.singh@example.com",
    avatarDataUrl: "/assets/ethan-avatar-160.webp",
    username: "anuragdev",
    bio: "Instructor, builder, and lifelong learner.\nSharing practical lessons for the next generation of developers.",
    mobileNumber: "+91 98765 43210",
    mobileVerified: true,
    mobilePublic: false,
    emailPublic: false,
    linkedinUrl: "linkedin.com/in/anurag-singh",
    linkedinPublic: true,
    githubUrl: "github.com/anuragdev",
    githubPublic: true,
    websitePublic: true,
    websiteUrl: "anurag.dev",
    roleLabel: "Instructor",
  },
};

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
  const defaults = PROFILE_DEFAULTS[role];
  if (typeof window === "undefined") return { ...defaults };

  try {
    const storedValue = window.localStorage.getItem(PROFILE_STORAGE_KEYS[role]);
    if (!storedValue) return { ...defaults };

    const parsedValue: unknown = JSON.parse(storedValue);
    if (typeof parsedValue !== "object" || parsedValue === null)
      return { ...defaults };

    const storedProfile = parsedValue as Partial<ProfilePreferences>;
    const mobileNumber =
      typeof storedProfile.mobileNumber === "string"
        ? storedProfile.mobileNumber
        : defaults.mobileNumber;
    return {
      ...defaults,
      displayName:
        typeof storedProfile.displayName === "string" &&
        storedProfile.displayName.trim()
          ? storedProfile.displayName
          : defaults.displayName,
      avatarDataUrl: isStoredAvatar(storedProfile.avatarDataUrl)
        ? storedProfile.avatarDataUrl
        : defaults.avatarDataUrl,
      username:
        typeof storedProfile.username === "string"
          ? storedProfile.username
          : defaults.username,
      bio:
        typeof storedProfile.bio === "string" ? storedProfile.bio : defaults.bio,
      mobileNumber,
      mobileVerified: Boolean(
        mobileNumber && storedProfile.mobileVerified === true,
      ),
      mobilePublic:
        typeof storedProfile.mobilePublic === "boolean"
          ? storedProfile.mobilePublic
          : defaults.mobilePublic,
      emailPublic:
        typeof storedProfile.emailPublic === "boolean"
          ? storedProfile.emailPublic
          : defaults.emailPublic,
      linkedinUrl:
        typeof storedProfile.linkedinUrl === "string"
          ? storedProfile.linkedinUrl
          : defaults.linkedinUrl,
      linkedinPublic:
        typeof storedProfile.linkedinPublic === "boolean"
          ? storedProfile.linkedinPublic
          : defaults.linkedinPublic,
      githubUrl:
        typeof storedProfile.githubUrl === "string"
          ? storedProfile.githubUrl
          : defaults.githubUrl,
      githubPublic:
        typeof storedProfile.githubPublic === "boolean"
          ? storedProfile.githubPublic
          : defaults.githubPublic,
      websitePublic:
        typeof storedProfile.websitePublic === "boolean"
          ? storedProfile.websitePublic
          : defaults.websitePublic,
      websiteUrl:
        typeof storedProfile.websiteUrl === "string"
          ? storedProfile.websiteUrl
          : defaults.websiteUrl,
    };
  } catch {
    return { ...defaults };
  }
};

export const getDefaultProfileIdentity = (
  role: ProfileRole,
): ProfileIdentity => ({ ...PROFILE_DEFAULTS[role] });

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
