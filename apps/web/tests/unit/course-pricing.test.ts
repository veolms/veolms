import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { coursesService } from "../../src/services/courses/courses.service";
import { courseKeys } from "../../src/services/courses/courses.keys";
import {
  formatIsoToDatetimeLocal,
  formatDatetimeLocalToIso,
  validatePricing,
  type PricingState,
} from "../../src/courses/CourseCreatePage";
import type {
  CoursePricing,
  UpdateCoursePricingRequest,
} from "@veolms/contracts";

describe("Course Pricing Service, Helpers, and Validations", () => {
  let queryClient: QueryClient;
  const courseId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.restoreAllMocks();
  });

  describe("validatePricing", () => {
    it("accepts free courses with any input values", () => {
      const freeState: PricingState = {
        pricingType: "free",
        sellingPrice: "",
        originalPrice: "",
        saleStartsAt: "",
        saleEndsAt: "",
        currency: "USD",
      };
      const result = validatePricing(freeState);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("rejects paid courses with empty or 0 selling price", () => {
      const emptyState: PricingState = {
        pricingType: "paid",
        sellingPrice: "",
        originalPrice: "",
        saleStartsAt: "",
        saleEndsAt: "",
        currency: "USD",
      };
      expect(validatePricing(emptyState).isValid).toBe(false);

      const zeroState: PricingState = {
        ...emptyState,
        sellingPrice: "0",
      };
      expect(validatePricing(zeroState).isValid).toBe(false);
    });

    it("rejects when sale price (selling price) exceeds original price", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "3500",
        originalPrice: "2000",
        saleStartsAt: "",
        saleEndsAt: "",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Sale price cannot be greater than original price");
    });

    it("accepts when selling price is less than or equal to original price", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        saleStartsAt: "",
        saleEndsAt: "",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });

    it("rejects if only sale startsAt is provided without endsAt", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        saleStartsAt: "2028-09-01T10:00",
        saleEndsAt: "",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("both sale start and end dates");
    });

    it("rejects if only sale endsAt is provided without startsAt", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        saleStartsAt: "",
        saleEndsAt: "2028-09-10T10:00",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("both sale start and end dates");
    });

    it("rejects past sale start date", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        saleStartsAt: "2020-01-01T10:00",
        saleEndsAt: "2028-09-10T10:00",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Sale start date cannot be in the past");
    });

    it("rejects past sale end date", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        saleStartsAt: "2020-01-01T10:00",
        saleEndsAt: "2020-01-05T10:00",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(false);
    });

    it("rejects when sale end date is earlier than or equal to start date", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        saleStartsAt: "2028-09-10T10:00",
        saleEndsAt: "2028-09-05T10:00",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain("Sale end date must be later than sale start date");
    });

    it("accepts valid future sale date range", () => {
      const state: PricingState = {
        pricingType: "paid",
        sellingPrice: "1999",
        originalPrice: "2999",
        saleStartsAt: "2028-09-01T10:00",
        saleEndsAt: "2028-09-15T18:00",
        currency: "USD",
      };
      const result = validatePricing(state);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeNull();
    });
  });

  describe("Date conversion helpers", () => {
    it("converts ISO date strings to datetime-local format and back", () => {
      const localInput = "2028-09-15T14:30";
      const iso = formatDatetimeLocalToIso(localInput);
      expect(iso).toBeTruthy();

      const backToLocal = formatIsoToDatetimeLocal(iso);
      expect(backToLocal).toBe(localInput);
    });

    it("handles null or empty date values gracefully", () => {
      expect(formatIsoToDatetimeLocal(null)).toBe("");
      expect(formatIsoToDatetimeLocal(undefined)).toBe("");
      expect(formatDatetimeLocalToIso("")).toBeNull();
      expect(formatDatetimeLocalToIso(null)).toBeNull();
    });
  });

  describe("Currency helpers", () => {
    it("generates currency list using Intl APIs with correct 3-letter codes and formatted labels", async () => {
      const { getCurrencyOptions } = await import("../../src/courses/CourseCreatePage");
      const options = getCurrencyOptions();

      expect(options.length).toBeGreaterThan(10);

      const inrOption = options.find(([code]) => code === "INR");
      expect(inrOption).toBeDefined();
      expect(inrOption![0]).toBe("INR");
      expect(inrOption![1]).toContain("INR");
      expect(inrOption![1]).toContain("Indian Rupee");
      expect(inrOption![2]?.searchKeywords).toContain("INR");
      expect(inrOption![2]?.searchKeywords).toContain("Indian Rupee");

      const usdOption = options.find(([code]) => code === "USD");
      expect(usdOption).toBeDefined();
      expect(usdOption![0]).toBe("USD");
      expect(usdOption![1]).toContain("USD");
      expect(usdOption![1]).toContain("US Dollar");

      const eurOption = options.find(([code]) => code === "EUR");
      expect(eurOption).toBeDefined();
      expect(eurOption![0]).toBe("EUR");
      expect(eurOption![1]).toContain("EUR");

      const gbpOption = options.find(([code]) => code === "GBP");
      expect(gbpOption).toBeDefined();
      expect(gbpOption![0]).toBe("GBP");
      expect(gbpOption![1]).toContain("GBP");
    });

    it("returns appropriate currency symbols", async () => {
      const { getCurrencySymbol } = await import("../../src/courses/CourseCreatePage");

      expect(getCurrencySymbol("INR")).toBe("₹");
      expect(getCurrencySymbol("USD")).toBe("$");
      expect(getCurrencySymbol("EUR")).toBe("€");
      expect(getCurrencySymbol("GBP")).toBe("£");
    });
  });

  describe("coursesService.upsertPricing", () => {
    it("calls upsertPricing with free payload", async () => {
      const mockPricing: CoursePricing = {
        id: "pricing-1",
        courseId,
        pricingType: "free",
        price: 0,
        currency: "USD",
        salePrice: null,
        saleStartsAt: null,
        saleEndsAt: null,
      };

      const spy = vi.spyOn(coursesService, "upsertPricing").mockResolvedValue(mockPricing);

      const payload: UpdateCoursePricingRequest = {
        pricingType: "free",
        price: 0,
        currency: "USD",
        salePrice: null,
        saleStartsAt: null,
        saleEndsAt: null,
      };

      const result = await coursesService.upsertPricing(courseId, payload);

      expect(spy).toHaveBeenCalledWith(courseId, payload);
      expect(result.pricingType).toBe("free");
      expect(result.price).toBe(0);
    });

    it("calls upsertPricing with paid payload including promotion dates", async () => {
      const mockPricing: CoursePricing = {
        id: "pricing-2",
        courseId,
        pricingType: "paid",
        price: 2999,
        currency: "USD",
        salePrice: 1999,
        saleStartsAt: "2028-09-01T10:00:00.000Z",
        saleEndsAt: "2028-09-15T18:00:00.000Z",
      };

      const spy = vi.spyOn(coursesService, "upsertPricing").mockResolvedValue(mockPricing);

      const payload: UpdateCoursePricingRequest = {
        pricingType: "paid",
        price: 2999,
        currency: "USD",
        salePrice: 1999,
        saleStartsAt: "2028-09-01T10:00:00.000Z",
        saleEndsAt: "2028-09-15T18:00:00.000Z",
      };

      const result = await coursesService.upsertPricing(courseId, payload);

      expect(spy).toHaveBeenCalledWith(courseId, payload);
      expect(result.pricingType).toBe("paid");
      expect(result.price).toBe(2999);
      expect(result.salePrice).toBe(1999);
      expect(result.saleStartsAt).toBe("2028-09-01T10:00:00.000Z");
      expect(result.saleEndsAt).toBe("2028-09-15T18:00:00.000Z");
    });
  });
});
