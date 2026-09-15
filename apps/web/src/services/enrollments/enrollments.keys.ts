export const enrollmentKeys = {
  all: ["enrollments"] as const,
  courses: () => [...enrollmentKeys.all, "courses"] as const,
};
