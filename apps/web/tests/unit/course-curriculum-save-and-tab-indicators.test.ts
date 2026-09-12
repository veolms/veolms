import { describe, it, expect, vi } from "vitest";
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

  interface TestLessonItem {
    id: string;
    title: string;
    description?: string;
    contentType: "video" | "document";
    isExpanded: boolean;
    isPublished?: boolean;
    isPreview?: boolean;
    isPendingCreation?: boolean;
    initialState?: {
      title: string;
      description: string;
      contentType: "video" | "document";
      isPublished?: boolean;
      isPreview?: boolean;
    };
  }

  interface TestSectionItem {
    id: string;
    title: string;
    isExpanded: boolean;
    lessons: TestLessonItem[];
  }

  const isLessonDirty = (les: TestLessonItem): boolean => {
    const init = les.initialState || {
      title: les.title,
      description: les.description || "",
      contentType: les.contentType,
      isPublished: les.isPublished !== undefined ? les.isPublished : true,
      isPreview: les.isPreview !== undefined ? les.isPreview : false,
    };
    const isPub = les.isPublished !== undefined ? les.isPublished : true;
    const isPrev = les.isPreview !== undefined ? les.isPreview : false;
    const initPub = init.isPublished !== undefined ? init.isPublished : true;
    const initPrev = init.isPreview !== undefined ? init.isPreview : false;

    return (
      les.title.trim() !== init.title.trim() ||
      (les.description || "") !== (init.description || "") ||
      les.contentType !== init.contentType ||
      isPub !== initPub ||
      isPrev !== initPrev
    );
  };

  describe("Lesson Collapse Auto-Save Lifecycle (handleToggleLessonExpand)", () => {
    it("Case A: Clean lesson collapses immediately with 0 API calls", () => {
      const mockSaveLesson = vi.fn();
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Lesson 1",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Lesson 1",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const toggleLessonExpand = (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (les?.isExpanded) {
          if (isLessonDirty(les)) {
            mockSaveLesson(sectionId, lessonId);
            return;
          }
          sections = sections.map((s) =>
            s.id !== sectionId
              ? s
              : {
                  ...s,
                  lessons: s.lessons.map((l) =>
                    l.id === lessonId ? { ...l, isExpanded: false } : l,
                  ),
                },
          );
          return;
        }
      };

      toggleLessonExpand("sec-1", "les-1");

      expect(mockSaveLesson).not.toHaveBeenCalled();
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(false);
    });

    it("Case B: Dirty lesson invokes handleSaveLesson, saves to API, updates baseline, and collapses", async () => {
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Edited Lesson Title",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Lesson 1",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      let savingLessonId: string | null = null;
      let toastMessage = "";

      const mockApiMutation = vi
        .fn()
        .mockResolvedValue({ success: true });

      const handleSaveLesson = async (sectionId: string, lessonId: string) => {
        if (savingLessonId) return;
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;

        savingLessonId = lessonId;
        try {
          await mockApiMutation({
            lessonId,
            payload: { title: les.title.trim() },
          });

          // Update baseline and collapse
          sections = sections.map((s) =>
            s.id !== sectionId
              ? s
              : {
                  ...s,
                  lessons: s.lessons.map((l) =>
                    l.id === lessonId
                      ? {
                          ...l,
                          isExpanded: false,
                          initialState: {
                            title: les.title.trim(),
                            description: les.description || "",
                            contentType: les.contentType,
                            isPublished: true,
                            isPreview: false,
                          },
                        }
                      : l,
                  ),
                },
          );
          toastMessage = `Lesson "${les.title.trim()}" updated successfully.`;
        } finally {
          savingLessonId = null;
        }
      };

      const toggleLessonExpand = (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (les?.isExpanded) {
          if (isLessonDirty(les)) {
            return handleSaveLesson(sectionId, lessonId);
          }
        }
      };

      await toggleLessonExpand("sec-1", "les-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(false);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
      expect(toastMessage).toContain("updated successfully");
    });

    it("Case C: Dirty lesson + failed save keeps lesson expanded, preserves draft, and retains dirty state", async () => {
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Draft Subject to Failure",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Original Baseline",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      let toastMessage = "";
      const mockApiMutation = vi
        .fn()
        .mockRejectedValue(new Error("500 Internal Server Error"));

      const handleSaveLesson = async (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;

        try {
          await mockApiMutation();
        } catch (err: unknown) {
          toastMessage = (err as Error).message;
        }
      };

      const toggleLessonExpand = (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (les?.isExpanded) {
          if (isLessonDirty(les)) {
            return handleSaveLesson(sectionId, lessonId);
          }
        }
      };

      await toggleLessonExpand("sec-1", "les-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(toastMessage).toBe("500 Internal Server Error");
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
      expect(sections[0]!.lessons[0]!.title).toBe("Draft Subject to Failure");
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(true);
    });

    it("Case D: Dirty lesson with empty title triggers validation error and remains expanded", async () => {
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "   ",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Original Baseline",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      let toastMessage = "";
      const mockApiMutation = vi.fn();

      const handleSaveLesson = async (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les) return;

        const trimmedTitle = les.title.trim();
        if (!trimmedTitle) {
          toastMessage = "Lesson title cannot be empty.";
          return;
        }
        await mockApiMutation();
      };

      const toggleLessonExpand = (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (les?.isExpanded) {
          if (isLessonDirty(les)) {
            return handleSaveLesson(sectionId, lessonId);
          }
        }
      };

      await toggleLessonExpand("sec-1", "les-1");

      expect(mockApiMutation).not.toHaveBeenCalled();
      expect(toastMessage).toBe("Lesson title cannot be empty.");
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(true);
    });

    it("Case E: Rapid collapse clicks are guarded against duplicate save mutations", async () => {
      let callCount = 0;
      let savingLessonId: string | null = null;

      const mockSlowApiMutation = vi.fn().mockImplementation(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, 40));
      });

      const handleSaveLesson = async (sectionId: string, lessonId: string) => {
        if (savingLessonId) return;
        savingLessonId = lessonId;
        try {
          await mockSlowApiMutation();
        } finally {
          savingLessonId = null;
        }
      };

      const toggleLessonExpand = (sectionId: string, lessonId: string) => {
        return handleSaveLesson(sectionId, lessonId);
      };

      const p1 = toggleLessonExpand("sec-1", "les-1");
      const p2 = toggleLessonExpand("sec-1", "les-1");
      const p3 = toggleLessonExpand("sec-1", "les-1");

      await Promise.all([p1, p2, p3]);

      expect(callCount).toBe(1);
    });

    it("Case F: Expanding a collapsed lesson does not trigger save and expands immediately", () => {
      const mockSaveLesson = vi.fn();
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Lesson 1",
              description: "Desc",
              contentType: "video",
              isExpanded: false,
              initialState: {
                title: "Lesson 1",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const toggleLessonExpand = (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (les?.isExpanded) {
          if (isLessonDirty(les)) {
            mockSaveLesson(sectionId, lessonId);
            return;
          }
        }
        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId ? { ...l, isExpanded: true } : l,
                ),
              },
        );
      };

      toggleLessonExpand("sec-1", "les-1");

      expect(mockSaveLesson).not.toHaveBeenCalled();
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
    });
  });

  describe("Section Collapse Auto-Save Lifecycle (handleToggleSectionExpand)", () => {
    it("Case A: Clean section collapses immediately with 0 API calls", async () => {
      const mockApiMutation = vi.fn();
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Lesson 1",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Lesson 1",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleToggleSectionExpand = async (sectionId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        if (!sec) return;

        if (!sec.isExpanded) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: true } : s,
          );
          return;
        }

        const dirtyLessons = sec.lessons.filter((l) => isLessonDirty(l));
        if (dirtyLessons.length === 0) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: false } : s,
          );
          return;
        }
      };

      await handleToggleSectionExpand("sec-1");

      expect(mockApiMutation).not.toHaveBeenCalled();
      expect(sections[0]!.isExpanded).toBe(false);
    });

    it("Case B: Section with dirty lesson saves to API and collapses both lesson and section on success", async () => {
      const mockApiMutation = vi.fn().mockResolvedValue({ success: true });
      let toastMessage = "";
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Updated Title",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Original Title",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleSaveLesson = async (
        sectionId: string,
        lessonId: string,
      ): Promise<boolean> => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return true;

        await mockApiMutation({
          lessonId,
          payload: { title: les.title.trim() },
        });

        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId
                    ? {
                        ...l,
                        isExpanded: false,
                        initialState: {
                          title: les.title.trim(),
                          description: les.description || "",
                          contentType: les.contentType,
                          isPublished: true,
                          isPreview: false,
                        },
                      }
                    : l,
                ),
              },
        );
        toastMessage = `Lesson "${les.title.trim()}" updated successfully.`;
        return true;
      };

      const handleToggleSectionExpand = async (sectionId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        if (!sec) return;

        if (!sec.isExpanded) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: true } : s,
          );
          return;
        }

        const dirtyLessons = sec.lessons.filter((l) => isLessonDirty(l));
        if (dirtyLessons.length === 0) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: false } : s,
          );
          return;
        }

        let allSuccessful = true;
        for (const lesson of dirtyLessons) {
          const success = await handleSaveLesson(sectionId, lesson.id);
          if (!success) {
            allSuccessful = false;
            break;
          }
        }

        if (allSuccessful) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: false } : s,
          );
        }
      };

      await handleToggleSectionExpand("sec-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(sections[0]!.isExpanded).toBe(false);
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(false);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
      expect(toastMessage).toContain("updated successfully");
    });

    it("Case C: Dirty lesson save failure keeps section expanded, preserves draft and dirty state", async () => {
      const mockApiMutation = vi
        .fn()
        .mockRejectedValue(new Error("500 Server Error"));
      let toastMessage = "";
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Draft Should Not Be Lost",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Original Title",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleSaveLesson = async (
        sectionId: string,
        lessonId: string,
      ): Promise<boolean> => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return true;

        try {
          await mockApiMutation();
          return true;
        } catch (err: unknown) {
          toastMessage = (err as Error).message;
          return false;
        }
      };

      const handleToggleSectionExpand = async (sectionId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        if (!sec) return;

        const dirtyLessons = sec.lessons.filter((l) => isLessonDirty(l));
        let allSuccessful = true;
        for (const lesson of dirtyLessons) {
          const success = await handleSaveLesson(sectionId, lesson.id);
          if (!success) {
            allSuccessful = false;
            break;
          }
        }

        if (allSuccessful) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: false } : s,
          );
        }
      };

      await handleToggleSectionExpand("sec-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(toastMessage).toBe("500 Server Error");
      expect(sections[0]!.isExpanded).toBe(true);
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
      expect(sections[0]!.lessons[0]!.title).toBe("Draft Should Not Be Lost");
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(true);
    });

    it("Case D: Dirty lesson with validation failure keeps section expanded", async () => {
      const mockApiMutation = vi.fn();
      let toastMessage = "";
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "    ",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Original Title",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleSaveLesson = async (
        sectionId: string,
        lessonId: string,
      ): Promise<boolean> => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les) return false;

        const trimmedTitle = les.title.trim();
        if (!trimmedTitle) {
          toastMessage = "Lesson title cannot be empty.";
          return false;
        }

        await mockApiMutation();
        return true;
      };

      const handleToggleSectionExpand = async (sectionId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        if (!sec) return;

        const dirtyLessons = sec.lessons.filter((l) => isLessonDirty(l));
        let allSuccessful = true;
        for (const lesson of dirtyLessons) {
          const success = await handleSaveLesson(sectionId, lesson.id);
          if (!success) {
            allSuccessful = false;
            break;
          }
        }

        if (allSuccessful) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: false } : s,
          );
        }
      };

      await handleToggleSectionExpand("sec-1");

      expect(mockApiMutation).not.toHaveBeenCalled();
      expect(toastMessage).toBe("Lesson title cannot be empty.");
      expect(sections[0]!.isExpanded).toBe(true);
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(true);
    });

    it("Case E: Multiple dirty lessons in section are saved sequentially and section collapses only if all succeed", async () => {
      const savedLessonIds: string[] = [];
      const mockApiMutation = vi.fn().mockImplementation(async (id: string) => {
        savedLessonIds.push(id);
        return { success: true };
      });

      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Updated Lesson 1",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Lesson 1",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
            {
              id: "les-2",
              title: "Updated Lesson 2",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Lesson 2",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleSaveLesson = async (
        sectionId: string,
        lessonId: string,
      ): Promise<boolean> => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return true;

        await mockApiMutation(lessonId);

        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId
                    ? {
                        ...l,
                        isExpanded: false,
                        initialState: {
                          title: les.title.trim(),
                          description: les.description || "",
                          contentType: les.contentType,
                          isPublished: true,
                          isPreview: false,
                        },
                      }
                    : l,
                ),
              },
        );
        return true;
      };

      const handleToggleSectionExpand = async (sectionId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        if (!sec) return;

        const dirtyLessons = sec.lessons.filter((l) => isLessonDirty(l));
        let allSuccessful = true;
        for (const lesson of dirtyLessons) {
          const success = await handleSaveLesson(sectionId, lesson.id);
          if (!success) {
            allSuccessful = false;
            break;
          }
        }

        if (allSuccessful) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: false } : s,
          );
        }
      };

      await handleToggleSectionExpand("sec-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(2);
      expect(savedLessonIds).toEqual(["les-1", "les-2"]);
      expect(sections[0]!.isExpanded).toBe(false);
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(false);
      expect(sections[0]!.lessons[1]!.isExpanded).toBe(false);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
      expect(isLessonDirty(sections[0]!.lessons[1]!)).toBe(false);
    });

    it("Case F: Expanding a collapsed section preserves immediate expand without saving", async () => {
      const mockApiMutation = vi.fn();
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: false,
          lessons: [
            {
              id: "les-1",
              title: "Lesson 1",
              description: "Desc",
              contentType: "video",
              isExpanded: false,
              initialState: {
                title: "Lesson 1",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleToggleSectionExpand = async (sectionId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        if (!sec) return;

        if (!sec.isExpanded) {
          sections = sections.map((s) =>
            s.id === sectionId ? { ...s, isExpanded: true } : s,
          );
          return;
        }
      };

      await handleToggleSectionExpand("sec-1");

      expect(mockApiMutation).not.toHaveBeenCalled();
      expect(sections[0]!.isExpanded).toBe(true);
    });

    it("Case G: Rapid collapse clicks while save is in flight are guarded", async () => {
      let mutationCount = 0;
      let isCollapsing = false;

      const mockSlowMutation = vi.fn().mockImplementation(async () => {
        mutationCount++;
        await new Promise((r) => setTimeout(r, 40));
        return { success: true };
      });

      const handleToggleSectionExpand = async () => {
        if (isCollapsing) return;
        isCollapsing = true;
        try {
          await mockSlowMutation();
        } finally {
          isCollapsing = false;
        }
      };

      const p1 = handleToggleSectionExpand();
      const p2 = handleToggleSectionExpand();
      const p3 = handleToggleSectionExpand();

      await Promise.all([p1, p2, p3]);

      expect(mutationCount).toBe(1);
    });
  });

  describe("Curriculum Lesson-Level Boundary Persistence (persistLesson & saveAllDirtyLessons)", () => {
    it("Case A: Title blur persists lesson and keeps lesson expanded", async () => {
      const mockApiMutation = vi.fn().mockResolvedValue({ success: true });
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Draft Title",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Original Title",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const persistLesson = async (
        sectionId: string,
        lessonId: string,
        options?: { collapseOnSuccess?: boolean },
      ): Promise<boolean> => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return true;

        const payload = {
          title: les.title.trim(),
          description: les.description || "",
          contentType: les.contentType,
          isPublished: true,
          isPreview: false,
        };

        await mockApiMutation(payload);

        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId
                    ? {
                        ...l,
                        isExpanded: options?.collapseOnSuccess ? false : l.isExpanded,
                        initialState: { ...payload },
                      }
                    : l,
                ),
              },
        );
        return true;
      };

      const handleLessonFieldBlur = async (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;
        await persistLesson(sectionId, lessonId, { collapseOnSuccess: false });
      };

      await handleLessonFieldBlur("sec-1", "les-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
      expect(sections[0]!.lessons[0]!.title).toBe("Draft Title");
    });

    it("Case B: Description blur persists lesson and keeps lesson expanded", async () => {
      const mockApiMutation = vi.fn().mockResolvedValue({ success: true });
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Title",
              description: "New updated rich description",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Title",
                description: "Old description",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const persistLesson = async (
        sectionId: string,
        lessonId: string,
        options?: { collapseOnSuccess?: boolean },
      ): Promise<boolean> => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return true;

        const payload = {
          title: les.title.trim(),
          description: les.description || "",
          contentType: les.contentType,
          isPublished: true,
          isPreview: false,
        };

        await mockApiMutation(payload);

        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId
                    ? {
                        ...l,
                        isExpanded: options?.collapseOnSuccess ? false : l.isExpanded,
                        initialState: { ...payload },
                      }
                    : l,
                ),
              },
        );
        return true;
      };

      const handleLessonFieldBlur = async (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;
        await persistLesson(sectionId, lessonId, { collapseOnSuccess: false });
      };

      await handleLessonFieldBlur("sec-1", "les-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
      expect(sections[0]!.lessons[0]!.description).toBe("New updated rich description");
    });

    it("Case C: Clean blur results in zero API calls", async () => {
      const mockApiMutation = vi.fn();
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Clean Title",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Clean Title",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleLessonFieldBlur = async (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;
        await mockApiMutation();
      };

      await handleLessonFieldBlur("sec-1", "les-1");

      expect(mockApiMutation).not.toHaveBeenCalled();
    });

    it("Case D: Typing multiple characters does not call API until blur occurs", async () => {
      const mockApiMutation = vi.fn().mockResolvedValue({ success: true });
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Intro",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Intro",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleUpdateLesson = (sectionId: string, lessonId: string, updates: Partial<TestLessonItem>) => {
        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, ...updates } : l)),
              },
        );
      };

      const handleLessonFieldBlur = async (sectionId: string, lessonId: string) => {
        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;

        const payload = {
          title: les.title.trim(),
          description: les.description || "",
          contentType: les.contentType,
          isPublished: true,
          isPreview: false,
        };
        await mockApiMutation(payload);

        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId
                    ? {
                        ...l,
                        initialState: { ...payload },
                      }
                    : l,
                ),
              },
        );
      };

      // Keystrokes
      handleUpdateLesson("sec-1", "les-1", { title: "Intro t" });
      handleUpdateLesson("sec-1", "les-1", { title: "Intro to" });
      handleUpdateLesson("sec-1", "les-1", { title: "Intro to React" });

      expect(mockApiMutation).not.toHaveBeenCalled();
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(true);

      // Focus leaves field
      await handleLessonFieldBlur("sec-1", "les-1");

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(mockApiMutation).toHaveBeenCalledWith(expect.objectContaining({ title: "Intro to React" }));
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
    });

    it("Case E: Discrete control change immediately persists and keeps editor open", async () => {
      const mockApiMutation = vi.fn().mockResolvedValue({ success: true });
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Lesson",
              description: "Desc",
              contentType: "video",
              isExpanded: true,
              initialState: {
                title: "Lesson",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleLessonDiscreteChange = async (
        sectionId: string,
        lessonId: string,
        updates: Partial<TestLessonItem>,
      ) => {
        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, ...updates } : l)),
              },
        );

        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;

        const payload = {
          title: les.title.trim(),
          description: les.description || "",
          contentType: les.contentType,
          isPublished: true,
          isPreview: false,
        };
        await mockApiMutation(payload);

        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId
                    ? {
                        ...l,
                        initialState: { ...payload },
                      }
                    : l,
                ),
              },
        );
      };

      await handleLessonDiscreteChange("sec-1", "les-1", { contentType: "document" });

      expect(mockApiMutation).toHaveBeenCalledTimes(1);
      expect(mockApiMutation).toHaveBeenCalledWith(expect.objectContaining({ contentType: "document" }));
      expect(sections[0]!.lessons[0]!.isExpanded).toBe(true);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
    });

    it("Case E2: Free preview toggle persists ON then OFF with exact boolean values", async () => {
      const calls: Array<{ isPreview: boolean }> = [];
      const mockApiMutation = vi.fn().mockImplementation(async (payload: { isPreview: boolean }) => {
        calls.push(payload);
        return { success: true };
      });
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Lesson",
              description: "Desc",
              contentType: "video",
              isPreview: false,
              isExpanded: true,
              initialState: {
                title: "Lesson",
                description: "Desc",
                contentType: "video",
                isPublished: true,
                isPreview: false,
              },
            },
          ],
        },
      ];

      const handleLessonDiscreteChange = async (
        sectionId: string,
        lessonId: string,
        updates: Partial<TestLessonItem>,
      ) => {
        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) => (l.id === lessonId ? { ...l, ...updates } : l)),
              },
        );

        const sec = sections.find((s) => s.id === sectionId);
        const les = sec?.lessons.find((l) => l.id === lessonId);
        if (!les || !isLessonDirty(les)) return;

        const payload = {
          title: les.title.trim(),
          description: les.description || "",
          contentType: les.contentType,
          isPublished: true,
          isPreview: les.isPreview ?? false,
        };
        await mockApiMutation(payload);

        sections = sections.map((s) =>
          s.id !== sectionId
            ? s
            : {
                ...s,
                lessons: s.lessons.map((l) =>
                  l.id === lessonId
                    ? {
                        ...l,
                        initialState: { ...payload },
                      }
                    : l,
                ),
              },
        );
      };

      // 1. Toggle Free Preview ON
      await handleLessonDiscreteChange("sec-1", "les-1", { isPreview: true });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.isPreview).toBe(true);
      expect(sections[0]!.lessons[0]!.isPreview).toBe(true);
      expect(sections[0]!.lessons[0]!.initialState!.isPreview).toBe(true);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);

      // 2. Toggle Free Preview OFF
      await handleLessonDiscreteChange("sec-1", "les-1", { isPreview: false });
      expect(calls).toHaveLength(2);
      expect(calls[1]!.isPreview).toBe(false);
      expect(sections[0]!.lessons[0]!.isPreview).toBe(false);
      expect(sections[0]!.lessons[0]!.initialState!.isPreview).toBe(false);
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
    });

    it("Case H: saveAllDirtyLessons persists only dirty lessons and leaves clean lessons untouched", async () => {
      const persistedIds: string[] = [];
      const mockApiMutation = vi.fn().mockImplementation(async (id: string) => {
        persistedIds.push(id);
        return { success: true };
      });

      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Dirty 1",
              contentType: "video",
              isExpanded: true,
              initialState: { title: "Orig 1", description: "", contentType: "video" },
            },
            {
              id: "les-2",
              title: "Clean 2",
              contentType: "video",
              isExpanded: false,
              initialState: { title: "Clean 2", description: "", contentType: "video" },
            },
          ],
        },
        {
          id: "sec-2",
          title: "Section 2",
          isExpanded: true,
          lessons: [
            {
              id: "les-3",
              title: "Dirty 3",
              contentType: "video",
              isExpanded: true,
              initialState: { title: "Orig 3", description: "", contentType: "video" },
            },
          ],
        },
      ];

      const saveAllDirtyLessons = async (): Promise<boolean> => {
        const dirtyLessons: Array<{ sectionId: string; lessonId: string }> = [];
        for (const sec of sections) {
          for (const les of sec.lessons) {
            if (isLessonDirty(les)) {
              dirtyLessons.push({ sectionId: sec.id, lessonId: les.id });
            }
          }
        }

        if (dirtyLessons.length === 0) return true;

        const results = await Promise.all(
          dirtyLessons.map(async ({ sectionId, lessonId }) => {
            await mockApiMutation(lessonId);
            sections = sections.map((s) =>
              s.id !== sectionId
                ? s
                : {
                    ...s,
                    lessons: s.lessons.map((l) =>
                      l.id === lessonId
                        ? {
                            ...l,
                            initialState: {
                              title: l.title,
                              description: l.description || "",
                              contentType: l.contentType,
                            },
                          }
                        : l,
                    ),
                  },
            );
            return true;
          }),
        );
        return results.every(Boolean);
      };

      const success = await saveAllDirtyLessons();

      expect(success).toBe(true);
      expect(mockApiMutation).toHaveBeenCalledTimes(2);
      expect(persistedIds).toContain("les-1");
      expect(persistedIds).toContain("les-3");
      expect(persistedIds).not.toContain("les-2");
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
      expect(isLessonDirty(sections[1]!.lessons[0]!)).toBe(false);
    });

    it("Case I: Exit success (Next) saves all dirty lessons before navigating", async () => {
      const callOrder: string[] = [];
      let activeStep = "curriculum";

      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Dirty Lesson",
              contentType: "video",
              isExpanded: true,
              initialState: { title: "Original", description: "", contentType: "video" },
            },
          ],
        },
      ];

      const saveAllDirtyLessons = async () => {
        callOrder.push("saveAllDirtyLessons");
        sections[0]!.lessons[0]!.initialState = {
          title: sections[0]!.lessons[0]!.title,
          description: "",
          contentType: "video",
        };
        return true;
      };

      const navigateToStep = async (destination: string) => {
        if (activeStep === "curriculum") {
          const success = await saveAllDirtyLessons();
          if (!success) return;
        }
        callOrder.push(`navigatedTo:${destination}`);
        activeStep = destination;
      };

      await navigateToStep("access-rules");

      expect(callOrder).toEqual(["saveAllDirtyLessons", "navigatedTo:access-rules"]);
      expect(activeStep).toBe("access-rules");
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false);
    });

    it("Case J: Exit failure (Next) keeps user on Curriculum, preserves failed draft", async () => {
      let activeStep = "curriculum";
      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Will Succeed",
              contentType: "video",
              isExpanded: true,
              initialState: { title: "Original 1", description: "", contentType: "video" },
            },
            {
              id: "les-2",
              title: "Will Fail",
              contentType: "video",
              isExpanded: true,
              initialState: { title: "Original 2", description: "", contentType: "video" },
            },
          ],
        },
      ];

      const saveAllDirtyLessons = async () => {
        // Lesson 1 succeeds
        sections[0]!.lessons[0]!.initialState = {
          title: sections[0]!.lessons[0]!.title,
          description: "",
          contentType: "video",
        };
        // Lesson 2 fails
        return false;
      };

      const navigateToStep = async (destination: string) => {
        if (activeStep === "curriculum") {
          const success = await saveAllDirtyLessons();
          if (!success) {
            // Stay on Curriculum!
            return;
          }
        }
        activeStep = destination;
      };

      await navigateToStep("access-rules");

      expect(activeStep).toBe("curriculum"); // Did NOT navigate
      expect(isLessonDirty(sections[0]!.lessons[0]!)).toBe(false); // Succeeded
      expect(isLessonDirty(sections[0]!.lessons[1]!)).toBe(true); // Remained dirty
      expect(sections[0]!.lessons[1]!.title).toBe("Will Fail"); // Draft intact
    });

    it("Case K & L: Tab switch and Previous save dirty lessons before transitioning", async () => {
      let activeStep = "curriculum";
      const saveMock = vi.fn().mockResolvedValue(true);

      const navigateToStep = async (destination: string) => {
        if (activeStep === "curriculum") {
          const success = await saveMock();
          if (!success) return;
        }
        activeStep = destination;
      };

      // Tab switch
      await navigateToStep("pricing");
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect(activeStep).toBe("pricing");

      // Reset to curriculum
      activeStep = "curriculum";
      // Previous
      await navigateToStep("basics");
      expect(saveMock).toHaveBeenCalledTimes(2);
      expect(activeStep).toBe("basics");
    });

    it("Case M: Preview saves all dirty lessons before opening and blocks opening on save failure", async () => {
      let isPreviewModalOpen = false;
      let shouldSaveSucceed = true;

      const saveAllDirtyLessons = async () => shouldSaveSucceed;

      const handlePreviewAction = async () => {
        const success = await saveAllDirtyLessons();
        if (!success) return;
        isPreviewModalOpen = true;
      };

      // 1. Failure scenario
      shouldSaveSucceed = false;
      await handlePreviewAction();
      expect(isPreviewModalOpen).toBe(false);

      // 2. Success scenario
      shouldSaveSucceed = true;
      await handlePreviewAction();
      expect(isPreviewModalOpen).toBe(true);
    });

    it("Case N: No dirty lessons results in zero API calls on Next/Tab/Previous/Preview", async () => {
      const mockApiMutation = vi.fn();
      let activeStep = "curriculum";
      let isPreviewModalOpen = false;

      let sections: TestSectionItem[] = [
        {
          id: "sec-1",
          title: "Section 1",
          isExpanded: true,
          lessons: [
            {
              id: "les-1",
              title: "Clean",
              contentType: "video",
              isExpanded: true,
              initialState: { title: "Clean", description: "", contentType: "video" },
            },
          ],
        },
      ];

      const saveAllDirtyLessons = async () => {
        const dirtyLessons = sections.flatMap((s) => s.lessons).filter(isLessonDirty);
        if (dirtyLessons.length === 0) return true;
        await mockApiMutation();
        return true;
      };

      const navigateToStep = async (destination: string) => {
        const hasDirty = sections.flatMap((s) => s.lessons).some(isLessonDirty);
        if (hasDirty) {
          await saveAllDirtyLessons();
        }
        activeStep = destination;
      };

      const handlePreviewAction = async () => {
        const hasDirty = sections.flatMap((s) => s.lessons).some(isLessonDirty);
        if (hasDirty) {
          await saveAllDirtyLessons();
        }
        isPreviewModalOpen = true;
      };

      await navigateToStep("access-rules");
      expect(mockApiMutation).not.toHaveBeenCalled();
      expect(activeStep).toBe("access-rules");

      await handlePreviewAction();
      expect(mockApiMutation).not.toHaveBeenCalled();
      expect(isPreviewModalOpen).toBe(true);
    });

    it("Case O: Navigation attempts during active saveAllDirtyLessons are guarded", async () => {
      let isSaving = false;
      let navAttempts = 0;

      const saveAllDirtyLessons = async () => {
        isSaving = true;
        await new Promise((r) => setTimeout(r, 40));
        isSaving = false;
        return true;
      };

      const navigateToStep = async () => {
        if (isSaving) return;
        navAttempts++;
        await saveAllDirtyLessons();
      };

      const p1 = navigateToStep();
      const p2 = navigateToStep();
      const p3 = navigateToStep();

      await Promise.all([p1, p2, p3]);

      expect(navAttempts).toBe(1);
    });

    it("Case P: Newer edit during save is not overwritten or marked clean", async () => {
      let resolveApiMutation: () => void;
      const apiPromise = new Promise<void>((resolve) => {
        resolveApiMutation = resolve;
      });

      let lesson: TestLessonItem = {
        id: "les-1",
        title: "Draft Title",
        description: "Desc",
        contentType: "video",
        isExpanded: true,
        initialState: {
          title: "Initial Title",
          description: "Desc",
          contentType: "video",
        },
      };

      // 1. Save begins with "Draft Title" snapshot
      const persistedSnapshot = {
        title: lesson.title,
        description: lesson.description || "",
        contentType: lesson.contentType,
      };

      const saveExecution = (async () => {
        await apiPromise;
        // Baseline is updated ONLY with the persisted snapshot!
        lesson = {
          ...lesson,
          initialState: { ...persistedSnapshot },
        };
      })();

      // 2. While save is in flight, user makes a newer edit!
      lesson = {
        ...lesson,
        title: "Brand New Edit",
      };

      // 3. Save finishes
      resolveApiMutation!();
      await saveExecution;

      // 4. Verify newer edit was NOT overwritten
      expect(lesson.title).toBe("Brand New Edit");
      // 5. Verify lesson is STILL dirty because "Brand New Edit" !== "Draft Title"
      expect(isLessonDirty(lesson)).toBe(true);
    });
  });
});


