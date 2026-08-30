import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CURRICULUM_TEST_PREFERENCES_DEFAULTS,
  CURRICULUM_TEST_PREFERENCES_EVENT,
  CURRICULUM_TEST_PREFERENCES_KEY,
  normalizeCurriculumTestPreferences,
  persistCurriculumTestPreferences,
  readCurriculumTestPreferences,
} from "../../src/learning/curriculumTestPreferences.js";

describe("curriculum test preferences", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("uses session-only defaults and clamps custom counts", () => {
    expect(readCurriculumTestPreferences()).toEqual(
      CURRICULUM_TEST_PREFERENCES_DEFAULTS,
    );
    expect(
      normalizeCurriculumTestPreferences({
        sectionCount: 500,
        lectureCount: -10,
      }),
    ).toEqual({ sectionCount: 50, lectureCount: 10 });
  });

  it("persists normalized values and announces same-tab changes", () => {
    const listener = vi.fn();
    window.addEventListener(CURRICULUM_TEST_PREFERENCES_EVENT, listener);

    expect(
      persistCurriculumTestPreferences({
        sectionCount: 32,
        lectureCount: 600,
      }),
    ).toEqual({ sectionCount: 32, lectureCount: 600 });
    expect(
      JSON.parse(sessionStorage.getItem(CURRICULUM_TEST_PREFERENCES_KEY) || ""),
    ).toEqual({ sectionCount: 32, lectureCount: 600 });
    expect(readCurriculumTestPreferences()).toEqual({
      sectionCount: 32,
      lectureCount: 600,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(CURRICULUM_TEST_PREFERENCES_EVENT, listener);
  });

  it("falls back safely when stored test data is malformed", () => {
    sessionStorage.setItem(CURRICULUM_TEST_PREFERENCES_KEY, "{");
    expect(readCurriculumTestPreferences()).toEqual(
      CURRICULUM_TEST_PREFERENCES_DEFAULTS,
    );
  });
});
