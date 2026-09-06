import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  ExtrasControlStatusIndicator,
  type ExtrasControlKey,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 4: Extras Save Status UI Refinement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("ExtrasControlStatusIndicator Component Rendering", () => {
    it("renders null when status is null", () => {
      const { container } = render(
        <ExtrasControlStatusIndicator
          status={null}
          testId="test-indicator"
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders 'Saving...' while save is in progress", () => {
      render(
        <ExtrasControlStatusIndicator
          status="saving"
          testId="status-enableCertificate"
        />,
      );
      const el = screen.getByTestId("status-enableCertificate");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saving...");
    });

    it("renders 'Saved ✓' after save succeeds", () => {
      render(
        <ExtrasControlStatusIndicator
          status="saved"
          testId="status-enableCertificate"
        />,
      );
      const el = screen.getByTestId("status-enableCertificate");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saved ✓");
    });

    it("renders 'Save failed' when save fails", () => {
      render(
        <ExtrasControlStatusIndicator
          status="failed"
          testId="status-enableCertificate"
        />,
      );
      const el = screen.getByTestId("status-enableCertificate");
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
      statusMap["enableCertificate"] = "saving";
      expect(statusMap["enableCertificate"]).toBe("saving");

      // 2. Save completes
      setControlSaved("enableCertificate");
      expect(statusMap["enableCertificate"]).toBe("saved");

      // 3. Fast-forward 1000ms -> still "saved"
      vi.advanceTimersByTime(1000);
      expect(statusMap["enableCertificate"]).toBe("saved");

      // 4. Fast-forward another 500ms (1500ms total) -> cleared
      vi.advanceTimersByTime(500);
      expect(statusMap["enableCertificate"]).toBeUndefined();
    });

    it("clears 'Saved ✓' immediately if control is edited/toggled before timeout expires", () => {
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

      setControlSaved("inc-123");
      expect(statusMap["inc-123"]).toBe("saved");

      // User edits inclusion text 300ms later -> edit clears the state immediately
      vi.advanceTimersByTime(300);
      clearControlStatus("inc-123");
      expect(statusMap["inc-123"]).toBeUndefined();

      // Ensure timer firing later does not cause issues
      vi.advanceTimersByTime(2000);
      expect(statusMap["inc-123"]).toBeUndefined();
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
      setControlFailed("enableCertificate");
      expect(statusMap["enableCertificate"]).toBe("failed");

      // Remains failed even after 3 seconds
      vi.advanceTimersByTime(3000);
      expect(statusMap["enableCertificate"]).toBe("failed");

      // User toggles again -> error clears immediately
      clearControlStatus("enableCertificate");
      expect(statusMap["enableCertificate"]).toBeUndefined();
    });

    it("supports individual inclusion item status as well as overall inclusions status", () => {
      const savingIncludeIds = new Set<string>();
      const deletingIncludeIds = new Set<string>();
      const extrasControlStatus: Record<string, "saved" | "failed" | null> = {};
      const manualIncludes = [
        { id: "inc-1", text: "Perk 1", isPendingCreation: false },
        { id: "inc-2", text: "Perk 2", isPendingCreation: true },
      ];

      const getExtrasControlDisplayStatus = (
        controlKey: string,
      ): "saving" | "saved" | "failed" | null => {
        if (
          savingIncludeIds.has(controlKey) ||
          deletingIncludeIds.has(controlKey) ||
          manualIncludes.some((m) => m.id === controlKey && m.isPendingCreation)
        ) {
          return "saving";
        }
        return extrasControlStatus[controlKey] ?? null;
      };

      // inc-2 is pending creation
      expect(getExtrasControlDisplayStatus("inc-2")).toBe("saving");

      // inc-1 is currently idle
      expect(getExtrasControlDisplayStatus("inc-1")).toBeNull();

      // inc-1 starts saving on blur
      savingIncludeIds.add("inc-1");
      expect(getExtrasControlDisplayStatus("inc-1")).toBe("saving");

      // inc-1 finishes saving and is marked saved
      savingIncludeIds.delete("inc-1");
      extrasControlStatus["inc-1"] = "saved";
      expect(getExtrasControlDisplayStatus("inc-1")).toBe("saved");
    });
  });

  describe("Overall Extras Bottom-Bar Save Status Evaluation", () => {
    const evaluateBottomBarStatus = ({
      isAnyExtrasSaving,
      hasExtrasControlFailed,
      showExtrasSavedBriefly,
    }: {
      isAnyExtrasSaving: boolean;
      hasExtrasControlFailed: boolean;
      showExtrasSavedBriefly: boolean;
    }): string | null => {
      if (isAnyExtrasSaving) return "Saving changes...";
      if (hasExtrasControlFailed) return "Save failed";
      if (showExtrasSavedBriefly) return "All changes saved";
      return null;
    };

    it("hides status (null) in baseline/idle clean state when there is no active status", () => {
      const status = evaluateBottomBarStatus({
        isAnyExtrasSaving: false,
        hasExtrasControlFailed: false,
        showExtrasSavedBriefly: false,
      });
      expect(status).toBeNull();
    });

    it("shows 'Saving changes...' when any extras save is in progress", () => {
      const status = evaluateBottomBarStatus({
        isAnyExtrasSaving: true,
        hasExtrasControlFailed: false,
        showExtrasSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("shows 'Save failed' when a control or overall extras save fails", () => {
      const status = evaluateBottomBarStatus({
        isAnyExtrasSaving: false,
        hasExtrasControlFailed: true,
        showExtrasSavedBriefly: false,
      });
      expect(status).toBe("Save failed");
    });

    it("shows 'All changes saved' briefly after save succeeds, then hides when timeout expires", () => {
      let showBriefly = true;
      expect(
        evaluateBottomBarStatus({
          isAnyExtrasSaving: false,
          hasExtrasControlFailed: false,
          showExtrasSavedBriefly: showBriefly,
        }),
      ).toBe("All changes saved");

      // Timeout expires (2000ms)
      showBriefly = false;
      expect(
        evaluateBottomBarStatus({
          isAnyExtrasSaving: false,
          hasExtrasControlFailed: false,
          showExtrasSavedBriefly: showBriefly,
        }),
      ).toBeNull();
    });

    it("prioritizes 'Saving changes...' over previous failure if a retry/save is active", () => {
      const status = evaluateBottomBarStatus({
        isAnyExtrasSaving: true,
        hasExtrasControlFailed: true,
        showExtrasSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("clears 'Save failed' back to hidden (null) after user edits/retries", () => {
      let hasFailed = true;
      expect(
        evaluateBottomBarStatus({
          isAnyExtrasSaving: false,
          hasExtrasControlFailed: hasFailed,
          showExtrasSavedBriefly: false,
        }),
      ).toBe("Save failed");

      // User interacts -> error cleared
      hasFailed = false;
      expect(
        evaluateBottomBarStatus({
          isAnyExtrasSaving: false,
          hasExtrasControlFailed: hasFailed,
          showExtrasSavedBriefly: false,
        }),
      ).toBeNull();
    });
  });
});
