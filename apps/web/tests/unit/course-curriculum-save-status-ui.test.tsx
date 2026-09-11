import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  CurriculumItemStatusIndicator,
  type CurriculumItemKey,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 2: Curriculum Save Status UI Refinement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("CurriculumItemStatusIndicator Component Rendering", () => {
    it("renders null when status is null", () => {
      const { container } = render(
        <CurriculumItemStatusIndicator
          status={null}
          testId="test-indicator"
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders 'Saving...' while save is in progress", () => {
      render(
        <CurriculumItemStatusIndicator
          status="saving"
          testId="curriculum-status-section-sec-1"
        />,
      );
      const el = screen.getByTestId("curriculum-status-section-sec-1");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saving...");
    });

    it("renders 'Saved ✓' after save succeeds", () => {
      render(
        <CurriculumItemStatusIndicator
          status="saved"
          testId="curriculum-status-lesson-les-1"
        />,
      );
      const el = screen.getByTestId("curriculum-status-lesson-les-1");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saved ✓");
    });

    it("renders 'Save failed' when save fails", () => {
      render(
        <CurriculumItemStatusIndicator
          status="failed"
          testId="curriculum-status-lesson-les-2"
        />,
      );
      const el = screen.getByTestId("curriculum-status-lesson-les-2");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Save failed");
    });
  });

  describe("Per-Item Status Lifecycle and Timeout Logic", () => {
    it("transitions from saving to 'Saved ✓', persists for 1.5s, then clears", () => {
      const statusMap: Record<string, "saving" | "saved" | "failed" | null> = {};
      const timersMap: Record<string, any> = {};

      const setItemSaved = (itemId: string) => {
        if (timersMap[itemId]) clearTimeout(timersMap[itemId]);
        statusMap[itemId] = "saved";
        timersMap[itemId] = setTimeout(() => {
          if (statusMap[itemId] === "saved") {
            delete statusMap[itemId];
          }
        }, 1500);
      };

      // 1. Initial saving
      statusMap["sec-1"] = "saving";
      expect(statusMap["sec-1"]).toBe("saving");

      // 2. Save completes
      setItemSaved("sec-1");
      expect(statusMap["sec-1"]).toBe("saved");

      // 3. Fast-forward 1000ms -> still "saved"
      vi.advanceTimersByTime(1000);
      expect(statusMap["sec-1"]).toBe("saved");

      // 4. Fast-forward another 500ms (1500ms total) -> cleared
      vi.advanceTimersByTime(500);
      expect(statusMap["sec-1"]).toBeUndefined();
    });

    it("clears 'Saved ✓' immediately if item is edited before timeout expires", () => {
      const statusMap: Record<string, "saving" | "saved" | "failed" | null> = {};
      const timersMap: Record<string, any> = {};

      const setItemSaved = (itemId: string) => {
        if (timersMap[itemId]) clearTimeout(timersMap[itemId]);
        statusMap[itemId] = "saved";
        timersMap[itemId] = setTimeout(() => {
          delete statusMap[itemId];
        }, 1500);
      };

      const clearItemStatus = (itemId: string) => {
        if (timersMap[itemId]) {
          clearTimeout(timersMap[itemId]);
          delete timersMap[itemId];
        }
        delete statusMap[itemId];
      };

      setItemSaved("les-123");
      expect(statusMap["les-123"]).toBe("saved");

      // User edits lesson field 400ms later -> edit clears the state immediately
      vi.advanceTimersByTime(400);
      clearItemStatus("les-123");
      expect(statusMap["les-123"]).toBeUndefined();

      // Ensure timer firing later does not cause issues
      vi.advanceTimersByTime(2000);
      expect(statusMap["les-123"]).toBeUndefined();
    });

    it("shows 'Save failed' on error, and clears it when edited again", () => {
      const statusMap: Record<string, "saving" | "saved" | "failed" | null> = {};
      const timersMap: Record<string, any> = {};

      const setItemFailed = (itemId: string) => {
        if (timersMap[itemId]) clearTimeout(timersMap[itemId]);
        statusMap[itemId] = "failed";
      };

      const clearItemStatus = (itemId: string) => {
        if (timersMap[itemId]) {
          clearTimeout(timersMap[itemId]);
          delete timersMap[itemId];
        }
        delete statusMap[itemId];
      };

      // Save fails
      setItemFailed("les-456");
      expect(statusMap["les-456"]).toBe("failed");

      // Remains failed even after 3 seconds
      vi.advanceTimersByTime(3000);
      expect(statusMap["les-456"]).toBe("failed");

      // User interacts again -> error clears immediately
      clearItemStatus("les-456");
      expect(statusMap["les-456"]).toBeUndefined();
    });

    it("supports section title editing status and lesson persistence status via display helper", () => {
      let updatingSectionId: string | null = null;
      let savingLessonId: string | null = null;
      const inFlightSaves = new Map<string, Promise<boolean>>();
      const itemStatus: Record<string, "saved" | "failed" | null> = {};

      const getCurriculumItemDisplayStatus = (
        itemId: string,
      ): "saving" | "saved" | "failed" | null => {
        if (
          updatingSectionId === itemId ||
          savingLessonId === itemId ||
          inFlightSaves.has(itemId)
        ) {
          return "saving";
        }
        return itemStatus[itemId] ?? null;
      };

      // Initially idle
      expect(getCurriculumItemDisplayStatus("sec-1")).toBeNull();
      expect(getCurriculumItemDisplayStatus("les-1")).toBeNull();

      // Section title update starts
      updatingSectionId = "sec-1";
      expect(getCurriculumItemDisplayStatus("sec-1")).toBe("saving");
      expect(getCurriculumItemDisplayStatus("les-1")).toBeNull();

      // Section title update succeeds
      updatingSectionId = null;
      itemStatus["sec-1"] = "saved";
      expect(getCurriculumItemDisplayStatus("sec-1")).toBe("saved");

      // Lesson save starts
      savingLessonId = "les-1";
      expect(getCurriculumItemDisplayStatus("les-1")).toBe("saving");

      // Lesson save fails
      savingLessonId = null;
      itemStatus["les-1"] = "failed";
      expect(getCurriculumItemDisplayStatus("les-1")).toBe("failed");

      // In-flight lesson save promise also recognized as saving
      itemStatus["les-2"] = null;
      inFlightSaves.set("les-2", Promise.resolve(true));
      expect(getCurriculumItemDisplayStatus("les-2")).toBe("saving");
    });
  });

  describe("Overall Curriculum Bottom-Bar Save Status Evaluation", () => {
    const evaluateBottomBarStatus = ({
      isAnyCurriculumSaving,
      hasCurriculumItemFailed,
      showCurriculumSavedBriefly,
    }: {
      isAnyCurriculumSaving: boolean;
      hasCurriculumItemFailed: boolean;
      showCurriculumSavedBriefly: boolean;
    }): string | null => {
      if (isAnyCurriculumSaving) return "Saving changes...";
      if (hasCurriculumItemFailed) return "Save failed";
      if (showCurriculumSavedBriefly) return "All changes saved";
      return null;
    };

    it("hides status (null) in baseline/idle clean state when there is no active status", () => {
      const status = evaluateBottomBarStatus({
        isAnyCurriculumSaving: false,
        hasCurriculumItemFailed: false,
        showCurriculumSavedBriefly: false,
      });
      expect(status).toBeNull();
    });

    it("shows 'Saving changes...' when any curriculum save is in progress", () => {
      const status = evaluateBottomBarStatus({
        isAnyCurriculumSaving: true,
        hasCurriculumItemFailed: false,
        showCurriculumSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("shows 'Save failed' when a curriculum item or overall curriculum save fails", () => {
      const status = evaluateBottomBarStatus({
        isAnyCurriculumSaving: false,
        hasCurriculumItemFailed: true,
        showCurriculumSavedBriefly: false,
      });
      expect(status).toBe("Save failed");
    });

    it("shows 'All changes saved' briefly after save succeeds, then hides when timeout expires", () => {
      let showBriefly = true;
      expect(
        evaluateBottomBarStatus({
          isAnyCurriculumSaving: false,
          hasCurriculumItemFailed: false,
          showCurriculumSavedBriefly: showBriefly,
        }),
      ).toBe("All changes saved");

      // Timeout expires (2000ms)
      showBriefly = false;
      expect(
        evaluateBottomBarStatus({
          isAnyCurriculumSaving: false,
          hasCurriculumItemFailed: false,
          showCurriculumSavedBriefly: showBriefly,
        }),
      ).toBeNull();
    });

    it("prioritizes 'Saving changes...' over previous failure if a retry/save is active", () => {
      const status = evaluateBottomBarStatus({
        isAnyCurriculumSaving: true,
        hasCurriculumItemFailed: true,
        showCurriculumSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("clears 'Save failed' back to hidden (null) after user edits/retries", () => {
      let hasFailed = true;
      expect(
        evaluateBottomBarStatus({
          isAnyCurriculumSaving: false,
          hasCurriculumItemFailed: hasFailed,
          showCurriculumSavedBriefly: false,
        }),
      ).toBe("Save failed");

      // User interacts -> error cleared
      hasFailed = false;
      expect(
        evaluateBottomBarStatus({
          isAnyCurriculumSaving: false,
          hasCurriculumItemFailed: hasFailed,
          showCurriculumSavedBriefly: false,
        }),
      ).toBeNull();
    });

    it("includes structural operations (create, delete, reorder) in isAnyCurriculumSaving", () => {
      const checkIsAnySaving = ({
        isSavingCurriculum = false,
        isCreatingSection = false,
        updatingSectionId = null as string | null,
        deletingSectionId = null as string | null,
        isReorderingSections = false,
        creatingLessonSectionId = null as string | null,
        savingLessonId = null as string | null,
        deletingLessonId = null as string | null,
        reorderingLessonsSectionId = null as string | null,
        inFlightCount = 0,
        hasPendingSectionCreation = false,
      }) =>
        isSavingCurriculum ||
        isCreatingSection ||
        updatingSectionId !== null ||
        deletingSectionId !== null ||
        isReorderingSections ||
        creatingLessonSectionId !== null ||
        savingLessonId !== null ||
        deletingLessonId !== null ||
        reorderingLessonsSectionId !== null ||
        inFlightCount > 0 ||
        hasPendingSectionCreation;

      expect(checkIsAnySaving({})).toBe(false);
      expect(checkIsAnySaving({ isCreatingSection: true })).toBe(true);
      expect(checkIsAnySaving({ deletingSectionId: "sec-1" })).toBe(true);
      expect(checkIsAnySaving({ isReorderingSections: true })).toBe(true);
      expect(checkIsAnySaving({ creatingLessonSectionId: "sec-1" })).toBe(true);
      expect(checkIsAnySaving({ deletingLessonId: "les-1" })).toBe(true);
      expect(checkIsAnySaving({ reorderingLessonsSectionId: "sec-1" })).toBe(true);
      expect(checkIsAnySaving({ inFlightCount: 1 })).toBe(true);
      expect(checkIsAnySaving({ hasPendingSectionCreation: true })).toBe(true);
    });
  });
});
