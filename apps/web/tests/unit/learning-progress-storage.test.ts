import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_LEARNING_PROGRESS_STATE,
  getLearningProgressMap,
  getPendingLearningProgress,
  markLearningProgressSynced,
  mergeServerLearningProgress,
  readLearningProgress,
  recordLearningProgress,
  writeLearningProgress,
} from "../../src/learning/learningProgressStorage";

describe("learning progress browser outbox", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps progress monotonic and does not dirty a synced item repeatedly", () => {
    const first = recordLearningProgress(EMPTY_LEARNING_PROGRESS_STATE, {
      lessonId: "11111111-1111-4111-8111-111111111111",
      lessonNumber: 1,
      progressPercent: 40,
    });
    const synced = markLearningProgressSynced(first, [
      ...getPendingLearningProgress(first),
    ]);
    const repeated = recordLearningProgress(synced, {
      lessonId: "11111111-1111-4111-8111-111111111111",
      lessonNumber: 1,
      progressPercent: 40,
    });

    expect(repeated).toBe(synced);
    expect(getPendingLearningProgress(repeated)).toEqual([]);
    expect(
      recordLearningProgress(repeated, {
        lessonId: "11111111-1111-4111-8111-111111111111",
        lessonNumber: 1,
        progressPercent: 20,
      }),
    ).toBe(repeated);
  });

  it("merges server progress without overwriting newer local work", () => {
    const local = recordLearningProgress(EMPTY_LEARNING_PROGRESS_STATE, {
      lessonId: "22222222-2222-4222-8222-222222222222",
      lessonNumber: 2,
      progressPercent: 70,
    });
    const merged = mergeServerLearningProgress(local, [
      {
        lessonId: "22222222-2222-4222-8222-222222222222",
        lessonNumber: 2,
        progressPercent: 50,
      },
      {
        lessonId: "33333333-3333-4333-8333-333333333333",
        lessonNumber: 3,
        progressPercent: 100,
      },
    ]);

    expect(getLearningProgressMap(merged)).toEqual({ 2: 70, 3: 100 });
    expect(getPendingLearningProgress(merged)).toHaveLength(1);
    expect(getPendingLearningProgress(merged)[0]?.lessonId).toBe(
      "22222222-2222-4222-8222-222222222222",
    );
  });

  it("stores progress under an account-and-course scoped browser key", () => {
    const state = recordLearningProgress(EMPTY_LEARNING_PROGRESS_STATE, {
      lessonNumber: 1,
      progressPercent: 25,
    });

    writeLearningProgress("user-a", "course-a", state);

    expect(readLearningProgress("user-a", "course-a")).toEqual(state);
    expect(readLearningProgress("user-b", "course-a")).toEqual(
      EMPTY_LEARNING_PROGRESS_STATE,
    );
    expect(readLearningProgress("user-a", "course-b")).toEqual(
      EMPTY_LEARNING_PROGRESS_STATE,
    );
  });
});
