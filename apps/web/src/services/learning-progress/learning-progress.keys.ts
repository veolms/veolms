export const learningProgressKeys = {
  all: ["learning-progress"] as const,
  course: (courseKey: string) =>
    [...learningProgressKeys.all, courseKey] as const,
};
