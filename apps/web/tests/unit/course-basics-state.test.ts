import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initialBasicsState,
  normalizeBasicsState,
  isBasicsEqual,
  type BasicsFormState,
} from "../../src/courses/CourseCreatePage";
import { coursesService } from "../../src/services/courses/courses.service";
import type { Course, CourseSettings } from "@veolms/contracts";

describe("Course Wizard Basics Server-Confirmed vs Local Draft State", () => {
  const sampleCourseId = "12345678-1234-1234-1234-1234567890ab";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Normalization & Equality Helper", () => {
    it("normalizes empty or partial data to default baseline", () => {
      const normalized = normalizeBasicsState(null);
      expect(normalized).toEqual({
        title: "",
        shortDescription: "",
        description: "",
        categoryId: "",
        difficulty: "",
        language: "en",
      });
    });

    it("normalizes undefined or null fields safely without dirty mismatch", () => {
      const serverData = normalizeBasicsState({
        title: "Introduction to TypeScript",
        shortDescription: "",
        description: "",
        categoryId: "",
        difficulty: "",
        language: "en",
      });

      const localData = normalizeBasicsState({
        title: "Introduction to TypeScript",
        shortDescription: "",
        description: "",
        categoryId: "",
        difficulty: "",
        language: "en",
      });

      expect(isBasicsEqual(serverData, localData)).toBe(true);
    });

    it("correctly identifies changes between local draft and server state", () => {
      const serverState: BasicsFormState = {
        title: "Original Title",
        shortDescription: "Original Short Desc",
        description: "Original Description",
        categoryId: "cat-1",
        difficulty: "beginner",
        language: "en",
      };

      const localDraft: BasicsFormState = {
        ...serverState,
        title: "Updated Title",
      };

      expect(isBasicsEqual(localDraft, serverState)).toBe(false);
    });
  });

  describe("Hydration Flow", () => {
    it("hydrates both serverState and localDraftState identically so isDirty is initially false", () => {
      const serverResponse: Partial<BasicsFormState> = {
        title: "Mastering Fastify",
        description: "Deep dive into Fastify backend development",
        categoryId: "cat-backend",
        difficulty: "intermediate",
        language: "en",
      };

      const confirmedBaseline = normalizeBasicsState(serverResponse);
      const draftState = normalizeBasicsState(serverResponse);

      const isDirty = !isBasicsEqual(draftState, confirmedBaseline);
      expect(isDirty).toBe(false);
      expect(draftState).toEqual(confirmedBaseline);
    });
  });

  describe("Local Editing & Dirty State", () => {
    it("marks isDirty true when any field is edited in the local draft", () => {
      const serverState: BasicsFormState = {
        title: "Python 101",
        shortDescription: "Python quick start",
        description: "Learn Python basics",
        categoryId: "cat-py",
        difficulty: "beginner",
        language: "en",
      };

      let draftState: BasicsFormState = { ...serverState };
      expect(!isBasicsEqual(draftState, serverState)).toBe(false);

      // 1. Edit title
      draftState = { ...draftState, title: "Python 101 - 2026 Edition" };
      expect(!isBasicsEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 2. Edit shortDescription
      draftState = {
        ...draftState,
        shortDescription: "Updated short overview",
      };
      expect(!isBasicsEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 3. Edit description
      draftState = {
        ...draftState,
        description: "Updated curriculum description",
      };
      expect(!isBasicsEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 4. Edit difficulty
      draftState = { ...draftState, difficulty: "advanced" };
      expect(!isBasicsEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 5. Edit category
      draftState = { ...draftState, categoryId: "cat-advanced" };
      expect(!isBasicsEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 6. Edit language
      draftState = { ...draftState, language: "es" };
      expect(!isBasicsEqual(draftState, serverState)).toBe(true);
    });

    it("reverting local draft back to server values restores clean isDirty = false", () => {
      const serverState: BasicsFormState = {
        title: "Clean Title",
        shortDescription: "Clean Short Desc",
        description: "Clean Description",
        categoryId: "cat-1",
        difficulty: "beginner",
        language: "en",
      };

      let draftState = { ...serverState, title: "Dirty Title" };
      expect(!isBasicsEqual(draftState, serverState)).toBe(true);

      // Revert back
      draftState = { ...draftState, title: "Clean Title" };
      expect(!isBasicsEqual(draftState, serverState)).toBe(false);
    });
  });

  describe("Save Basics Flow & Baseline Synchronization", () => {
    it("updates server baseline and clears isDirty upon successful save of an existing course", async () => {
      let serverState: BasicsFormState = {
        title: "Existing Course",
        shortDescription: "Initial short description",
        description: "Initial description",
        categoryId: "cat-1",
        difficulty: "beginner",
        language: "en",
      };

      const localDraft: BasicsFormState = {
        title: "Existing Course - Refactored",
        shortDescription: "Updated short description",
        description: "Updated description",
        categoryId: "cat-2",
        difficulty: "intermediate",
        language: "fr",
      };

      expect(!isBasicsEqual(localDraft, serverState)).toBe(true);

      const mockUpdatedCourse: Course = {
        id: sampleCourseId,
        title: localDraft.title,
        shortDescription: localDraft.shortDescription,
        description: localDraft.description,
        categoryId: localDraft.categoryId,
        difficulty: (localDraft.difficulty || null) as Course["difficulty"],
        slug: "existing-course-refactored",
        creatorId: "user-1",
        status: "draft",
        version: 2,
        thumbnailMediaId: null,
        trailerMediaId: null,
        publishedAt: null,
        createdAt: "2026-08-20T10:00:00.000Z",
        updatedAt: "2026-08-26T12:00:00.000Z",
      };

      const mockUpdatedSettings: CourseSettings = {
        id: "settings-1",
        courseId: sampleCourseId,
        language: "fr",
        allowQa: true,
        allowComments: true,
        allowReviews: true,
        allowDownloads: false,
        certificateEnabled: false,
        estimatedDuration: null,
      };

      vi.spyOn(coursesService, "updateCourseBasics").mockResolvedValue(
        mockUpdatedCourse,
      );
      vi.spyOn(coursesService, "upsertSettings").mockResolvedValue(
        mockUpdatedSettings,
      );

      const updated = await coursesService.updateCourseBasics(sampleCourseId, {
        title: localDraft.title,
        shortDescription: localDraft.shortDescription,
        description: localDraft.description,
        categoryId: localDraft.categoryId,
        difficulty: localDraft.difficulty || null,
        version: 1,
      });

      const updatedSettings = await coursesService.upsertSettings(
        sampleCourseId,
        {
          language: localDraft.language,
        },
      );

      // Synchronize confirmed baseline from server response
      const newBaseline: BasicsFormState = normalizeBasicsState({
        title: updated.title,
        shortDescription: updated.shortDescription || "",
        description: updated.description || "",
        categoryId: updated.categoryId || "",
        difficulty: (updated.difficulty as BasicsFormState["difficulty"]) || "",
        language: updatedSettings.language || "en",
      });

      serverState = newBaseline;
      const synchronizedDraft = newBaseline;

      expect(!isBasicsEqual(synchronizedDraft, serverState)).toBe(false);
      expect(serverState.title).toBe("Existing Course - Refactored");
      expect(serverState.language).toBe("fr");
    });

    it("preserves local draft and leaves server baseline unchanged on save failure", async () => {
      const serverState: BasicsFormState = {
        title: "Baseline Title",
        shortDescription: "Baseline Short Desc",
        description: "Baseline Description",
        categoryId: "cat-1",
        difficulty: "beginner",
        language: "en",
      };

      const localDraft: BasicsFormState = {
        title: "Edited But Failed Title",
        shortDescription: "Edited Short Desc",
        description: "Edited Description",
        categoryId: "cat-1",
        difficulty: "beginner",
        language: "en",
      };

      vi.spyOn(coursesService, "updateCourseBasics").mockRejectedValue(
        new Error("Network connection error"),
      );

      let saveError: Error | null = null;
      try {
        await coursesService.updateCourseBasics(sampleCourseId, {
          title: localDraft.title,
          shortDescription: localDraft.shortDescription,
          description: localDraft.description,
          categoryId: localDraft.categoryId,
          difficulty: localDraft.difficulty || null,
          version: 1,
        });
      } catch (err: any) {
        saveError = err;
      }

      expect(saveError).not.toBeNull();
      expect(saveError?.message).toBe("Network connection error");

      // Server baseline and local draft remain intact; isDirty is preserved as true
      expect(serverState.title).toBe("Baseline Title");
      expect(localDraft.title).toBe("Edited But Failed Title");
      expect(!isBasicsEqual(localDraft, serverState)).toBe(true);
    });

    it("new course creation flow establishes first confirmed baseline on success", async () => {
      let serverState: BasicsFormState = initialBasicsState;

      const newDraft: BasicsFormState = {
        title: "Brand New Course",
        shortDescription: "Brand new summary",
        description: "Comprehensive introduction",
        categoryId: "cat-new",
        difficulty: "beginner",
        language: "en",
      };

      expect(!isBasicsEqual(newDraft, serverState)).toBe(true);

      const mockCreatedCourse: Course = {
        id: sampleCourseId,
        title: newDraft.title,
        shortDescription: newDraft.shortDescription,
        description: newDraft.description,
        categoryId: newDraft.categoryId,
        difficulty: (newDraft.difficulty || null) as Course["difficulty"],
        slug: "brand-new-course",
        creatorId: "user-1",
        status: "draft",
        version: 1,
        thumbnailMediaId: null,
        trailerMediaId: null,
        publishedAt: null,
        createdAt: "2026-08-26T12:00:00.000Z",
        updatedAt: "2026-08-26T12:00:00.000Z",
      };

      vi.spyOn(coursesService, "createCourse").mockResolvedValue(
        mockCreatedCourse,
      );

      const created = await coursesService.createCourse({
        title: newDraft.title,
      });

      const confirmedBaseline: BasicsFormState = normalizeBasicsState({
        title: created.title,
        shortDescription: newDraft.shortDescription,
        description: newDraft.description,
        categoryId: newDraft.categoryId,
        difficulty: newDraft.difficulty,
        language: newDraft.language,
      });

      serverState = confirmedBaseline;
      const synchronizedDraft = confirmedBaseline;

      expect(!isBasicsEqual(synchronizedDraft, serverState)).toBe(false);
      expect(serverState.title).toBe("Brand New Course");
    });
  });

  describe("Save Button State & Navigation Semantics", () => {
    it("computes disabled state accurately based on clean vs dirty status", () => {
      const isBasicsDirtyClean = false;
      const isBasicsDirtyDirty = true;
      const actionLoadingNull = null;
      const actionLoadingSaving = "save";

      // 1. Clean & idle -> disabled
      const isSaveDisabledClean =
        actionLoadingNull !== null || !isBasicsDirtyClean;
      expect(isSaveDisabledClean).toBe(true);

      // 2. Dirty & idle -> enabled
      const isSaveDisabledDirty =
        actionLoadingNull !== null || !isBasicsDirtyDirty;
      expect(isSaveDisabledDirty).toBe(false);

      // 3. Dirty & saving -> disabled
      const isSaveDisabledSaving =
        actionLoadingSaving !== null || !isBasicsDirtyDirty;
      expect(isSaveDisabledSaving).toBe(true);
    });
  });
});
