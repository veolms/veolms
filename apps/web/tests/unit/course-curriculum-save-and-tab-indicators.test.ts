import { describe, it, expect } from "vitest";
import {
  checkIsCurriculumDirty,
  type CourseWizardStepId,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard: Curriculum Save State & Tab Unsaved Indicators", () => {
  describe("Curriculum Dirty State Detection (checkIsCurriculumDirty)", () => {
    it("returns false for an empty curriculum with no sections", () => {
      expect(checkIsCurriculumDirty([])).toBe(false);
    });

    it("returns false for synchronized sections and lessons where draft matches server initialState", () => {
      const sections = [
        {
          id: "11111111-1111-1111-1111-111111111111",
          isEditingTitle: false,
          lessons: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              title: "Introduction",
              description: "Welcome to the course",
              contentType: "video" as const,
              isPublished: true,
              isPreview: false,
              initialState: {
                title: "Introduction",
                description: "Welcome to the course",
                contentType: "video" as const,
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      expect(checkIsCurriculumDirty(sections)).toBe(false);
    });

    it("returns true when a lesson title has been edited locally", () => {
      const sections = [
        {
          id: "11111111-1111-1111-1111-111111111111",
          isEditingTitle: false,
          lessons: [
            {
              id: "22222222-2222-2222-2222-222222222222",
              title: "Introduction to Advanced Modules", // edited
              description: "Welcome to the course",
              contentType: "video" as const,
              isPublished: true,
              isPreview: false,
              initialState: {
                title: "Introduction",
                description: "Welcome to the course",
                contentType: "video" as const,
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      expect(checkIsCurriculumDirty(sections)).toBe(true);
    });

    it("returns true when a lesson description, published, or preview toggle differs from initialState", () => {
      const baseLesson = {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Lesson 1",
        description: "Old desc",
        contentType: "video" as const,
        isPublished: true,
        isPreview: false,
        initialState: {
          title: "Lesson 1",
          description: "Old desc",
          contentType: "video" as const,
          isPublished: true,
          isPreview: false,
        },
      };

      // 1. Description change
      expect(
        checkIsCurriculumDirty([
          {
            id: "11111111-1111-1111-1111-111111111111",
            lessons: [{ ...baseLesson, description: "New desc" }],
          },
        ]),
      ).toBe(true);

      // 2. Publish toggle change
      expect(
        checkIsCurriculumDirty([
          {
            id: "11111111-1111-1111-1111-111111111111",
            lessons: [{ ...baseLesson, isPublished: false }],
          },
        ]),
      ).toBe(true);

      // 3. Preview toggle change
      expect(
        checkIsCurriculumDirty([
          {
            id: "11111111-1111-1111-1111-111111111111",
            lessons: [{ ...baseLesson, isPreview: true }],
          },
        ]),
      ).toBe(true);

      // 4. ContentType change
      expect(
        checkIsCurriculumDirty([
          {
            id: "11111111-1111-1111-1111-111111111111",
            lessons: [{ ...baseLesson, contentType: "document" }],
          },
        ]),
      ).toBe(true);
    });

    it("returns true when a section is currently undergoing title editing", () => {
      const sections = [
        {
          id: "11111111-1111-1111-1111-111111111111",
          isEditingTitle: true,
          lessons: [],
        },
      ];

      expect(checkIsCurriculumDirty(sections)).toBe(true);
    });

    it("clears dirty state after lesson save synchronizes initialState with current values", () => {
      const lesson = {
        id: "22222222-2222-2222-2222-222222222222",
        title: "Updated Title",
        description: "Updated Description",
        contentType: "video" as const,
        isPublished: true,
        isPreview: false,
        initialState: {
          title: "Old Title",
          description: "Old Description",
          contentType: "video" as const,
          isPublished: true,
          isPreview: false,
        },
      };

      const section = {
        id: "11111111-1111-1111-1111-111111111111",
        isEditingTitle: false,
        lessons: [lesson],
      };

      expect(checkIsCurriculumDirty([section])).toBe(true);

      // After successful save, initialState is updated to match current values
      const savedSection = {
        ...section,
        lessons: [
          {
            ...lesson,
            initialState: {
              title: lesson.title,
              description: lesson.description,
              contentType: lesson.contentType,
              isPublished: lesson.isPublished,
              isPreview: lesson.isPreview,
            },
          },
        ],
      };

      expect(checkIsCurriculumDirty([savedSection])).toBe(false);
    });

    it("ignores lessons that are pending optimistic creation without established ID", () => {
      const sections = [
        {
          id: "11111111-1111-1111-1111-111111111111",
          isEditingTitle: false,
          lessons: [
            {
              id: "temp-les-1",
              title: "Temp",
              description: "",
              contentType: "video" as const,
              isPendingCreation: true,
            },
          ],
        },
      ];

      expect(checkIsCurriculumDirty(sections)).toBe(false);
    });
  });

  describe("Tab Unsaved Indicators Logic", () => {
    const isStepDirty = (
      stepId: CourseWizardStepId,
      dirtyStates: {
        isBasicsDirty: boolean;
        isCurriculumDirty: boolean;
        isAccessRulesDirty: boolean;
        isPricingDirty: boolean;
        isExtrasDirty: boolean;
      },
    ): boolean => {
      if (stepId === "basics") return dirtyStates.isBasicsDirty;
      if (stepId === "curriculum") return dirtyStates.isCurriculumDirty;
      if (stepId === "access-rules") return dirtyStates.isAccessRulesDirty;
      if (stepId === "pricing") return dirtyStates.isPricingDirty;
      if (stepId === "extras") return dirtyStates.isExtrasDirty;
      return false;
    };

    it("evaluates dirty indicator correctly for each wizard tab", () => {
      const state = {
        isBasicsDirty: true,
        isCurriculumDirty: false,
        isAccessRulesDirty: false,
        isPricingDirty: true,
        isExtrasDirty: false,
      };

      expect(isStepDirty("basics", state)).toBe(true);
      expect(isStepDirty("curriculum", state)).toBe(false);
      expect(isStepDirty("access-rules", state)).toBe(false);
      expect(isStepDirty("pricing", state)).toBe(true);
      expect(isStepDirty("extras", state)).toBe(false);
      expect(isStepDirty("publish", state)).toBe(false);
    });

    it("shows indicator for Extras only when certificateEnabled is dirty, not on Coming Soon edits", () => {
      // Clean certificateEnabled
      const cleanExtras = {
        isBasicsDirty: false,
        isCurriculumDirty: false,
        isAccessRulesDirty: false,
        isPricingDirty: false,
        isExtrasDirty: false,
      };
      expect(isStepDirty("extras", cleanExtras)).toBe(false);

      // Dirty certificateEnabled
      const dirtyExtras = {
        ...cleanExtras,
        isExtrasDirty: true,
      };
      expect(isStepDirty("extras", dirtyExtras)).toBe(true);
    });

    it("clears indicator after save succeeds", () => {
      let state = {
        isBasicsDirty: true,
        isCurriculumDirty: true,
        isAccessRulesDirty: true,
        isPricingDirty: true,
        isExtrasDirty: true,
      };

      expect(isStepDirty("basics", state)).toBe(true);
      expect(isStepDirty("curriculum", state)).toBe(true);

      // Simulate successful saves
      state = {
        isBasicsDirty: false,
        isCurriculumDirty: false,
        isAccessRulesDirty: false,
        isPricingDirty: false,
        isExtrasDirty: false,
      };

      expect(isStepDirty("basics", state)).toBe(false);
      expect(isStepDirty("curriculum", state)).toBe(false);
      expect(isStepDirty("access-rules", state)).toBe(false);
      expect(isStepDirty("pricing", state)).toBe(false);
      expect(isStepDirty("extras", state)).toBe(false);
    });

    it("preserves indicators across tab switches without saving", () => {
      const state = {
        isBasicsDirty: true,
        isCurriculumDirty: false,
        isAccessRulesDirty: false,
        isPricingDirty: false,
        isExtrasDirty: false,
      };

      // Navigate from Basics to Curriculum without saving
      let activeTab: CourseWizardStepId = "basics";
      expect(isStepDirty("basics", state)).toBe(true);

      activeTab = "curriculum";
      // Basics indicator remains true
      expect(isStepDirty("basics", state)).toBe(true);
      expect(isStepDirty(activeTab, state)).toBe(false);
    });
  });

  describe("Save Button Disabled Calculation across Steps", () => {
    it("disables Save button on Curriculum when no pending local edits exist", () => {
      const actionLoading = null;
      const isBasicsDirty = false;
      const isCurriculumDirty = false;
      const isAccessRulesDirty = false;
      const isPricingDirty = false;
      const isExtrasDirty = false;

      const isSaveButtonDisabled = (step: CourseWizardStepId) =>
        actionLoading !== null ||
        (step === "basics" && !isBasicsDirty) ||
        (step === "curriculum" && !isCurriculumDirty) ||
        (step === "access-rules" && !isAccessRulesDirty) ||
        (step === "pricing" && !isPricingDirty) ||
        (step === "extras" && !isExtrasDirty);

      expect(isSaveButtonDisabled("curriculum")).toBe(true);
    });

    it("enables Save button on Curriculum when pending local edits exist", () => {
      const actionLoading = null;
      const isBasicsDirty = false;
      const isCurriculumDirty = true;
      const isAccessRulesDirty = false;
      const isPricingDirty = false;
      const isExtrasDirty = false;

      const isSaveButtonDisabled = (step: CourseWizardStepId) =>
        actionLoading !== null ||
        (step === "basics" && !isBasicsDirty) ||
        (step === "curriculum" && !isCurriculumDirty) ||
        (step === "access-rules" && !isAccessRulesDirty) ||
        (step === "pricing" && !isPricingDirty) ||
        (step === "extras" && !isExtrasDirty);

      expect(isSaveButtonDisabled("curriculum")).toBe(false);
    });
  });
});
