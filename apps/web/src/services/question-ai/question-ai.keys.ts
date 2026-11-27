export const questionAiKeys = {
  all: ["question-ai"] as const,
  estimate: (courseId: string, settings: string) =>
    [...questionAiKeys.all, "estimate", courseId, settings] as const,
  latestJob: (courseId: string) =>
    [...questionAiKeys.all, "latest-job", courseId] as const,
};
