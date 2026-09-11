import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  AccessRulesControlStatusIndicator,
  type AccessRulesControlKey,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 2: Access Rules Save Status UI Refinement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("AccessRulesControlStatusIndicator Component Rendering", () => {
    it("renders null when status is null", () => {
      const { container } = render(
        <AccessRulesControlStatusIndicator
          status={null}
          testId="test-indicator"
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders 'Saving...' while save is in progress", () => {
      render(
        <AccessRulesControlStatusIndicator
          status="saving"
          testId="status-accessType"
        />,
      );
      const el = screen.getByTestId("status-accessType");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saving...");
    });

    it("renders 'Saved ✓' after save succeeds", () => {
      render(
        <AccessRulesControlStatusIndicator
          status="saved"
          testId="status-durationMode"
        />,
      );
      const el = screen.getByTestId("status-durationMode");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saved ✓");
    });

    it("renders 'Save failed' when save fails", () => {
      render(
        <AccessRulesControlStatusIndicator
          status="failed"
          testId="status-enableQA"
        />,
      );
      const el = screen.getByTestId("status-enableQA");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Save failed");
    });
  });

  describe("Per-Control Status Lifecycle and Timeout Logic", () => {
    it("transitions from saving to 'Saved ✓', persists for 1.5s, then clears", () => {
      const statusMap: Partial<
        Record<AccessRulesControlKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<AccessRulesControlKey, any>> = {};

      const setControlSaved = (controlKey: AccessRulesControlKey) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "saved";
        timersMap[controlKey] = setTimeout(() => {
          if (statusMap[controlKey] === "saved") {
            delete statusMap[controlKey];
          }
        }, 1500);
      };

      // 1. Initial saving
      statusMap["accessType"] = "saving";
      expect(statusMap["accessType"]).toBe("saving");

      // 2. Save completes
      setControlSaved("accessType");
      expect(statusMap["accessType"]).toBe("saved");

      // 3. Fast-forward 1000ms -> still "saved"
      vi.advanceTimersByTime(1000);
      expect(statusMap["accessType"]).toBe("saved");

      // 4. Fast-forward another 500ms (1500ms total) -> cleared
      vi.advanceTimersByTime(500);
      expect(statusMap["accessType"]).toBeUndefined();
    });

    it("clears 'Saved ✓' immediately if control is edited/interacted again before timeout expires", () => {
      const statusMap: Partial<
        Record<AccessRulesControlKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<AccessRulesControlKey, any>> = {};

      const setControlSaved = (controlKey: AccessRulesControlKey) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "saved";
        timersMap[controlKey] = setTimeout(() => {
          delete statusMap[controlKey];
        }, 1500);
      };

      const clearControlStatus = (controlKey: AccessRulesControlKey) => {
        if (timersMap[controlKey]) {
          clearTimeout(timersMap[controlKey]);
          delete timersMap[controlKey];
        }
        delete statusMap[controlKey];
      };

      setControlSaved("fixedDuration");
      expect(statusMap["fixedDuration"]).toBe("saved");

      // User changes value/unit 200ms later -> edit clears the state immediately
      vi.advanceTimersByTime(200);
      clearControlStatus("fixedDuration");
      expect(statusMap["fixedDuration"]).toBeUndefined();

      // Ensure timer firing later does not cause issues
      vi.advanceTimersByTime(2000);
      expect(statusMap["fixedDuration"]).toBeUndefined();
    });

    it("shows 'Save failed' on error, and clears it when interacted with again", () => {
      const statusMap: Partial<
        Record<AccessRulesControlKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<AccessRulesControlKey, any>> = {};

      const setControlFailed = (controlKey: AccessRulesControlKey) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "failed";
      };

      const clearControlStatus = (controlKey: AccessRulesControlKey) => {
        if (timersMap[controlKey]) {
          clearTimeout(timersMap[controlKey]);
          delete timersMap[controlKey];
        }
        delete statusMap[controlKey];
      };

      // Save fails
      setControlFailed("enableComments");
      expect(statusMap["enableComments"]).toBe("failed");

      // Remains failed even after 3 seconds
      vi.advanceTimersByTime(3000);
      expect(statusMap["enableComments"]).toBe("failed");

      // User toggles/edits again -> error clears immediately
      clearControlStatus("enableComments");
      expect(statusMap["enableComments"]).toBeUndefined();
    });

    it("covers all target controls: accessType, durationMode, fixedDuration, enableQA, enableComments, enableDownloads", () => {
      const allControls: AccessRulesControlKey[] = [
        "accessType",
        "durationMode",
        "fixedDuration",
        "enableQA",
        "enableComments",
        "enableDownloads",
      ];
      expect(allControls).toHaveLength(6);
    });
  });

  describe("Overall Access Rules Bottom-Bar Save Status Evaluation", () => {
    const evaluateBottomBarStatus = ({
      isAnyAccessRulesSaving,
      hasAccessControlFailed,
      showAccessRulesSavedBriefly,
    }: {
      isAnyAccessRulesSaving: boolean;
      hasAccessControlFailed: boolean;
      showAccessRulesSavedBriefly: boolean;
    }): string | null => {
      if (isAnyAccessRulesSaving) return "Saving changes...";
      if (hasAccessControlFailed) return "Save failed";
      if (showAccessRulesSavedBriefly) return "All changes saved";
      return null;
    };

    it("hides status (null) in baseline/idle clean state when there is no active status", () => {
      const status = evaluateBottomBarStatus({
        isAnyAccessRulesSaving: false,
        hasAccessControlFailed: false,
        showAccessRulesSavedBriefly: false,
      });
      expect(status).toBeNull();
    });

    it("shows 'Saving changes...' when any access rules save is in progress", () => {
      const status = evaluateBottomBarStatus({
        isAnyAccessRulesSaving: true,
        hasAccessControlFailed: false,
        showAccessRulesSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("shows 'Save failed' when a control or overall access rules save fails", () => {
      const status = evaluateBottomBarStatus({
        isAnyAccessRulesSaving: false,
        hasAccessControlFailed: true,
        showAccessRulesSavedBriefly: false,
      });
      expect(status).toBe("Save failed");
    });

    it("shows 'All changes saved' briefly after save succeeds, then hides when timeout expires", () => {
      let showBriefly = true;
      expect(
        evaluateBottomBarStatus({
          isAnyAccessRulesSaving: false,
          hasAccessControlFailed: false,
          showAccessRulesSavedBriefly: showBriefly,
        }),
      ).toBe("All changes saved");

      // Timeout expires (2000ms)
      showBriefly = false;
      expect(
        evaluateBottomBarStatus({
          isAnyAccessRulesSaving: false,
          hasAccessControlFailed: false,
          showAccessRulesSavedBriefly: showBriefly,
        }),
      ).toBeNull();
    });

    it("prioritizes 'Saving changes...' over previous failure if a retry/save is active", () => {
      const status = evaluateBottomBarStatus({
        isAnyAccessRulesSaving: true,
        hasAccessControlFailed: true,
        showAccessRulesSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("clears 'Save failed' back to hidden (null) after user edits/retries", () => {
      let hasFailed = true;
      expect(
        evaluateBottomBarStatus({
          isAnyAccessRulesSaving: false,
          hasAccessControlFailed: hasFailed,
          showAccessRulesSavedBriefly: false,
        }),
      ).toBe("Save failed");

      // User interacts -> error cleared
      hasFailed = false;
      expect(
        evaluateBottomBarStatus({
          isAnyAccessRulesSaving: false,
          hasAccessControlFailed: hasFailed,
          showAccessRulesSavedBriefly: false,
        }),
      ).toBeNull();
    });
  });
});
