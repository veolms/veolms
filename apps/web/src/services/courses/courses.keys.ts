export const courseKeys = {
  all: ["courses"] as const,
  lists: () => [...courseKeys.all, "list"] as const,
  details: () => [...courseKeys.all, "detail"] as const,
  detail: (slug: string) => [...courseKeys.details(), slug] as const,
};
