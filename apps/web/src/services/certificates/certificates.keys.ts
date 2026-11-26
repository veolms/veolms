export const certificatesKeys = {
  all: ["certificates"] as const,
  courseStatus: (courseKey: string) =>
    [...certificatesKeys.all, "course-status", courseKey] as const,
  mine: () => [...certificatesKeys.all, "mine"] as const,
  public: (code: string) =>
    [...certificatesKeys.all, "public", code.toUpperCase()] as const,
  designs: () => [...certificatesKeys.all, "designs"] as const,
  course: (courseId: string, q: string) =>
    [...certificatesKeys.all, "course", courseId, q] as const,
};
