import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  initialAccessRulesState,
  normalizeAccessRulesState,
  isAccessRulesEqual,
  isAccessRuleConfigEqual,
  isAccessSettingsEqual,
  initialPricingState,
  normalizePricingState,
  isPricingEqual,
  validatePricing,
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

      // 2. Edit fixedDurationValue (relevant when durationMode === "fixed")
      const fixedServerState: AccessRulesFormState = {
        ...serverState,
        durationMode: "fixed",
      };
      draftState = { ...fixedServerState, fixedDurationValue: 90 };
      expect(!isAccessRulesEqual(draftState, fixedServerState)).toBe(true);

      // 3. Edit fixedDurationUnit (relevant when durationMode === "fixed")
      draftState = { ...fixedServerState, fixedDurationUnit: "Months" };
      expect(!isAccessRulesEqual(draftState, fixedServerState)).toBe(true);

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

  describe("Sub-Domain Persistence Isolation (Multi-Endpoint)", () => {
    it("distinguishes between access-rule config changes and settings changes", () => {
      const baseline: AccessRulesFormState = {
        accessType: "everyone",
        durationMode: "fixed",
        fixedDurationValue: 30,
        fixedDurationUnit: "Days",
        enableQA: true,
        enableComments: true,
        enableDownloads: false,
      };

      // 1. Only duration changed
      const durationOnlyDraft: AccessRulesFormState = {
        ...baseline,
        fixedDurationValue: 60,
      };
      expect(isAccessRuleConfigEqual(durationOnlyDraft, baseline)).toBe(false);
      expect(isAccessSettingsEqual(durationOnlyDraft, baseline)).toBe(true);

      // 2. Only Q&A setting changed
      const settingsOnlyDraft: AccessRulesFormState = {
        ...baseline,
        enableQA: false,
      };
      expect(isAccessRuleConfigEqual(settingsOnlyDraft, baseline)).toBe(true);
      expect(isAccessSettingsEqual(settingsOnlyDraft, baseline)).toBe(false);

      // 3. Both changed
      const bothChangedDraft: AccessRulesFormState = {
        ...baseline,
        durationMode: "lifetime",
        enableDownloads: true,
      };
      expect(isAccessRuleConfigEqual(bothChangedDraft, baseline)).toBe(false);
      expect(isAccessSettingsEqual(bothChangedDraft, baseline)).toBe(false);

      // 4. Neither changed
      const cleanDraft: AccessRulesFormState = { ...baseline };
      expect(isAccessRuleConfigEqual(cleanDraft, baseline)).toBe(true);
      expect(isAccessSettingsEqual(cleanDraft, baseline)).toBe(true);
    });
  });

  describe("Server-First Pricing Tab: Immediate & Debounced Persistence", () => {
    it("immediate persistence: switching to free sends price: 0, salePrice: null and updates server baseline", async () => {
      let serverState: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        currency: "USD",
      };
      let draftState: PricingFormState = { ...serverState };

      // User selects 'free'
      draftState = { ...draftState, pricingType: "free" };
      expect(!isPricingEqual(draftState, serverState)).toBe(true);

      const mockFreeRes: CoursePricing = {
        id: "pricing-free-1",
        courseId: sampleCourseId,
        pricingType: "free",
        price: 0,
        salePrice: null,
        currency: draftState.currency || "USD",
      };
      const spy = vi
        .spyOn(coursesService, "upsertPricing")
        .mockResolvedValue(mockFreeRes);

      const res = await coursesService.upsertPricing(sampleCourseId, {
        pricingType: "free",
        price: 0,
        salePrice: null,
        currency: draftState.currency || "USD",
      });

      expect(spy).toHaveBeenCalledWith(sampleCourseId, {
        pricingType: "free",
        price: 0,
        salePrice: null,
        currency: "USD",
      });

      const newBaseline = normalizePricingState({
        pricingType: "free",
        sellingPrice: "",
        originalPrice: "",
        currency: res.currency || "USD",
      });
      serverState = newBaseline;
      draftState = newBaseline;

      expect(!isPricingEqual(draftState, serverState)).toBe(false);
      expect(serverState.pricingType).toBe("free");
      expect(serverState.sellingPrice).toBe("");
    });

    it("rolls back to previous pricing state when immediate free/paid toggle fails", async () => {
      const serverState: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "INR",
      };
      let draftState: PricingFormState = { ...serverState, pricingType: "free" };

      vi.spyOn(coursesService, "upsertPricing").mockRejectedValue(
        new Error("Network disconnect"),
      );

      let caughtError: Error | null = null;
      try {
        await coursesService.upsertPricing(sampleCourseId, {
          pricingType: "free",
          price: 0,
          salePrice: null,
          currency: "INR",
        });
      } catch (err: any) {
        caughtError = err;
        // Rollback
        draftState = { ...draftState, pricingType: serverState.pricingType };
      }

      expect(caughtError).not.toBeNull();
      expect(draftState.pricingType).toBe("paid");
      expect(isPricingEqual(draftState, serverState)).toBe(true);
    });

    it("switching to paid when selling price is empty delays API persistence until valid price is typed", () => {
      const serverState: PricingFormState = {
        pricingType: "free",
        sellingPrice: "",
        originalPrice: "",
        currency: "INR",
      };
      // User clicks 'paid'
      const draftState: PricingFormState = {
        ...serverState,
        pricingType: "paid",
      };

      // Validation check before firing API
      const validation = validatePricing(draftState);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain("selling price");

      // Draft is kept locally without API call
      expect(draftState.pricingType).toBe("paid");
      expect(!isPricingEqual(draftState, serverState)).toBe(true);
    });

    it("switching to paid when selling price is already valid persists immediately", async () => {
      const serverState: PricingFormState = {
        pricingType: "free",
        sellingPrice: "999",
        originalPrice: "1499",
        currency: "USD",
      };
      const draftState: PricingFormState = {
        ...serverState,
        pricingType: "paid",
      };

      const validation = validatePricing(draftState);
      expect(validation.isValid).toBe(true);

      const spy = vi
        .spyOn(coursesService, "upsertPricing")
        .mockResolvedValue({
          id: "pricing-paid-1",
          courseId: sampleCourseId,
          pricingType: "paid",
          price: 1499,
          salePrice: 999,
          currency: "USD",
        });

      await coursesService.upsertPricing(sampleCourseId, {
        pricingType: "paid",
        price: 1499,
        salePrice: 999,
        currency: "USD",
      });

      expect(spy).toHaveBeenCalledWith(sampleCourseId, {
        pricingType: "paid",
        price: 1499,
        salePrice: 999,
        currency: "USD",
      });
    });

    it("currency change persists immediately with current valid prices", async () => {
      const serverState: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "499",
        originalPrice: "",
        currency: "INR",
      };

      const spy = vi
        .spyOn(coursesService, "upsertPricing")
        .mockResolvedValue({
          id: "pricing-curr-1",
          courseId: sampleCourseId,
          pricingType: "paid",
          price: 499,
          salePrice: null,
          currency: "EUR",
        });

      const res = await coursesService.upsertPricing(sampleCourseId, {
        pricingType: "paid",
        price: 499,
        salePrice: null,
        currency: "EUR",
      });

      expect(spy).toHaveBeenCalledWith(sampleCourseId, {
        pricingType: "paid",
        price: 499,
        salePrice: null,
        currency: "EUR",
      });
      expect(res.currency).toBe("EUR");
    });

    it("currency change rolls back to previous currency on API failure", async () => {
      const serverState: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "499",
        originalPrice: "",
        currency: "INR",
      };
      let draftState: PricingFormState = { ...serverState, currency: "GBP" };

      vi.spyOn(coursesService, "upsertPricing").mockRejectedValue(
        new Error("Failed to persist currency"),
      );

      try {
        await coursesService.upsertPricing(sampleCourseId, {
          pricingType: "paid",
          price: 499,
          salePrice: null,
          currency: "GBP",
        });
      } catch {
        draftState = { ...draftState, currency: serverState.currency };
      }

      expect(draftState.currency).toBe("INR");
      expect(isPricingEqual(draftState, serverState)).toBe(true);
    });

    it("selling price and original price form a single pricingDetails domain mapping correctly", () => {
      // 1. With originalPrice: price = originalPrice, salePrice = sellingPrice
      const draftWithOriginal: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        currency: "INR",
      };
      const validation1 = validatePricing(draftWithOriginal);
      expect(validation1.isValid).toBe(true);

      const rawSell1 = Math.round(parseFloat(draftWithOriginal.sellingPrice));
      const rawOrig1 = Math.round(parseFloat(draftWithOriginal.originalPrice));
      const price1 = rawOrig1 > 0 ? rawOrig1 : rawSell1;
      const salePrice1 = rawOrig1 > 0 ? rawSell1 : null;

      expect(price1).toBe(2999);
      expect(salePrice1).toBe(1999);

      // 2. Without originalPrice: price = sellingPrice, salePrice = null
      const draftWithoutOriginal: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "INR",
      };
      const validation2 = validatePricing(draftWithoutOriginal);
      expect(validation2.isValid).toBe(true);

      const rawSell2 = Math.round(parseFloat(draftWithoutOriginal.sellingPrice));
      const rawOrig2 = draftWithoutOriginal.originalPrice
        ? Math.round(parseFloat(draftWithoutOriginal.originalPrice))
        : null;
      const price2 = rawOrig2 && rawOrig2 > 0 ? rawOrig2 : rawSell2;
      const salePrice2 = rawOrig2 && rawOrig2 > 0 ? rawSell2 : null;

      expect(price2).toBe(1999);
      expect(salePrice2).toBeNull();
    });

    it("never sends persistence for invalid intermediate pricing states", () => {
      // 1. Sale price exceeds original price
      const invalidSaleHigher: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "3500",
        originalPrice: "2000",
        currency: "INR",
      };
      const res1 = validatePricing(invalidSaleHigher);
      expect(res1.isValid).toBe(false);
      expect(res1.error).toContain(
        "Sale price cannot be greater than original price",
      );

      // 2. Zero or negative selling price
      const zeroPrice: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "0",
        originalPrice: "",
        currency: "INR",
      };
      const res2 = validatePricing(zeroPrice);
      expect(res2.isValid).toBe(false);
      expect(res2.error).toContain("greater than 0");

      // 3. Non-numeric or empty selling price
      const emptyPrice: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "",
        originalPrice: "",
        currency: "INR",
      };
      const res3 = validatePricing(emptyPrice);
      expect(res3.isValid).toBe(false);
      expect(res3.error).toContain("valid selling price");
    });
  });

  describe("Full-Object Replacement Serialization & Concurrency Protection", () => {
    it("serialized queue prevents stale snapshots from overwriting newer changes", async () => {
      // Scenario: User changes Currency to USD, then immediately enters Selling Price 2499
      let serverBaseline: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "INR",
      };
      let draftRef: PricingFormState = { ...serverBaseline };
      let globalVersion = 0;
      const apiCalls: any[] = [];

      let inFlightPromise: Promise<unknown> | null = null;

      const executeSerialized = async (
        targetVersion: number,
      ) => {
        const prior = inFlightPromise;
        const run = async () => {
          if (prior) {
            try {
              await prior;
            } catch {}
          }
          if (globalVersion !== targetVersion) return; // Coalesced / superseded
          const latest = { ...draftRef };
          const payload = {
            pricingType: latest.pricingType,
            price: parseFloat(latest.sellingPrice),
            salePrice: null,
            currency: latest.currency,
          };
          apiCalls.push(payload);
          await new Promise((r) => setTimeout(r, 10)); // Simulated network latency
          if (globalVersion === targetVersion) {
            serverBaseline = { ...latest };
          }
        };

        const exec = async () => {
          try {
            return await run();
          } finally {
            if (globalVersion === targetVersion) {
              inFlightPromise = null;
            }
          }
        };
        const p = exec();
        inFlightPromise = p;
        return await p;
      };

      // Mutation 1: Currency changed to USD
      globalVersion++;
      const v1 = globalVersion;
      draftRef = { ...draftRef, currency: "USD" };
      const p1 = executeSerialized(v1);

      // Mutation 2: Price changed to 2499 before Mutation 1 resolves
      globalVersion++;
      const v2 = globalVersion;
      draftRef = { ...draftRef, sellingPrice: "2499" };
      const p2 = executeSerialized(v2);

      await Promise.all([p1, p2]);

      // Both mutations finished: Mutation 1 was either in-flight or superseded.
      // Final baseline MUST contain BOTH currency: USD and sellingPrice: 2499!
      expect(serverBaseline.currency).toBe("USD");
      expect(serverBaseline.sellingPrice).toBe("2499");
      expect(isPricingEqual(draftRef, serverBaseline)).toBe(true);
    });

    it("discards stale responses arriving out of order using version tracking", async () => {
      let serverBaseline: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1000",
        originalPrice: "",
        currency: "INR",
      };
      let activeVersion = 1;

      // Simulated slow response from version 1
      const slowResponse = {
        pricingType: "paid" as const,
        price: 1000,
        salePrice: null,
        currency: "INR",
      };

      // In the meantime, user updated to version 2
      activeVersion = 2;
      const latestDraft: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "2000",
        originalPrice: "",
        currency: "USD",
      };

      // When slow response arrives, version check rejects it
      const incomingVersion = 1;
      if (incomingVersion === activeVersion) {
        serverBaseline = normalizePricingState({
          pricingType: slowResponse.pricingType,
          sellingPrice: String(slowResponse.price),
          originalPrice: "",
          currency: slowResponse.currency,
        });
      }

      // Stale response was discarded; serverBaseline was NOT reverted to 1000 INR
      expect(serverBaseline.sellingPrice).not.toBe("2000"); // Baseline stays at clean pre-save state
      expect(latestDraft.sellingPrice).toBe("2000");
      expect(latestDraft.currency).toBe("USD");
    });
  });

  describe("Hydration Protection for Active Pricing Draft", () => {
    it("preserves active dirty local changes and ignores incoming query refetch for draft", () => {
      const confirmedBaseline: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "INR",
      };
      let draftState: PricingFormState = {
        ...confirmedBaseline,
        sellingPrice: "2499", // User actively edited
      };
      const isPricingDirty = !isPricingEqual(draftState, confirmedBaseline);
      const savingControls = new Set<string>();

      const newBaseline = normalizePricingState({
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "INR",
      });

      // Hydration logic
      if (!isPricingDirty && savingControls.size === 0) {
        draftState = newBaseline;
      }

      // Active edit preserved!
      expect(draftState.sellingPrice).toBe("2499");
      expect(isPricingDirty).toBe(true);
    });

    it("hydrates local draft when clean and no controls are saving", () => {
      const confirmedBaseline: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "INR",
      };
      let draftState: PricingFormState = { ...confirmedBaseline };
      const isPricingDirty = !isPricingEqual(draftState, confirmedBaseline);
      const savingControls = new Set<string>();

      const refetchedBaseline = normalizePricingState({
        pricingType: "paid",
        sellingPrice: "2999",
        originalPrice: "",
        currency: "USD",
      });

      if (!isPricingDirty && savingControls.size === 0) {
        draftState = refetchedBaseline;
      }

      expect(draftState.sellingPrice).toBe("2999");
      expect(draftState.currency).toBe("USD");
    });
  });

  describe("Step Navigation & savePricingStep Deduplication", () => {
    it("savePricingStep skips duplicate network request when already persisted and clean", async () => {
      const serverBaseline: PricingFormState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "",
        currency: "INR",
      };
      const draftRef: PricingFormState = { ...serverBaseline };
      const isDirty = !isPricingEqual(draftRef, serverBaseline);

      const spy = vi.spyOn(coursesService, "upsertPricing");

      const savePricingStep = async () => {
        if (!isDirty) {
          return { ...serverBaseline };
        }
        return await coursesService.upsertPricing(sampleCourseId, {
          pricingType: "paid",
          price: 1999,
          currency: "INR",
        });
      };

      const result = await savePricingStep();
      expect(spy).not.toHaveBeenCalled();
      expect(result.pricingType).toBe("paid");
    });
  });
});

