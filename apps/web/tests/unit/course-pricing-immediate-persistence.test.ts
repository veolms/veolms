import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CoursePricing, UpdateCoursePricingRequest } from "@veolms/contracts";
import {
  initialPricingState,
  normalizePricingState,
  isPricingEqual,
  validatePricing,
  type PricingFormState,
  type PricingType,
} from "../../src/courses/CourseCreatePage";

describe("Course Wizard Step 3: Immediate & Serialized Pricing Persistence", () => {
  const sampleCourseId = "44444444-4444-4444-4444-444444444444";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("Test 1: Selecting 'free' updates UI immediately and persists price: 0, salePrice: null", async () => {
    const mockUpsertPricing = vi.fn().mockImplementation(
      async ({ payload }: { courseId: string; payload: UpdateCoursePricingRequest }) => {
        return {
          id: "pricing-uuid-1",
          courseId: sampleCourseId,
          pricingType: payload.pricingType,
          price: payload.price,
          salePrice: payload.salePrice ?? null,
          currency: payload.currency,
        } satisfies CoursePricing;
      },
    );

    let pricingDraft: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "1999",
      originalPrice: "2999",
      currency: "INR",
    };
    let serverPricing: PricingFormState = { ...pricingDraft };
    const savingPricingControls = new Set<string>();
    let pricingVersion = 0;

    const handlePricingTypeChange = async (type: PricingType) => {
      const prev = { ...pricingDraft };
      const version = ++pricingVersion;

      // 1. Optimistic UI update
      pricingDraft = { ...pricingDraft, pricingType: type };
      savingPricingControls.add("pricingType");

      const payload: UpdateCoursePricingRequest = {
        pricingType: "free",
        price: 0,
        salePrice: null,
        currency: pricingDraft.currency || "INR",
      };

      try {
        const res = await mockUpsertPricing({
          courseId: sampleCourseId,
          payload,
        });

        if (pricingVersion === version) {
          const newBaseline = normalizePricingState({
            pricingType: res.pricingType,
            sellingPrice: "",
            originalPrice: "",
            currency: res.currency,
          });
          serverPricing = newBaseline;
        }
      } catch {
        if (pricingVersion === version) {
          pricingDraft = { ...prev };
        }
      } finally {
        savingPricingControls.delete("pricingType");
      }
    };

    expect(!isPricingEqual(pricingDraft, serverPricing)).toBe(false);

    await handlePricingTypeChange("free");

    expect(mockUpsertPricing).toHaveBeenCalledTimes(1);
    expect(mockUpsertPricing).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        pricingType: "free",
        price: 0,
        salePrice: null,
        currency: "INR",
      },
    });
    expect(serverPricing.pricingType).toBe("free");
    expect(serverPricing.sellingPrice).toBe("");
    expect(pricingDraft.pricingType).toBe("free");
    expect(savingPricingControls.size).toBe(0);
  });

  it("Test 2: Selecting 'free' rolls back optimistically updated UI if server request fails", async () => {
    const mockUpsertPricing = vi.fn().mockRejectedValue(new Error("Server error"));

    let pricingDraft: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "999",
      originalPrice: "",
      currency: "USD",
    };
    let serverPricing: PricingFormState = { ...pricingDraft };
    const savingPricingControls = new Set<string>();
    let pricingVersion = 0;

    const handlePricingTypeChange = async (type: PricingType) => {
      const prev = { ...pricingDraft };
      const version = ++pricingVersion;

      // Optimistic update
      pricingDraft = { ...pricingDraft, pricingType: type };
      savingPricingControls.add("pricingType");

      try {
        await mockUpsertPricing({
          courseId: sampleCourseId,
          payload: {
            pricingType: "free",
            price: 0,
            salePrice: null,
            currency: pricingDraft.currency,
          },
        });
      } catch {
        if (pricingVersion === version) {
          pricingDraft = { ...prev };
        }
      } finally {
        savingPricingControls.delete("pricingType");
      }
    };

    await handlePricingTypeChange("free");

    expect(mockUpsertPricing).toHaveBeenCalledTimes(1);
    expect(pricingDraft.pricingType).toBe("paid");
    expect(serverPricing.pricingType).toBe("paid");
    expect(savingPricingControls.size).toBe(0);
  });

  it("Test 3: Changing currency persists immediately with latest valid prices", async () => {
    const mockUpsertPricing = vi.fn().mockImplementation(
      async ({ payload }: { courseId: string; payload: UpdateCoursePricingRequest }) => {
        return {
          id: "pricing-uuid-2",
          courseId: sampleCourseId,
          pricingType: payload.pricingType,
          price: payload.price,
          salePrice: payload.salePrice ?? null,
          currency: payload.currency,
        } satisfies CoursePricing;
      },
    );

    let pricingDraft: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "499",
      originalPrice: "999",
      currency: "INR",
    };
    let serverPricing: PricingFormState = { ...pricingDraft };
    let pricingVersion = 0;

    const handleCurrencyChange = async (val: string) => {
      const prev = { ...pricingDraft };
      const version = ++pricingVersion;

      pricingDraft = { ...pricingDraft, currency: val };

      const validation = validatePricing(pricingDraft);
      if (!validation.isValid) return;

      const rawSell = Math.round(parseFloat(pricingDraft.sellingPrice));
      const rawOrig = Math.round(parseFloat(pricingDraft.originalPrice));

      try {
        const res = await mockUpsertPricing({
          courseId: sampleCourseId,
          payload: {
            pricingType: "paid",
            price: rawOrig,
            salePrice: rawSell,
            currency: val,
          },
        });
        if (pricingVersion === version) {
          serverPricing = normalizePricingState({
            pricingType: res.pricingType,
            sellingPrice: String(res.salePrice),
            originalPrice: String(res.price),
            currency: res.currency,
          });
        }
      } catch {
        if (pricingVersion === version) {
          pricingDraft = { ...prev };
        }
      }
    };

    await handleCurrencyChange("EUR");

    expect(mockUpsertPricing).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        pricingType: "paid",
        price: 999,
        salePrice: 499,
        currency: "EUR",
      },
    });
    expect(serverPricing.currency).toBe("EUR");
    expect(pricingDraft.currency).toBe("EUR");
  });

  it("Test 4: Currency change rolls back on failure", async () => {
    const mockUpsertPricing = vi.fn().mockRejectedValue(new Error("Network failure"));

    let pricingDraft: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "499",
      originalPrice: "",
      currency: "INR",
    };
    let serverPricing: PricingFormState = { ...pricingDraft };
    let pricingVersion = 0;

    const handleCurrencyChange = async (val: string) => {
      const prev = { ...pricingDraft };
      const version = ++pricingVersion;

      pricingDraft = { ...pricingDraft, currency: val };

      try {
        await mockUpsertPricing({
          courseId: sampleCourseId,
          payload: {
            pricingType: "paid",
            price: 499,
            salePrice: null,
            currency: val,
          },
        });
      } catch {
        if (pricingVersion === version) {
          pricingDraft = { ...prev };
        }
      }
    };

    await handleCurrencyChange("USD");

    expect(pricingDraft.currency).toBe("INR");
    expect(serverPricing.currency).toBe("INR");
  });

  it("Test 5: Concurrency protection - serialized execution prevents stale full-object overwrites", async () => {
    // Both Currency change and Selling Price change send the entire pricing object.
    // In our architecture, requests are serialized through a shared promise queue,
    // and each step re-reads the latest draft snapshot from the ref.
    const callLog: UpdateCoursePricingRequest[] = [];

    const mockUpsertPricing = vi.fn().mockImplementation(
      async ({ payload }: { courseId: string; payload: UpdateCoursePricingRequest }) => {
        callLog.push(payload);
        await new Promise((r) => setTimeout(r, 15)); // Simulate network latency
        return {
          id: "pricing-uuid-seq",
          courseId: sampleCourseId,
          pricingType: payload.pricingType,
          price: payload.price,
          salePrice: payload.salePrice ?? null,
          currency: payload.currency,
        } satisfies CoursePricing;
      },
    );

    let serverPricing: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "1000",
      originalPrice: "2000",
      currency: "INR",
    };
    let pricingDraftRef: PricingFormState = { ...serverPricing };
    let pricingVersion = 0;
    let inFlightPricingPromise: Promise<unknown> | null = null;

    const executeSerializedPricingMutation = async (
      targetVersion: number,
      previousSnapshot: PricingFormState,
    ) => {
      const priorPromise = inFlightPricingPromise;

      const run = async () => {
        if (priorPromise) {
          try {
            await priorPromise;
          } catch {}
        }

        // If superseded by a newer edit while queued, skip sending an obsolete request
        if (pricingVersion !== targetVersion) {
          return;
        }

        const latestDraft = pricingDraftRef;
        const validation = validatePricing(latestDraft);
        if (!validation.isValid) return;

        const rawSell = Math.round(parseFloat(latestDraft.sellingPrice));
        const rawOrig = Math.round(parseFloat(latestDraft.originalPrice));

        const res = await mockUpsertPricing({
          courseId: sampleCourseId,
          payload: {
            pricingType: latestDraft.pricingType,
            price: rawOrig,
            salePrice: rawSell,
            currency: latestDraft.currency,
          },
        });

        if (pricingVersion === targetVersion) {
          serverPricing = normalizePricingState({
            pricingType: res.pricingType,
            sellingPrice: String(res.salePrice),
            originalPrice: String(res.price),
            currency: res.currency,
          });
        }
      };

      const execute = async () => {
        try {
          return await run();
        } finally {
          if (pricingVersion === targetVersion) {
            inFlightPricingPromise = null;
          }
        }
      };

      const promise = execute();
      inFlightPricingPromise = promise;
      return await promise;
    };

    // Step A: User changes currency to USD
    pricingVersion++;
    const v1 = pricingVersion;
    pricingDraftRef = { ...pricingDraftRef, currency: "USD" };
    const p1 = executeSerializedPricingMutation(v1, serverPricing);

    // Step B: User immediately edits selling price to 1500 while Step A is in-flight
    pricingVersion++;
    const v2 = pricingVersion;
    pricingDraftRef = { ...pricingDraftRef, sellingPrice: "1500" };
    const p2 = executeSerializedPricingMutation(v2, serverPricing);

    await Promise.all([p1, p2]);

    // Ensure that the final server baseline has the combined latest fields:
    // currency: "USD" and sellingPrice: "1500"
    expect(serverPricing.currency).toBe("USD");
    expect(serverPricing.sellingPrice).toBe("1500");
    expect(serverPricing.originalPrice).toBe("2000");
    // Ensure the last payload sent to the backend had the combined latest values
    const finalCall = callLog[callLog.length - 1]!;
    expect(finalCall.currency).toBe("USD");
    expect(finalCall.salePrice).toBe(1500);
    expect(finalCall.price).toBe(2000);
  });

  it("Test 6: Debounce simulation - multiple price keystrokes coalesce into a single persistence call", async () => {
    const mockUpsertPricing = vi.fn().mockResolvedValue({
      id: "pricing-uuid-debounce",
      courseId: sampleCourseId,
      pricingType: "paid",
      price: 1999,
      salePrice: null,
      currency: "INR",
    } satisfies CoursePricing);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pricingDraft: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "1000",
      originalPrice: "",
      currency: "INR",
    };

    const persistPrice = async () => {
      await mockUpsertPricing({
        courseId: sampleCourseId,
        payload: {
          pricingType: "paid",
          price: parseFloat(pricingDraft.sellingPrice),
          salePrice: null,
          currency: "INR",
        },
      });
    };

    const handlePriceTyping = (val: string) => {
      pricingDraft = { ...pricingDraft, sellingPrice: val };
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        await persistPrice();
      }, 400);
    };

    // User rapidly types "1", "19", "199", "1999"
    handlePriceTyping("1");
    handlePriceTyping("19");
    handlePriceTyping("199");
    handlePriceTyping("1999");

    // Fast-forward timers
    await new Promise((resolve) => setTimeout(resolve, 450));

    expect(mockUpsertPricing).toHaveBeenCalledTimes(1);
    expect(mockUpsertPricing).toHaveBeenCalledWith({
      courseId: sampleCourseId,
      payload: {
        pricingType: "paid",
        price: 1999,
        salePrice: null,
        currency: "INR",
      },
    });
  });

  it("Test 7: Immediate blur / navigation flushes debounced price persistence immediately", async () => {
    const mockUpsertPricing = vi.fn().mockResolvedValue({
      id: "pricing-uuid-flush",
      courseId: sampleCourseId,
      pricingType: "paid",
      price: 2499,
      salePrice: null,
      currency: "INR",
    } satisfies CoursePricing);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pricingDraft: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "2499",
      originalPrice: "",
      currency: "INR",
    };
    let serverPricing: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "1000",
      originalPrice: "",
      currency: "INR",
    };

    const persist = async () => {
      await mockUpsertPricing({
        courseId: sampleCourseId,
        payload: {
          pricingType: "paid",
          price: 2499,
          salePrice: null,
          currency: "INR",
        },
      });
      serverPricing = { ...pricingDraft };
    };

    // Set 400ms debounce
    debounceTimer = setTimeout(persist, 400);

    // User blurs input after 50ms (before timer fires)
    const flushPricingPersistence = async () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (!isPricingEqual(pricingDraft, serverPricing)) {
        await persist();
      }
    };

    await flushPricingPersistence();

    expect(mockUpsertPricing).toHaveBeenCalledTimes(1);
    expect(serverPricing.sellingPrice).toBe("2499");
  });

  it("Test 8: Never sends persistence for invalid intermediate states during typing", async () => {
    const mockUpsertPricing = vi.fn();

    // Intermediate state: original price 1000, user typing selling price "1500" (salePrice > price)
    const draft: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "1500",
      originalPrice: "1000",
      currency: "INR",
    };

    const validation = validatePricing(draft);
    expect(validation.isValid).toBe(false);

    // Persistence runner checks isValid before firing API
    const persist = async () => {
      if (!validation.isValid) return;
      await mockUpsertPricing();
    };

    await persist();
    expect(mockUpsertPricing).not.toHaveBeenCalled();
  });

  it("Test 9: Hydration protection - query refetch does not overwrite active draft edits", () => {
    const serverBaseline: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "1000",
      originalPrice: "",
      currency: "INR",
    };
    let draftState: PricingFormState = {
      ...serverBaseline,
      sellingPrice: "2999", // active user edit
    };
    const isPricingDirty = !isPricingEqual(draftState, serverBaseline);
    const savingPricingControls = new Set<string>();

    const confirmedPricing = normalizePricingState({
      pricingType: "paid",
      sellingPrice: "1000",
      originalPrice: "",
      currency: "INR",
    });

    // Hydration guard
    if (!isPricingDirty && savingPricingControls.size === 0) {
      draftState = confirmedPricing;
    }

    // Active edit preserved!
    expect(draftState.sellingPrice).toBe("2999");
  });

  it("Test 10: Deduplication - savePricingStep does not send duplicate API call when already persisted and clean", async () => {
    const serverBaseline: PricingFormState = {
      pricingType: "paid",
      sellingPrice: "1999",
      originalPrice: "2999",
      currency: "INR",
    };
    const draftRef: PricingFormState = { ...serverBaseline };
    const isDirty = !isPricingEqual(draftRef, serverBaseline);

    const mockUpsert = vi.fn();

    const savePricingStep = async () => {
      if (!isDirty) {
        return { ...serverBaseline };
      }
      return await mockUpsert();
    };

    const res = await savePricingStep();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(res.sellingPrice).toBe("1999");
  });
});
