export const aiKeys = {
  all: ["ai"] as const,
  settings: () => [...aiKeys.all, "settings"] as const,
  availability: () => [...aiKeys.all, "availability"] as const,
};
