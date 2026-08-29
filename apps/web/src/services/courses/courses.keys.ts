export const courseKeys = {
  all: ["courses"] as const,
  lists: () => [...courseKeys.all, "list"] as const,
  mine: () => [...courseKeys.all, "mine"] as const,
  details: () => [...courseKeys.all, "detail"] as const,
  detail: (slug: string) => [...courseKeys.details(), slug] as const,
  overview: (idOrSlug: string) => [...courseKeys.all, "overview", idOrSlug] as const,
  editor: (id: string) => [...courseKeys.all, "editor", id] as const,
  preview: (id: string) => [...courseKeys.all, "preview", id] as const,
  validation: (id: string) => [...courseKeys.all, "validation", id] as const,
  categories: () => [...courseKeys.all, "categories"] as const,
  bin: () => [...courseKeys.all, "bin"] as const,
};
