export const websiteKeys = {
  all: ["website"] as const,
  overview: () => [...websiteKeys.all, "overview"] as const,
  page: (id: string) => [...websiteKeys.all, "page", id] as const,
  courseCards: () => [...websiteKeys.all, "course-cards"] as const,
};
