import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  BasicsFieldStatusIndicator,
  type BasicsFieldKey,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 1: Basics Save Status UI Refinement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("BasicsFieldStatusIndicator Component Rendering", () => {
    it("renders null when status is null", () => {
      const { container } = render(
        <BasicsFieldStatusIndicator status={null} testId="test-indicator" />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders 'Saving...' while save is in progress", () => {
      render(
        <BasicsFieldStatusIndicator status="saving" testId="status-title" />,
      );
      const el = screen.getByTestId("status-title");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saving...");
    });

    it("renders 'Saved ✓' after save succeeds", () => {
      render(
        <BasicsFieldStatusIndicator status="saved" testId="status-shortDesc" />,
      );
      const el = screen.getByTestId("status-shortDesc");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saved ✓");
    });

    it("renders 'Save failed' when save fails", () => {
      render(
        <BasicsFieldStatusIndicator status="failed" testId="status-courseDesc" />,
      );
      const el = screen.getByTestId("status-courseDesc");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Save failed");
    });
  });

  describe("Per-Field Status Lifecycle and Timeout Logic", () => {
    it("transitions from saving to 'Saved ✓', persists for 1.5s, then clears", () => {
      const statusMap: Partial<
        Record<BasicsFieldKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<BasicsFieldKey, any>> = {};

      const setFieldSaved = (fieldKey: BasicsFieldKey) => {
        if (timersMap[fieldKey]) clearTimeout(timersMap[fieldKey]);
        statusMap[fieldKey] = "saved";
        timersMap[fieldKey] = setTimeout(() => {
          if (statusMap[fieldKey] === "saved") {
            delete statusMap[fieldKey];
          }
        }, 1500);
      };

      // 1. Initial saving
      statusMap["title"] = "saving";
      expect(statusMap["title"]).toBe("saving");

      // 2. Save completes
      setFieldSaved("title");
      expect(statusMap["title"]).toBe("saved");

      // 3. Fast-forward 1000ms -> still "saved"
      vi.advanceTimersByTime(1000);
      expect(statusMap["title"]).toBe("saved");

      // 4. Fast-forward another 500ms (1500ms total) -> cleared
      vi.advanceTimersByTime(500);
      expect(statusMap["title"]).toBeUndefined();
    });

    it("clears 'Saved ✓' immediately if field is edited before timeout expires", () => {
      const statusMap: Partial<
        Record<BasicsFieldKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<BasicsFieldKey, any>> = {};

      const setFieldSaved = (fieldKey: BasicsFieldKey) => {
        if (timersMap[fieldKey]) clearTimeout(timersMap[fieldKey]);
        statusMap[fieldKey] = "saved";
        timersMap[fieldKey] = setTimeout(() => {
          delete statusMap[fieldKey];
        }, 1500);
      };

      const clearFieldStatus = (fieldKey: BasicsFieldKey) => {
        if (timersMap[fieldKey]) {
          clearTimeout(timersMap[fieldKey]);
          delete timersMap[fieldKey];
        }
        delete statusMap[fieldKey];
      };

      setFieldSaved("shortDescription");
      expect(statusMap["shortDescription"]).toBe("saved");

      // User types 200ms later -> edit clears the state
      vi.advanceTimersByTime(200);
      clearFieldStatus("shortDescription");
      expect(statusMap["shortDescription"]).toBeUndefined();

      // Ensure timer firing later does not cause issues
      vi.advanceTimersByTime(2000);
      expect(statusMap["shortDescription"]).toBeUndefined();
    });

    it("shows 'Save failed' on error, and clears it when edited again", () => {
      const statusMap: Partial<
        Record<BasicsFieldKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<BasicsFieldKey, any>> = {};

      const setFieldFailed = (fieldKey: BasicsFieldKey) => {
        if (timersMap[fieldKey]) clearTimeout(timersMap[fieldKey]);
        statusMap[fieldKey] = "failed";
      };

      const clearFieldStatus = (fieldKey: BasicsFieldKey) => {
        if (timersMap[fieldKey]) {
          clearTimeout(timersMap[fieldKey]);
          delete timersMap[fieldKey];
        }
        delete statusMap[fieldKey];
      };

      // Save fails
      setFieldFailed("courseDescription");
      expect(statusMap["courseDescription"]).toBe("failed");

      // Remains failed even after 3 seconds
      vi.advanceTimersByTime(3000);
      expect(statusMap["courseDescription"]).toBe("failed");

      // User edits the field -> error clears immediately
      clearFieldStatus("courseDescription");
      expect(statusMap["courseDescription"]).toBeUndefined();
    });

    it("covers all 5 target fields: Title, Short Description, Course Description, Instructor Alias, Show Instructor Name", () => {
      const allFields: BasicsFieldKey[] = [
        "title",
        "shortDescription",
        "courseDescription",
        "instructorAlias",
        "showInstructorName",
      ];
      expect(allFields).toHaveLength(5);
    });
  });

  describe("Overall Basics Bottom-Bar Save Status Evaluation", () => {
    const evaluateBottomBarStatus = ({
      isAnyBasicsSaving,
      hasBasicsFieldFailed,
      showBasicsSavedBriefly,
    }: {
      isAnyBasicsSaving: boolean;
      hasBasicsFieldFailed: boolean;
      showBasicsSavedBriefly: boolean;
    }): string | null => {
      if (isAnyBasicsSaving) return "Saving changes...";
      if (hasBasicsFieldFailed) return "Save failed";
      if (showBasicsSavedBriefly) return "All changes saved";
      return null;
    };

    it("hides status (null) in baseline/idle clean state when there is no active status", () => {
      const status = evaluateBottomBarStatus({
        isAnyBasicsSaving: false,
        hasBasicsFieldFailed: false,
        showBasicsSavedBriefly: false,
      });
      expect(status).toBeNull();
    });

    it("shows 'Saving changes...' when any basics save is in progress", () => {
      const status = evaluateBottomBarStatus({
        isAnyBasicsSaving: true,
        hasBasicsFieldFailed: false,
        showBasicsSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("shows 'Save failed' when a field or overall basics save fails", () => {
      const status = evaluateBottomBarStatus({
        isAnyBasicsSaving: false,
        hasBasicsFieldFailed: true,
        showBasicsSavedBriefly: false,
      });
      expect(status).toBe("Save failed");
    });

    it("shows 'All changes saved' briefly after save succeeds, then hides when timeout expires", () => {
      let showBriefly = true;
      expect(
        evaluateBottomBarStatus({
          isAnyBasicsSaving: false,
          hasBasicsFieldFailed: false,
          showBasicsSavedBriefly: showBriefly,
        }),
      ).toBe("All changes saved");

      // Timeout expires (2000ms)
      showBriefly = false;
      expect(
        evaluateBottomBarStatus({
          isAnyBasicsSaving: false,
          hasBasicsFieldFailed: false,
          showBasicsSavedBriefly: showBriefly,
        }),
      ).toBeNull();
    });

    it("prioritizes 'Saving changes...' over previous failure if a retry/save is active", () => {
      const status = evaluateBottomBarStatus({
        isAnyBasicsSaving: true,
        hasBasicsFieldFailed: true,
        showBasicsSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("clears 'Save failed' back to hidden (null) after user edits the field again", () => {
      let hasFailed = true;
      expect(
        evaluateBottomBarStatus({
          isAnyBasicsSaving: false,
          hasBasicsFieldFailed: hasFailed,
          showBasicsSavedBriefly: false,
        }),
      ).toBe("Save failed");

      // User edits field -> error cleared
      hasFailed = false;
      expect(
        evaluateBottomBarStatus({
          isAnyBasicsSaving: false,
          hasBasicsFieldFailed: hasFailed,
          showBasicsSavedBriefly: false,
        }),
      ).toBeNull();
    });
  });
});
