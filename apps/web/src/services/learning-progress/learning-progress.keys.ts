export const learningProgressKeys = {
  all: ["learning-progress"] as const,
  course: (courseKey: string) => [...learningProgressKeys.all, courseKey] as const,
  resumeContext: (courseKey: string) =>
    [...learningProgressKeys.all, "resume-context", courseKey] as const,
};
