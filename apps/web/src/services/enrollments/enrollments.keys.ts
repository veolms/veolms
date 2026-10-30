export const enrollmentKeys = {
  all: ["enrollments"] as const,
  courses: () => [...enrollmentKeys.all, "courses"] as const,
  recent: (limit: number) => [...enrollmentKeys.all, "recent", limit] as const,
};
