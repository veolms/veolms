export const affiliatesKeys = {
  all: ["affiliates"] as const,
  program: () => [...affiliatesKeys.all, "program"] as const,
};
