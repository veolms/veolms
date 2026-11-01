export const learningGoalKeys = {
  all: ["learning-goals"] as const,
  summary: () => [...learningGoalKeys.all, "summary"] as const,
  settings: () => [...learningGoalKeys.all, "settings"] as const,
  /** Every range of anyone's history. */
  histories: () => [...learningGoalKeys.all, "history"] as const,
  /** One learner's days in a range; no username is the viewer's own. */
  history: (username: string | null, from: string, to: string) =>
    [...learningGoalKeys.histories(), username ?? "", from, to] as const,
  community: () => [...learningGoalKeys.all, "community"] as const,
};
