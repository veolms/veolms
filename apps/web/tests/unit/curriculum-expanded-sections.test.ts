import { describe, expect, it } from "vitest";
import {
  sections as defaultSections,
} from "../../src/learning/courseContent";
import {
  getCurriculumSectionForLesson,
  getInitialCurriculumExpandedSections,
} from "../../src/learning/curriculumExpandedSections";

describe("curriculumExpandedSections", () => {
  it("expands only the current section by default in compact mini player mode", () => {
    expect(
      getInitialCurriculumExpandedSections(defaultSections, 15, {
        hideHero: true,
      }),
    ).toEqual([3]);
  });

  it("keeps the default workspace expansion for the full curriculum hero", () => {
    expect(
      getInitialCurriculumExpandedSections(defaultSections, 15, {
        hideHero: false,
      }),
    ).toEqual([1, 2]);
  });

  it("resolves the section that owns a lesson", () => {
    expect(getCurriculumSectionForLesson(defaultSections, 15)?.id).toBe(3);
  });
});
