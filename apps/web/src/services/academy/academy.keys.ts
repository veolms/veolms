export const academyKeys = {
  all: ["academy"] as const,
  brand: () => [...academyKeys.all, "brand"] as const,
  publicBrand: () => [...academyKeys.all, "public-brand"] as const,
};
