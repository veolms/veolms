export const courseKeys = {
  all: ["courses"] as const,
  lists: () => [...courseKeys.all, "list"] as const,
  mine: () => [...courseKeys.all, "mine"] as const,
  details: () => [...courseKeys.all, "detail"] as const,
  detail: (slug: string) => [...courseKeys.details(), slug] as const,
  editor: (id: string) => [...courseKeys.all, "editor", id] as const,
  categories: () => [...courseKeys.all, "categories"] as const,
};
