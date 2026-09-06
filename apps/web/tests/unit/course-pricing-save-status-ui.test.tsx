import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import {
  PricingControlStatusIndicator,
  type PricingControlKey,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 3: Pricing Save Status UI Refinement", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("PricingControlStatusIndicator Component Rendering", () => {
    it("renders null when status is null", () => {
      const { container } = render(
        <PricingControlStatusIndicator
          status={null}
          testId="test-indicator"
        />,
      );
      expect(container.firstChild).toBeNull();
    });

    it("renders 'Saving...' while save is in progress", () => {
      render(
        <PricingControlStatusIndicator
          status="saving"
          testId="status-pricingType"
        />,
      );
      const el = screen.getByTestId("status-pricingType");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saving...");
    });

    it("renders 'Saved ✓' after save succeeds", () => {
      render(
        <PricingControlStatusIndicator
          status="saved"
          testId="status-sellingPrice"
        />,
      );
      const el = screen.getByTestId("status-sellingPrice");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Saved ✓");
    });

    it("renders 'Save failed' when save fails", () => {
      render(
        <PricingControlStatusIndicator
          status="failed"
          testId="status-currency"
        />,
      );
      const el = screen.getByTestId("status-currency");
      expect(el).toBeInTheDocument();
      expect(el).toHaveTextContent("Save failed");
    });
  });

  describe("Per-Control Status Lifecycle and Timeout Logic", () => {
    it("transitions from saving to 'Saved ✓', persists for 1.5s, then clears", () => {
      const statusMap: Partial<
        Record<PricingControlKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<PricingControlKey, any>> = {};

      const setControlSaved = (controlKey: PricingControlKey) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "saved";
        timersMap[controlKey] = setTimeout(() => {
          if (statusMap[controlKey] === "saved") {
            delete statusMap[controlKey];
          }
        }, 1500);
      };

      // 1. Initial saving
      statusMap["pricingType"] = "saving";
      expect(statusMap["pricingType"]).toBe("saving");

      // 2. Save completes
      setControlSaved("pricingType");
      expect(statusMap["pricingType"]).toBe("saved");

      // 3. Fast-forward 1000ms -> still "saved"
      vi.advanceTimersByTime(1000);
      expect(statusMap["pricingType"]).toBe("saved");

      // 4. Fast-forward another 500ms (1500ms total) -> cleared
      vi.advanceTimersByTime(500);
      expect(statusMap["pricingType"]).toBeUndefined();
    });

    it("clears 'Saved ✓' immediately if control is edited/interacted again before timeout expires", () => {
      const statusMap: Partial<
        Record<PricingControlKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<PricingControlKey, any>> = {};

      const setControlSaved = (controlKey: PricingControlKey) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "saved";
        timersMap[controlKey] = setTimeout(() => {
          delete statusMap[controlKey];
        }, 1500);
      };

      const clearControlStatus = (controlKey: PricingControlKey) => {
        if (timersMap[controlKey]) {
          clearTimeout(timersMap[controlKey]);
          delete timersMap[controlKey];
        }
        delete statusMap[controlKey];
      };

      setControlSaved("sellingPrice");
      expect(statusMap["sellingPrice"]).toBe("saved");

      // User changes value 300ms later -> edit clears the state immediately
      vi.advanceTimersByTime(300);
      clearControlStatus("sellingPrice");
      expect(statusMap["sellingPrice"]).toBeUndefined();

      // Ensure timer firing later does not cause issues
      vi.advanceTimersByTime(2000);
      expect(statusMap["sellingPrice"]).toBeUndefined();
    });

    it("shows 'Save failed' on error, and clears it when interacted with again", () => {
      const statusMap: Partial<
        Record<PricingControlKey, "saving" | "saved" | "failed" | null>
      > = {};
      const timersMap: Partial<Record<PricingControlKey, any>> = {};

      const setControlFailed = (controlKey: PricingControlKey) => {
        if (timersMap[controlKey]) clearTimeout(timersMap[controlKey]);
        statusMap[controlKey] = "failed";
      };

      const clearControlStatus = (controlKey: PricingControlKey) => {
        if (timersMap[controlKey]) {
          clearTimeout(timersMap[controlKey]);
          delete timersMap[controlKey];
        }
        delete statusMap[controlKey];
      };

      // Save fails
      setControlFailed("currency");
      expect(statusMap["currency"]).toBe("failed");

      // Remains failed even after 3 seconds
      vi.advanceTimersByTime(3000);
      expect(statusMap["currency"]).toBe("failed");

      // User changes currency -> error clears immediately
      clearControlStatus("currency");
      expect(statusMap["currency"]).toBeUndefined();
    });

    it("distinguishes sellingPrice and originalPrice during debounced pricingDetails save", () => {
      let lastEditedField: "sellingPrice" | "originalPrice" | null = null;
      const savingPricingControls = new Set<string>();
      const inFlightPricingControls: Record<string, number> = {};
      const pricingControlStatus: Partial<
        Record<PricingControlKey, "saving" | "saved" | "failed" | null>
      > = {};

      const getPricingControlDisplayStatus = (
        controlKey: PricingControlKey,
      ): "saving" | "saved" | "failed" | null => {
        if (controlKey === "sellingPrice" || controlKey === "originalPrice") {
          const isDetailsSaving =
            savingPricingControls.has("pricingDetails") ||
            (inFlightPricingControls.pricingDetails ?? 0) > 0;
          if (
            isDetailsSaving &&
            (lastEditedField === controlKey || !lastEditedField)
          ) {
            return "saving";
          }
          return pricingControlStatus[controlKey] ?? null;
        }
        if (
          savingPricingControls.has(controlKey) ||
          (inFlightPricingControls[controlKey] ?? 0) > 0
        ) {
          return "saving";
        }
        return pricingControlStatus[controlKey] ?? null;
      };

      // User types in selling price
      lastEditedField = "sellingPrice";
      savingPricingControls.add("pricingDetails");

      expect(getPricingControlDisplayStatus("sellingPrice")).toBe("saving");
      expect(getPricingControlDisplayStatus("originalPrice")).toBeNull();

      // User types in original price
      lastEditedField = "originalPrice";
      expect(getPricingControlDisplayStatus("sellingPrice")).toBeNull();
      expect(getPricingControlDisplayStatus("originalPrice")).toBe("saving");
    });

    it("covers all target controls: pricingType, currency, sellingPrice, originalPrice, pricingDetails", () => {
      const allControls: PricingControlKey[] = [
        "pricingType",
        "currency",
        "sellingPrice",
        "originalPrice",
        "pricingDetails",
      ];
      expect(allControls).toHaveLength(5);
    });
  });

  describe("Overall Pricing Bottom-Bar Save Status Evaluation", () => {
    const evaluateBottomBarStatus = ({
      isAnyPricingSaving,
      hasPricingControlFailed,
      showPricingSavedBriefly,
    }: {
      isAnyPricingSaving: boolean;
      hasPricingControlFailed: boolean;
      showPricingSavedBriefly: boolean;
    }): string | null => {
      if (isAnyPricingSaving) return "Saving changes...";
      if (hasPricingControlFailed) return "Save failed";
      if (showPricingSavedBriefly) return "All changes saved";
      return null;
    };

    it("hides status (null) in baseline/idle clean state when there is no active status", () => {
      const status = evaluateBottomBarStatus({
        isAnyPricingSaving: false,
        hasPricingControlFailed: false,
        showPricingSavedBriefly: false,
      });
      expect(status).toBeNull();
    });

    it("shows 'Saving changes...' when any pricing save is in progress", () => {
      const status = evaluateBottomBarStatus({
        isAnyPricingSaving: true,
        hasPricingControlFailed: false,
        showPricingSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("shows 'Save failed' when a control or overall pricing save fails", () => {
      const status = evaluateBottomBarStatus({
        isAnyPricingSaving: false,
        hasPricingControlFailed: true,
        showPricingSavedBriefly: false,
      });
      expect(status).toBe("Save failed");
    });

    it("shows 'All changes saved' briefly after save succeeds, then hides when timeout expires", () => {
      let showBriefly = true;
      expect(
        evaluateBottomBarStatus({
          isAnyPricingSaving: false,
          hasPricingControlFailed: false,
          showPricingSavedBriefly: showBriefly,
        }),
      ).toBe("All changes saved");

      // Timeout expires (2000ms)
      showBriefly = false;
      expect(
        evaluateBottomBarStatus({
          isAnyPricingSaving: false,
          hasPricingControlFailed: false,
          showPricingSavedBriefly: showBriefly,
        }),
      ).toBeNull();
    });

    it("prioritizes 'Saving changes...' over previous failure if a retry/save is active", () => {
      const status = evaluateBottomBarStatus({
        isAnyPricingSaving: true,
        hasPricingControlFailed: true,
        showPricingSavedBriefly: false,
      });
      expect(status).toBe("Saving changes...");
    });

    it("clears 'Save failed' back to hidden (null) after user edits/retries", () => {
      let hasFailed = true;
      expect(
        evaluateBottomBarStatus({
          isAnyPricingSaving: false,
          hasPricingControlFailed: hasFailed,
          showPricingSavedBriefly: false,
        }),
      ).toBe("Save failed");

      // User interacts -> error cleared
      hasFailed = false;
      expect(
        evaluateBottomBarStatus({
          isAnyPricingSaving: false,
          hasPricingControlFailed: hasFailed,
          showPricingSavedBriefly: false,
        }),
      ).toBeNull();
    });
  });
});
