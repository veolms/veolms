export const homeKeys = {
  all: ["home"] as const,
  discovery: () => [...homeKeys.all, "discovery"] as const,
};
