import { describe, expect, it } from "vitest";
import {
  applyPersistentMiniPlayerLessonChange,
  buildPersistentMiniPlayerLessonSequence,
  resolveLearningMiniPlayerLessonPath,
} from "../../src/learning/player/persistentMiniPlayerLesson.js";
import type { PersistentLearningPlayerRegistration } from "../../src/learning/player/PersistentLearningPlayerHost.js";
import { getCourseVideoForLesson } from "../../src/learning/courseContent.js";

const createRegistration = (
  selectedLesson = 1,
): PersistentLearningPlayerRegistration => ({
  anchor: null,
  courseRouteKey: "backend-nodejs",
  lessonPath: "/learn/backend-nodejs/the-beginning-of-a-design-journey?from=courses&returnTo=%2Fcourses",
  mediaKey: "backend-nodejs-lesson-1",
  returnPath: "/courses",
  selectedLesson,
  playerProps: {
    lessonTitle: "The Beginning of a Design Journey",
    media: getCourseVideoForLesson(selectedLesson),
    lessonIndex: selectedLesson,
    totalLessons: 10,
    canGoNext: true,
    canGoPrevious: false,
    theaterMode: false,
    onTheaterToggle: () => {},
  },
});

describe("persistentMiniPlayerLesson", () => {
  it("builds the default lesson sequence from registration curriculum", () => {
    const sequence = buildPersistentMiniPlayerLessonSequence(
      createRegistration(),
    );

    expect(sequence.length).toBeGreaterThan(1);
    expect(sequence[0]).toBe(1);
  });

  it("updates registration in place without navigating", () => {
    const registration = createRegistration(1);
    const updated = applyPersistentMiniPlayerLessonChange(registration, 2);

    expect(updated).not.toBeNull();
    expect(updated?.selectedLesson).toBe(2);
    expect(updated?.playerProps.lessonTitle).toBe("What is UI/UX Design?");
    expect(updated?.playerProps.media.fileName).toBe(
      getCourseVideoForLesson(2).fileName,
    );
    expect(updated?.lessonPath).toContain("/learn/backend-nodejs/");
    expect(updated?.lessonPath).toContain("what-is-ui-ux-design");
    expect(updated?.playerProps.canGoPrevious).toBe(true);
    expect(updated?.playerProps.autoPlayOnMediaChange).toBe(true);
  });

  it("returns null when selecting the current lesson", () => {
    const registration = createRegistration(3);
    expect(applyPersistentMiniPlayerLessonChange(registration, 3)).toBeNull();
  });

  it("rewrites stale course/learning restore paths onto /learn", () => {
    const path = resolveLearningMiniPlayerLessonPath({
      courseRouteKey: "backend-nodejs",
      lessonNumber: 4,
      lessonPath: "/courses/backend-nodejs/learning/tools-overview",
    });

    expect(path).toContain("/learn/backend-nodejs/");
    expect(path).toContain("tools-overview");
    expect(path).not.toContain("/courses/backend-nodejs/learning/");
  });
});
