export const learningGoalKeys = {
  all: ["learning-goals"] as const,
  summary: () => [...learningGoalKeys.all, "summary"] as const,
  settings: () => [...learningGoalKeys.all, "settings"] as const,
};
