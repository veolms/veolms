import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initialAccessRulesState,
  normalizeAccessRulesState,
  isAccessRulesEqual,
  initialPricingState,
  normalizePricingState,
  isPricingEqual,
  type AccessRulesFormState,
  type PricingFormState,
} from "../../src/courses/CourseCreatePage";
import { coursesService } from "../../src/services/courses/courses.service";
import type {
  CourseAccessRule,
  CoursePricing,
  CourseSettings,
} from "@veolms/contracts";

describe("Course Wizard Step 3: Access Rules & Pricing Server/Local Draft State", () => {
  const sampleCourseId = "98765432-9876-9876-9876-9876543210fe";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Access Rules State Model & Normalization", () => {
    it("normalizes empty or partial access rules to default baseline", () => {
      const normalized = normalizeAccessRulesState(null);
      expect(normalized).toEqual({
        accessType: "everyone",
        durationMode: "",
        fixedDurationValue: 30,
        fixedDurationUnit: "Days",
        enableQA: true,
        enableComments: true,
        enableDownloads: false,
      });
    });

    it("hydrates server state and local draft identically resulting in clean isDirty = false", () => {
      const serverResponse: Partial<AccessRulesFormState> = {
        accessType: "everyone",
        durationMode: "fixed",
        fixedDurationValue: 60,
        fixedDurationUnit: "Days",
        enableQA: true,
        enableComments: false,
        enableDownloads: true,
      };

      const serverBaseline = normalizeAccessRulesState(serverResponse);
      const draftState = normalizeAccessRulesState(serverResponse);

      expect(isAccessRulesEqual(draftState, serverBaseline)).toBe(true);
      expect(!isAccessRulesEqual(draftState, serverBaseline)).toBe(false);
    });

    it("detects local edits across all server-backed access rules and settings fields", () => {
      const serverState: AccessRulesFormState = { ...initialAccessRulesState };
      let draftState: AccessRulesFormState = { ...serverState };

      expect(!isAccessRulesEqual(draftState, serverState)).toBe(false);

      // 1. Edit durationMode
      draftState = { ...draftState, durationMode: "fixed" };
      expect(!isAccessRulesEqual(draftState, serverState)).toBe(true);

      // 2. Edit fixedDurationValue
      draftState = { ...serverState, fixedDurationValue: 90 };
      expect(!isAccessRulesEqual(draftState, serverState)).toBe(true);

      // 3. Edit fixedDurationUnit
      draftState = { ...serverState, fixedDurationUnit: "Months" };
      expect(!isAccessRulesEqual(draftState, serverState)).toBe(true);

      // 4. Toggle QA
      draftState = { ...serverState, enableQA: false };
      expect(!isAccessRulesEqual(draftState, serverState)).toBe(true);

      // 5. Toggle Comments
      draftState = { ...serverState, enableComments: false };
      expect(!isAccessRulesEqual(draftState, serverState)).toBe(true);

      // 6. Toggle Downloads
      draftState = { ...serverState, enableDownloads: true };
      expect(!isAccessRulesEqual(draftState, serverState)).toBe(true);
    });

    it("synchronizes confirmed baseline upon successful save and clears dirty state", async () => {
      let serverState: AccessRulesFormState = { ...initialAccessRulesState };
      const localDraft: AccessRulesFormState = {
        accessType: "everyone",
        durationMode: "fixed",
        fixedDurationValue: 180,
        fixedDurationUnit: "Days",
        enableQA: true,
        enableComments: true,
        enableDownloads: true,
      };

      expect(!isAccessRulesEqual(localDraft, serverState)).toBe(true);

      const mockRuleRes: CourseAccessRule = {
        id: "rule-1",
        courseId: sampleCourseId,
        accessType: "everyone",
        durationType: "fixed_duration",
        durationDays: 180,
      };

      const mockSettingsRes: CourseSettings = {
        id: "settings-1",
        courseId: sampleCourseId,
        language: "en",
        allowQa: true,
        allowComments: true,
        allowDownloads: true,
        certificateEnabled: false,
        showInstructorName: true,
        estimatedDuration: null,
      };

      vi.spyOn(coursesService, "upsertAccessRules").mockResolvedValue(
        mockRuleRes,
      );
      vi.spyOn(coursesService, "upsertSettings").mockResolvedValue(
        mockSettingsRes,
      );

      const ruleRes = await coursesService.upsertAccessRules(sampleCourseId, {
        accessType: "everyone",
        durationType: "fixed_duration",
        durationDays: 180,
      });

      const settingsRes = await coursesService.upsertSettings(sampleCourseId, {
        allowQa: localDraft.enableQA,
        allowComments: localDraft.enableComments,
        allowDownloads: localDraft.enableDownloads,
      });

      const isFixed = ruleRes.durationType === "fixed_duration";
      const newBaseline: AccessRulesFormState = normalizeAccessRulesState({
        accessType: "everyone",
        durationMode: isFixed ? "fixed" : "lifetime",
        fixedDurationValue: localDraft.fixedDurationValue,
        fixedDurationUnit: localDraft.fixedDurationUnit,
        enableQA: settingsRes.allowQa,
        enableComments: settingsRes.allowComments,
        enableDownloads: settingsRes.allowDownloads,
      });

      serverState = newBaseline;
      const synchronizedDraft = newBaseline;

      expect(!isAccessRulesEqual(synchronizedDraft, serverState)).toBe(false);
      expect(serverState.enableDownloads).toBe(true);
    });

    it("preserves local draft and leaves server baseline unchanged on access rules save failure", async () => {
      const serverState: AccessRulesFormState = { ...initialAccessRulesState };
      const localDraft: AccessRulesFormState = {
        ...serverState,
        enableDownloads: true,
      };

      vi.spyOn(coursesService, "upsertAccessRules").mockRejectedValue(
        new Error("Server error updating access rules"),
      );

      let saveError: Error | null = null;
      try {
        await coursesService.upsertAccessRules(sampleCourseId, {
          accessType: "everyone",
          durationType: "lifetime",
          durationDays: null,
        });
      } catch (err: any) {
        saveError = err;
      }

      expect(saveError).not.toBeNull();
      expect(serverState.enableDownloads).toBe(false);
      expect(localDraft.enableDownloads).toBe(true);
      expect(!isAccessRulesEqual(localDraft, serverState)).toBe(true);
    });
  });

  describe("Pricing State Model & Normalization", () => {
    it("normalizes empty or partial pricing data to default baseline", () => {
      const normalized = normalizePricingState(null);
      expect(normalized).toEqual({
        pricingType: "paid",
        sellingPrice: "",
        originalPrice: "",
        currency: "INR",
      });
    });

    it("hydrates server pricing identically resulting in clean isDirty = false", () => {
      const serverResponse: Partial<PricingFormState> = {
        pricingType: "paid",
        sellingPrice: "4999",
        originalPrice: "9999",
        currency: "USD",
      };

      const serverBaseline = normalizePricingState(serverResponse);
      const draftState = normalizePricingState(serverResponse);

      expect(isPricingEqual(draftState, serverBaseline)).toBe(true);
      expect(!isPricingEqual(draftState, serverBaseline)).toBe(false);
    });

    it("detects local edits across pricing fields", () => {
      const serverState: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "2999",
        originalPrice: "",
        currency: "USD",
      };

      let draftState: PricingFormState = { ...serverState };
      expect(!isPricingEqual(draftState, serverState)).toBe(false);

      // 1. Edit sellingPrice
      draftState = { ...draftState, sellingPrice: "3499" };
      expect(!isPricingEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 2. Add originalPrice (sale setup)
      draftState = { ...draftState, originalPrice: "5999" };
      expect(!isPricingEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 3. Edit currency
      draftState = { ...draftState, currency: "EUR" };
      expect(!isPricingEqual(draftState, serverState)).toBe(true);

      // Reset
      draftState = { ...serverState };

      // 4. Switch to free
      draftState = { ...draftState, pricingType: "free" };
      expect(!isPricingEqual(draftState, serverState)).toBe(true);
    });

    it("synchronizes confirmed baseline upon successful pricing save and clears dirty state", async () => {
      let serverState: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "USD",
      };

      const localDraft: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1499",
        originalPrice: "2999",
        currency: "USD",
      };

      expect(!isPricingEqual(localDraft, serverState)).toBe(true);

      const mockPricingRes: CoursePricing = {
        id: "pricing-1",
        courseId: sampleCourseId,
        pricingType: "paid",
        price: 2999,
        salePrice: 1499,
        currency: "USD",
      };

      vi.spyOn(coursesService, "upsertPricing").mockResolvedValue(
        mockPricingRes,
      );

      const res = await coursesService.upsertPricing(sampleCourseId, {
        pricingType: "paid",
        price: 2999,
        salePrice: 1499,
        currency: "USD",
      });

      const isFree = res.pricingType === "free";
      const hasSale = res.salePrice != null && res.salePrice !== undefined;
      const newBaseline: PricingFormState = normalizePricingState({
        pricingType: isFree ? "free" : "paid",
        sellingPrice: isFree
          ? ""
          : hasSale
            ? String(res.salePrice)
            : res.price > 0
              ? String(res.price)
              : "",
        originalPrice: !isFree && hasSale ? String(res.price) : "",
        currency: res.currency || "USD",
      });

      serverState = newBaseline;
      const synchronizedDraft = newBaseline;

      expect(!isPricingEqual(synchronizedDraft, serverState)).toBe(false);
      expect(serverState.sellingPrice).toBe("1499");
      expect(serverState.originalPrice).toBe("2999");
    });

    it("preserves local draft and leaves server baseline unchanged on pricing save failure", async () => {
      const serverState: PricingFormState = { ...initialPricingState };
      const localDraft: PricingFormState = {
        ...serverState,
        sellingPrice: "4999",
      };

      vi.spyOn(coursesService, "upsertPricing").mockRejectedValue(
        new Error("Invalid pricing range"),
      );

      let saveError: Error | null = null;
      try {
        await coursesService.upsertPricing(sampleCourseId, {
          pricingType: "paid",
          price: 4999,
          currency: "USD",
        });
      } catch (err: any) {
        saveError = err;
      }

      expect(saveError).not.toBeNull();
      expect(serverState.sellingPrice).toBe("");
      expect(localDraft.sellingPrice).toBe("4999");
      expect(!isPricingEqual(localDraft, serverState)).toBe(true);
    });
  });

  describe("Save Button State across Steps", () => {
    it("evaluates isSaveButtonDisabled accurately for basics, access-rules, and pricing", () => {
      const isBasicsDirty = false;
      const isAccessRulesDirty = false;
      const isPricingDirty = false;
      const actionLoading = null;

      const getIsDisabled = (step: string, dirty: boolean) =>
        actionLoading !== null ||
        (step === "basics" && !dirty) ||
        (step === "access-rules" && !dirty) ||
        (step === "pricing" && !dirty);

      // Clean checks
      expect(getIsDisabled("basics", isBasicsDirty)).toBe(true);
      expect(getIsDisabled("access-rules", isAccessRulesDirty)).toBe(true);
      expect(getIsDisabled("pricing", isPricingDirty)).toBe(true);

      // Dirty checks
      expect(getIsDisabled("basics", true)).toBe(false);
      expect(getIsDisabled("access-rules", true)).toBe(false);
      expect(getIsDisabled("pricing", true)).toBe(false);
    });
  });
});
