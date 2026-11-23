export const codingKeys = {
  all: ["coding-practice"] as const,
  courseExercises: (courseId: string) =>
    [...codingKeys.all, "course-exercises", courseId] as const,
  exercise: (id: string) => [...codingKeys.all, "exercise", id] as const,
  coursePractice: (courseId: string) =>
    [...codingKeys.all, "course-practice", courseId] as const,
  lecturePractice: (courseId: string, lessonId: string) =>
    [...codingKeys.all, "lecture-practice", courseId, lessonId] as const,
  practice: (assignmentId: string) =>
    [...codingKeys.all, "practice", assignmentId] as const,
  solution: (assignmentId: string) =>
    [...codingKeys.all, "solution", assignmentId] as const,
  submissions: (assignmentId: string) =>
    [...codingKeys.all, "submissions", assignmentId] as const,
  stats: (courseId: string | null) =>
    [...codingKeys.all, "stats", courseId ?? "all"] as const,
  practiceCourses: () => [...codingKeys.all, "practice-courses"] as const,
  analytics: (assignmentId: string) =>
    [...codingKeys.all, "analytics", assignmentId] as const,
  learnerSubmissions: (assignmentId: string, studentId: string) =>
    [
      ...codingKeys.all,
      "learner-submissions",
      assignmentId,
      studentId,
    ] as const,
};
