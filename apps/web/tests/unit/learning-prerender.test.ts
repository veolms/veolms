import { describe, expect, it } from "vitest";
import {
  createLearningPrerenderPaths,
  PRERENDERED_LEARNING_COURSE_SLUGS,
} from "../../src/learning/prerenderLearningPaths";
import {
  getLessonSlug,
  lessonSequence,
  sections,
} from "../../src/learning/courseContent";

describe("learning page prerender paths", () => {
  it("renders every lecture in the first section during test builds", () => {
    const paths = createLearningPrerenderPaths({ scope: "first-section" });
    const firstSectionLectureCount = sections[0]!.lessons.length;

    expect(paths).toHaveLength(
      PRERENDERED_LEARNING_COURSE_SLUGS.length * (firstSectionLectureCount + 1),
    );
    expect(paths).toContain("/learn/backend-nodejs");
    expect(paths).toContain("/learn/backend-nodejs/career-opportunities");
    expect(paths).not.toContain(
      "/learn/backend-nodejs/understanding-your-users",
    );
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("can expand the same generator to every curriculum lecture", () => {
    const paths = createLearningPrerenderPaths({ scope: "all-lectures" });
    const lastLessonId = lessonSequence.at(-1)!;

    expect(paths).toHaveLength(
      PRERENDERED_LEARNING_COURSE_SLUGS.length * (lessonSequence.length + 1),
    );
    expect(paths).toContain(
      `/learn/backend-nodejs/${getLessonSlug(lastLessonId)}`,
    );
    expect(new Set(paths).size).toBe(paths.length);
  });
});
