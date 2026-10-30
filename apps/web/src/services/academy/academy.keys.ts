export const academyKeys = {
  all: ["academy"] as const,
  brand: () => [...academyKeys.all, "brand"] as const,
};
