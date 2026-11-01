export const platformKeys = {
  all: ["platform"] as const,
  settings: () => [...platformKeys.all, "settings"] as const,
  publicSettings: () => [...platformKeys.all, "public-settings"] as const,
};
