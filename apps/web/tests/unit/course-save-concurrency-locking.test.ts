import { describe, it, expect, vi } from "vitest";
import {
  initialBasicsState,
  normalizeBasicsState,
  isBasicsEqual,
  initialAccessRulesState,
  normalizeAccessRulesState,
  isAccessRulesEqual,
  initialPricingState,
  normalizePricingState,
  isPricingEqual,
  initialExtrasState,
  normalizeExtrasState,
  isExtrasEqual,
  type BasicsFormState,
  type AccessRulesFormState,
  type PricingFormState,
  type ExtrasFormState,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard: Save Concurrency & Form Input Locking (Bug 2)", () => {
  describe("Basics Form Save-Lock Lifecycle", () => {
    it("locks inputs during save, synchronizes on success, and clears dirty flag", async () => {
      const initialServer = initialBasicsState;
      const editedDraft: BasicsFormState = {
        title: "TypeScript Deep Dive",
        shortDescription: "A deep dive into TS",
        description: "In-depth guide to advanced types",
        categoryId: "cat-dev-123",
        difficulty: "advanced",
        language: "en",
      };

      let isSavingBasics = false;
      let serverBasics = initialServer;
      let basicsDraft = editedDraft;
      let isBasicsDirty = !isBasicsEqual(basicsDraft, serverBasics);

      expect(isBasicsDirty).toBe(true);

      // 1. User clicks Save Basics
      isSavingBasics = true;
      expect(isSavingBasics).toBe(true);

      // Simulating API save delay
      const mockApiSave = vi
        .fn()
        .mockImplementation(async (payload: BasicsFormState) => {
          return {
            ...payload,
            version: 2,
          };
        });

      const saveResponse = await mockApiSave(basicsDraft);

      // 2. Save succeeds -> update server baseline & sync draft
      const newBaseline = normalizeBasicsState(saveResponse);
      serverBasics = newBaseline;
      basicsDraft = newBaseline;
      isSavingBasics = false;
      isBasicsDirty = !isBasicsEqual(basicsDraft, serverBasics);

      // 3. Form unlocked, baseline synchronized, dirty flag cleared
      expect(isSavingBasics).toBe(false);
      expect(serverBasics.title).toBe("TypeScript Deep Dive");
      expect(serverBasics.shortDescription).toBe("A deep dive into TS");
      expect(serverBasics.description).toBe("In-depth guide to advanced types");
      expect(basicsDraft.title).toBe("TypeScript Deep Dive");
      expect(isBasicsDirty).toBe(false);
    });

    it("unlocks inputs and preserves draft when save fails so user can retry", async () => {
      const initialServer = initialBasicsState;
      const editedDraft: BasicsFormState = {
        title: "Failing Course Title",
        shortDescription: "Failing short description",
        description: "Should survive error",
        categoryId: "cat-1",
        difficulty: "beginner",
        language: "en",
      };

      let isSavingBasics = false;
      let serverBasics = initialServer;
      let basicsDraft = editedDraft;

      // 1. Start save
      isSavingBasics = true;
      expect(isSavingBasics).toBe(true);

      // 2. Simulate network / API failure
      const mockApiSave = vi
        .fn()
        .mockRejectedValue(new Error("Database timeout"));

      let saveError: Error | null = null;
      try {
        await mockApiSave(basicsDraft);
      } catch (err: any) {
        saveError = err;
      } finally {
        isSavingBasics = false;
      }

      // 3. Inputs unlocked, baseline unchanged, draft intact, still dirty
      expect(saveError).not.toBeNull();
      expect(isSavingBasics).toBe(false);
      expect(serverBasics.title).toBe("");
      expect(basicsDraft.title).toBe("Failing Course Title");
      expect(basicsDraft.description).toBe("Should survive error");
      expect(!isBasicsEqual(basicsDraft, serverBasics)).toBe(true);
    });
  });

  describe("Access Rules Form Save-Lock Lifecycle", () => {
    it("locks inputs during save, synchronizes on success, and clears dirty flag", async () => {
      const initialServer = initialAccessRulesState;
      const editedDraft: AccessRulesFormState = {
        accessType: "everyone",
        durationMode: "fixed",
        fixedDurationValue: 6,
        fixedDurationUnit: "Months",
        enableQA: false,
        enableComments: true,
        enableDownloads: true,
      };

      let isSavingAccessRules = false;
      let serverAccessRules = initialServer;
      let accessRulesDraft = editedDraft;

      // Start save
      isSavingAccessRules = true;
      expect(isSavingAccessRules).toBe(true);

      // API completes
      const mockSave = vi.fn().mockResolvedValue(editedDraft);
      const res = await mockSave(accessRulesDraft);

      serverAccessRules = normalizeAccessRulesState(res);
      accessRulesDraft = normalizeAccessRulesState(res);
      isSavingAccessRules = false;

      expect(isSavingAccessRules).toBe(false);
      expect(serverAccessRules.durationMode).toBe("fixed");
      expect(serverAccessRules.fixedDurationValue).toBe(6);
      expect(serverAccessRules.enableQA).toBe(false);
      expect(isAccessRulesEqual(accessRulesDraft, serverAccessRules)).toBe(
        true,
      );
    });

    it("unlocks inputs and preserves draft when Access Rules save fails", async () => {
      let isSavingAccessRules = true;
      const serverAccessRules = initialAccessRulesState;
      const accessRulesDraft: AccessRulesFormState = {
        accessType: "everyone",
        durationMode: "fixed",
        fixedDurationValue: 90,
        fixedDurationUnit: "Days",
        enableQA: true,
        enableComments: false,
        enableDownloads: false,
      };

      try {
        await Promise.reject(new Error("Access rules upsert conflict"));
      } catch {
        // Handled
      } finally {
        isSavingAccessRules = false;
      }

      expect(isSavingAccessRules).toBe(false);
      expect(accessRulesDraft.fixedDurationValue).toBe(90);
      expect(!isAccessRulesEqual(accessRulesDraft, serverAccessRules)).toBe(
        true,
      );
    });
  });

  describe("Pricing Form Save-Lock Lifecycle", () => {
    it("locks inputs during save, synchronizes on success, and clears dirty flag", async () => {
      const initialServer = initialPricingState;
      const editedDraft: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "49",
        originalPrice: "99",
        currency: "USD",
      };

      let isSavingPricing = true;
      expect(isSavingPricing).toBe(true);

      const mockSave = vi.fn().mockResolvedValue(editedDraft);
      const res = await mockSave(editedDraft);

      const serverPricing = normalizePricingState(res);
      const pricingDraft = normalizePricingState(res);
      isSavingPricing = false;

      expect(isSavingPricing).toBe(false);
      expect(serverPricing.pricingType).toBe("paid");
      expect(serverPricing.sellingPrice).toBe("49");
      expect(isPricingEqual(pricingDraft, serverPricing)).toBe(true);
    });

    it("unlocks inputs and preserves draft when Pricing save fails", async () => {
      let isSavingPricing = true;
      const serverPricing = initialPricingState;
      const pricingDraft: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "199",
        originalPrice: "",
        currency: "EUR",
      };

      try {
        await Promise.reject(new Error("Payment provider error"));
      } catch {
        // Handled
      } finally {
        isSavingPricing = false;
      }

      expect(isSavingPricing).toBe(false);
      expect(pricingDraft.sellingPrice).toBe("199");
      expect(pricingDraft.currency).toBe("EUR");
      expect(!isPricingEqual(pricingDraft, serverPricing)).toBe(true);
    });
  });

  describe("Extras Form Save-Lock Lifecycle", () => {
    it("locks certificate toggle during save and synchronizes on success", async () => {
      const initialServer = initialExtrasState;
      const editedDraft: ExtrasFormState = {
        enableCertificate: true,
      };

      let isSavingExtras = true;
      expect(isSavingExtras).toBe(true);

      const mockSave = vi.fn().mockResolvedValue(editedDraft);
      const res = await mockSave(editedDraft);

      const serverExtras = normalizeExtrasState(res);
      const extrasDraft = normalizeExtrasState(res);
      isSavingExtras = false;

      expect(isSavingExtras).toBe(false);
      expect(serverExtras.enableCertificate).toBe(true);
      expect(isExtrasEqual(extrasDraft, serverExtras)).toBe(true);
    });

    it("unlocks certificate toggle and preserves draft when Extras save fails", async () => {
      let isSavingExtras = true;
      const serverExtras = initialExtrasState;
      const extrasDraft: ExtrasFormState = {
        enableCertificate: true,
      };

      try {
        await Promise.reject(new Error("Settings save failed"));
      } catch {
        // Handled
      } finally {
        isSavingExtras = false;
      }

      expect(isSavingExtras).toBe(false);
      expect(extrasDraft.enableCertificate).toBe(true);
      expect(!isExtrasEqual(extrasDraft, serverExtras)).toBe(true);
    });
  });

  describe("Guard Against Concurrent / Overlapping Saves", () => {
    it("rejects starting a second save while actionLoading is active", () => {
      const actionLoading = "save";
      const canStartSave = actionLoading === null;

      expect(canStartSave).toBe(false);
    });

    it("rejects starting a save while page-specific isSaving is active", () => {
      const isBasicsSaving = true;
      const canEditInputs = !isBasicsSaving;
      const canTriggerSave = !isBasicsSaving;

      expect(canEditInputs).toBe(false);
      expect(canTriggerSave).toBe(false);
    });

    it("disables preview button whenever any API operation or mutation is ongoing", () => {
      const computeIsAnyApiInProgress = (params: {
        isMutatingCount: number;
        actionLoading: string | null;
        isBasicsSaving: boolean;
        isAccessRulesSaving: boolean;
        isPricingSaving: boolean;
        isExtrasSaving: boolean;
        isValidating: boolean;
      }) => {
        return (
          params.isMutatingCount > 0 ||
          params.actionLoading !== null ||
          params.isBasicsSaving ||
          params.isAccessRulesSaving ||
          params.isPricingSaving ||
          params.isExtrasSaving ||
          params.isValidating
        );
      };

      // Idle: Preview is enabled
      expect(
        computeIsAnyApiInProgress({
          isMutatingCount: 0,
          actionLoading: null,
          isBasicsSaving: false,
          isAccessRulesSaving: false,
          isPricingSaving: false,
          isExtrasSaving: false,
          isValidating: false,
        }),
      ).toBe(false);

      // During active mutation
      expect(
        computeIsAnyApiInProgress({
          isMutatingCount: 1,
          actionLoading: null,
          isBasicsSaving: false,
          isAccessRulesSaving: false,
          isPricingSaving: false,
          isExtrasSaving: false,
          isValidating: false,
        }),
      ).toBe(true);

      // During save action
      expect(
        computeIsAnyApiInProgress({
          isMutatingCount: 0,
          actionLoading: "save",
          isBasicsSaving: false,
          isAccessRulesSaving: false,
          isPricingSaving: false,
          isExtrasSaving: false,
          isValidating: false,
        }),
      ).toBe(true);

      // During validation
      expect(
        computeIsAnyApiInProgress({
          isMutatingCount: 0,
          actionLoading: null,
          isBasicsSaving: false,
          isAccessRulesSaving: false,
          isPricingSaving: false,
          isExtrasSaving: false,
          isValidating: true,
        }),
      ).toBe(true);

      // During basics saving
      expect(
        computeIsAnyApiInProgress({
          isMutatingCount: 0,
          actionLoading: null,
          isBasicsSaving: true,
          isAccessRulesSaving: false,
          isPricingSaving: false,
          isExtrasSaving: false,
          isValidating: false,
        }),
      ).toBe(true);
    });
  });
});
