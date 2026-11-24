export const questionAiKeys = {
  all: ["question-ai"] as const,
  latestJob: (courseId: string) =>
    [...questionAiKeys.all, "latest-job", courseId] as const,
};
