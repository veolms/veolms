export const quizKeys = {
  all: ["quizzes"] as const,
  mine: () => [...quizKeys.all, "mine"] as const,
  detail: (id: string) => [...quizKeys.all, "detail", id] as const,
  assignments: () => [...quizKeys.all, "assignments"] as const,
  mineAssignments: () => [...quizKeys.assignments(), "mine"] as const,
  coursePricing: (courseId: string) =>
    [...quizKeys.all, "course-pricing", courseId] as const,
  courseAssignments: (courseId: string) =>
    [...quizKeys.assignments(), "course", courseId] as const,
  attempt: (id: string) => [...quizKeys.all, "attempt", id] as const,
  result: (id: string) => [...quizKeys.all, "result", id] as const,
  history: () => [...quizKeys.all, "history"] as const,
  analytics: (assignmentId: string) =>
    [...quizKeys.all, "analytics", assignmentId] as const,
  courseAnalytics: (courseId: string) =>
    [...quizKeys.all, "course-analytics", courseId] as const,
  studentReport: (studentId: string) =>
    [...quizKeys.all, "student-report", studentId] as const,
  pricingPreview: (courseId: string, assignmentId: string) =>
    [...quizKeys.assignments(), "pricing-preview", courseId, assignmentId] as const,
};
