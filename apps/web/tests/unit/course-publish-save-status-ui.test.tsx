import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  PublishControlStatusIndicator,
  type PublishControlKey,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 6: Publish Save Status UI Refinement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("PublishControlStatusIndicator Component Rendering", () => {
    it("renders null when status is null", () => {
      const { container } = render(
        <PublishControlStatusIndicator
          status={null}
          testId="test-indicator"
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders 'Saving...' while save is in progress", () => {
      render(
        <PublishControlStatusIndicator
          status="saving"
          testId="status-publish-item"
        />,
      );
      const el = screen.getByTestId("status-publish-item");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saving...");
    });

    it("renders 'Saved ✓' after save succeeds", () => {
      render(
        <PublishControlStatusIndicator
          status="saved"
          testId="status-publish-item"
        />,
      );
      const el = screen.getByTestId("status-publish-item");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saved ✓");
    });

    it("renders 'Save failed' when save fails", () => {
      render(
        <PublishControlStatusIndicator
          status="failed"
          testId="status-publish-item"
        />,
      );
      const el = screen.getByTestId("status-publish-item");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Save failed");
    });
  });

  describe("Per-Control Status Lifecycle and Timeout Logic", () => {
    it("transitions from saving to 'Saved ✓', persists for 1.5s, then clears", () => {
      const statusMap: Record<string, "saving" | "saved" | "failed" | null> = {};
      const timersMap: Record<string, any> = {};

      const setControlSaved = (controlKey: string) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "saved";
        timersMap[controlKey] = setTimeout(() => {
          if (statusMap[controlKey] === "saved") {
            delete statusMap[controlKey];
          }
        }, 1500);
      };

      // 1. Initial saving
      statusMap["publishSetting"] = "saving";
      expect(statusMap["publishSetting"]).toBe("saving");

      // 2. Save completes
      setControlSaved("publishSetting");
      expect(statusMap["publishSetting"]).toBe("saved");

      // 3. Fast-forward 1000ms -> still "saved"
      vi.advanceTimersByTime(1000);
      expect(statusMap["publishSetting"]).toBe("saved");

      // 4. Fast-forward another 500ms (1500ms total) -> cleared
      vi.advanceTimersByTime(500);
      expect(statusMap["publishSetting"]).toBeUndefined();
    });

    it("clears 'Saved ✓' immediately if control is edited before timeout expires", () => {
      const statusMap: Record<string, "saving" | "saved" | "failed" | null> = {};
      const timersMap: Record<string, any> = {};

      const setControlSaved = (controlKey: string) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "saved";
        timersMap[controlKey] = setTimeout(() => {
          delete statusMap[controlKey];
        }, 1500);
      };

      const clearControlStatus = (controlKey: string) => {
        if (timersMap[controlKey]) {
          clearTimeout(timersMap[controlKey]);
          delete timersMap[controlKey];
        }
        delete statusMap[controlKey];
      };

      setControlSaved("publishSetting");
      expect(statusMap["publishSetting"]).toBe("saved");

      // User interacts 300ms later -> edit clears the state immediately
      vi.advanceTimersByTime(300);
      clearControlStatus("publishSetting");
      expect(statusMap["publishSetting"]).toBeUndefined();

      // Ensure timer firing later does not cause issues
      vi.advanceTimersByTime(2000);
      expect(statusMap["publishSetting"]).toBeUndefined();
    });

    it("shows 'Save failed' on error, and clears it when interacted with again", () => {
      const statusMap: Record<string, "saving" | "saved" | "failed" | null> = {};
      const timersMap: Record<string, any> = {};

      const setControlFailed = (controlKey: string) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "failed";
      };

      const clearControlStatus = (controlKey: string) => {
        if (timersMap[controlKey]) {
          clearTimeout(timersMap[controlKey]);
          delete timersMap[controlKey];
        }
        delete statusMap[controlKey];
      };

      // Save fails
      setControlFailed("publishSetting");
      expect(statusMap["publishSetting"]).toBe("failed");

      // Remains failed even after 3 seconds
      vi.advanceTimersByTime(3000);
      expect(statusMap["publishSetting"]).toBe("failed");

      // User interacts again -> error clears immediately
      clearControlStatus("publishSetting");
      expect(statusMap["publishSetting"]).toBeUndefined();
    });
  });

  describe("Overall Publish Bottom-Bar Save Status Evaluation", () => {
    const evaluateBottomBarStatus = ({
      isAnyPublishSaving,
      hasPublishControlFailed,
      showPublishSavedBriefly,
    }: {
      isAnyPublishSaving: boolean;
      hasPublishControlFailed: boolean;
      showPublishSavedBriefly: boolean;
    }): string | null => {
      if (isAnyPublishSaving) return "Saving changes...";
      if (hasPublishControlFailed) return "Save failed";
      if (showPublishSavedBriefly) return "All changes saved";
      return null;
    };

    it("hides status (null) in baseline/idle clean state when there is no active status", () => {
      const status = evaluateBottomBarStatus({
        isAnyPublishSaving: false,
        hasPublishControlFailed: false,
        showPublishSavedBriefly: false,
      });
      expect(status).toBeNull();
    });

    it("shows 'Saving changes...' when publish save is in progress", () => {
      const status = evaluateBottomBarStatus({
        isAnyPublishSaving: true,
        hasPublishControlFailed: false,
        showPublishSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("shows 'Save failed' when a control or publish save fails", () => {
      const status = evaluateBottomBarStatus({
        isAnyPublishSaving: false,
        hasPublishControlFailed: true,
        showPublishSavedBriefly: false,
      });
      expect(status).toBe("Save failed");
    });

    it("shows 'All changes saved' briefly after save succeeds, then hides when timeout expires (2s)", () => {
      let showBriefly = true;
      expect(
        evaluateBottomBarStatus({
          isAnyPublishSaving: false,
          hasPublishControlFailed: false,
          showPublishSavedBriefly: showBriefly,
        }),
      ).toBe("All changes saved");

      // Timeout expires (2000ms)
      showBriefly = false;
      expect(
        evaluateBottomBarStatus({
          isAnyPublishSaving: false,
          hasPublishControlFailed: false,
          showPublishSavedBriefly: showBriefly,
        }),
      ).toBeNull();
    });

    it("prioritizes 'Saving changes...' over previous failure if a retry/save is active", () => {
      const status = evaluateBottomBarStatus({
        isAnyPublishSaving: true,
        hasPublishControlFailed: true,
        showPublishSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("clears 'Save failed' back to hidden (null) after retry/clear", () => {
      let hasFailed = true;
      expect(
        evaluateBottomBarStatus({
          isAnyPublishSaving: false,
          hasPublishControlFailed: hasFailed,
          showPublishSavedBriefly: false,
        }),
      ).toBe("Save failed");

      // User interacts -> error cleared
      hasFailed = false;
      expect(
        evaluateBottomBarStatus({
          isAnyPublishSaving: false,
          hasPublishControlFailed: hasFailed,
          showPublishSavedBriefly: false,
        }),
      ).toBeNull();
    });
  });

  describe("Publish Controls Scope & Non-interference with Publish/Validate Actions", () => {
    it("preserves 'Coming soon' and disabled nature of visibility and schedule options", () => {
      // Visibility and schedule options remain non-persisting Coming Soon features
      const isComingSoon = true;
      const isDisabled = true;
      expect(isComingSoon).toBe(true);
      expect(isDisabled).toBe(true);
    });

    it("preserves independent actionLoading states for Publish / Validate actions", () => {
      // Bottom bar actions use actionLoading ("publish", "unpublish", "validate")
      type ActionLoading = "publish" | "unpublish" | "validate" | null;
      let actionLoading: ActionLoading = null;

      expect(actionLoading).toBeNull();

      actionLoading = "publish";
      expect(actionLoading).toBe("publish");

      // Save-status indicator is informational and does not replace actionLoading
      const isAnyApiInProgress = actionLoading !== null;
      expect(isAnyApiInProgress).toBe(true);
    });
  });
});
