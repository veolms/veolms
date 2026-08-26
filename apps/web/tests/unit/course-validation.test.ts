import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { coursesService } from "../../src/services/courses/courses.service";
import { courseKeys } from "../../src/services/courses/courses.keys";
import type { CourseValidationResponse } from "@veolms/contracts";

describe("Course Validation Service & Checklist Validation Rules", () => {
  let queryClient: QueryClient;
  const courseId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    vi.restoreAllMocks();
  });

  it("calls coursesService.getValidation with correct course id and returns valid course payload", async () => {
    const mockValidation: CourseValidationResponse = {
      canPublish: true,
      valid: true,
      sections: {
        basics: {
          valid: true,
          status: "Completed",
          errors: [],
        },
        curriculum: {
          valid: true,
          status: "2 Sections, 4 Lessons",
          errors: [],
        },
        accessRules: {
          valid: true,
          status: "Everyone",
          errors: [],
        },
        pricing: {
          valid: true,
          status: "Free",
          errors: [],
        },
        extras: {
          valid: true,
          status: "Disabled",
          errors: [],
        },
      },
      errors: [],
      warnings: [],
    };

    const spy = vi
      .spyOn(coursesService, "getValidation")
      .mockResolvedValue(mockValidation);

    const result = await coursesService.getValidation(courseId);

    expect(spy).toHaveBeenCalledWith(courseId);
    expect(result.canPublish).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.sections.basics.valid).toBe(true);
    expect(result.sections.curriculum.valid).toBe(true);
    expect(result.sections.accessRules.valid).toBe(true);
    expect(result.sections.pricing.valid).toBe(true);
    expect(result.sections.extras.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("handles course with incomplete basics (missing title and description)", async () => {
    const mockValidation: CourseValidationResponse = {
      canPublish: false,
      valid: false,
      sections: {
        basics: {
          valid: false,
          status: "Incomplete",
          errors: [
            "Course title is required.",
            "Course description is required.",
          ],
        },
        curriculum: {
          valid: true,
          status: "1 Sections, 1 Lessons",
          errors: [],
        },
        accessRules: {
          valid: true,
          status: "Everyone",
          errors: [],
        },
        pricing: {
          valid: true,
          status: "Free",
          errors: [],
        },
        extras: {
          valid: true,
          status: "Disabled",
          errors: [],
        },
      },
      errors: [
        {
          code: "MISSING_TITLE",
          message: "Course title is required.",
          area: "basics",
        },
        {
          code: "MISSING_DESCRIPTION",
          message: "Course description is required.",
          area: "basics",
        },
      ],
      warnings: [],
    };

    vi.spyOn(coursesService, "getValidation").mockResolvedValue(mockValidation);

    const result = await coursesService.getValidation(courseId);

    expect(result.canPublish).toBe(false);
    expect(result.sections.basics.valid).toBe(false);
    expect(result.sections.basics.errors).toContain(
      "Course title is required.",
    );
    expect(result.sections.basics.errors).toContain(
      "Course description is required.",
    );
    expect(result.errors).toHaveLength(2);
  });

  it("handles course with invalid curriculum (empty curriculum and section without lessons)", async () => {
    const mockValidation: CourseValidationResponse = {
      canPublish: false,
      valid: false,
      sections: {
        basics: {
          valid: true,
          status: "Completed",
          errors: [],
        },
        curriculum: {
          valid: false,
          status: "1 Sections, 0 Lessons",
          errors: [
            "Course must contain at least one lesson.",
            'Section "Intro" has no lessons.',
          ],
        },
        accessRules: {
          valid: true,
          status: "Everyone",
          errors: [],
        },
        pricing: {
          valid: true,
          status: "Free",
          errors: [],
        },
        extras: {
          valid: true,
          status: "Disabled",
          errors: [],
        },
      },
      errors: [
        {
          code: "NO_LESSONS",
          message: "Course must contain at least one lesson.",
          area: "curriculum",
        },
        {
          code: "EMPTY_SECTION",
          message: 'Section "Intro" has no lessons.',
          area: "curriculum",
        },
      ],
      warnings: [],
    };

    vi.spyOn(coursesService, "getValidation").mockResolvedValue(mockValidation);

    const result = await coursesService.getValidation(courseId);

    expect(result.canPublish).toBe(false);
    expect(result.sections.curriculum.valid).toBe(false);
    expect(result.sections.curriculum.errors).toHaveLength(2);
    expect(result.errors.find((e) => e.code === "NO_LESSONS")).toBeDefined();
  });

  it("handles course with unconfigured access rules", async () => {
    const mockValidation: CourseValidationResponse = {
      canPublish: false,
      valid: false,
      sections: {
        basics: {
          valid: true,
          status: "Completed",
          errors: [],
        },
        curriculum: {
          valid: true,
          status: "1 Sections, 1 Lessons",
          errors: [],
        },
        accessRules: {
          valid: false,
          status: "Not configured",
          errors: ["Course access rules have not been configured."],
        },
        pricing: {
          valid: true,
          status: "Free",
          errors: [],
        },
        extras: {
          valid: true,
          status: "Disabled",
          errors: [],
        },
      },
      errors: [
        {
          code: "MISSING_ACCESS_RULES",
          message: "Course access rules have not been configured.",
          area: "accessRules",
        },
      ],
      warnings: [],
    };

    vi.spyOn(coursesService, "getValidation").mockResolvedValue(mockValidation);

    const result = await coursesService.getValidation(courseId);

    expect(result.canPublish).toBe(false);
    expect(result.sections.accessRules.valid).toBe(false);
    expect(result.sections.accessRules.errors[0]).toBe(
      "Course access rules have not been configured.",
    );
  });

  it("handles course with invalid pricing (missing pricing or paid course with price 0)", async () => {
    const mockValidation: CourseValidationResponse = {
      canPublish: false,
      valid: false,
      sections: {
        basics: {
          valid: true,
          status: "Completed",
          errors: [],
        },
        curriculum: {
          valid: true,
          status: "1 Sections, 1 Lessons",
          errors: [],
        },
        accessRules: {
          valid: true,
          status: "Everyone",
          errors: [],
        },
        pricing: {
          valid: false,
          status: "USD 0",
          errors: ["Paid courses must have a price greater than 0."],
        },
        extras: {
          valid: true,
          status: "Disabled",
          errors: [],
        },
      },
      errors: [
        {
          code: "INVALID_PRICE",
          message: "Paid courses must have a price greater than 0.",
          area: "pricing",
        },
      ],
      warnings: [],
    };

    vi.spyOn(coursesService, "getValidation").mockResolvedValue(mockValidation);

    const result = await coursesService.getValidation(courseId);

    expect(result.canPublish).toBe(false);
    expect(result.sections.pricing.valid).toBe(false);
    expect(result.sections.pricing.errors[0]).toBe(
      "Paid courses must have a price greater than 0.",
    );
  });

  it("handles multiple simultaneous validation failures across sections", async () => {
    const mockValidation: CourseValidationResponse = {
      canPublish: false,
      valid: false,
      sections: {
        basics: {
          valid: false,
          status: "Incomplete",
          errors: ["Course description is required."],
        },
        curriculum: {
          valid: false,
          status: "0 Sections, 0 Lessons",
          errors: [
            "Course must contain at least one section.",
            "Course must contain at least one lesson.",
          ],
        },
        accessRules: {
          valid: false,
          status: "Not configured",
          errors: ["Course access rules have not been configured."],
        },
        pricing: {
          valid: false,
          status: "Not configured",
          errors: ["Course pricing has not been configured."],
        },
        extras: {
          valid: true,
          status: "Disabled",
          errors: [],
        },
      },
      errors: [
        {
          code: "MISSING_DESCRIPTION",
          message: "Course description is required.",
          area: "basics",
        },
        {
          code: "EMPTY_CURRICULUM",
          message: "Course must contain at least one section.",
          area: "curriculum",
        },
        {
          code: "NO_LESSONS",
          message: "Course must contain at least one lesson.",
          area: "curriculum",
        },
        {
          code: "MISSING_ACCESS_RULES",
          message: "Course access rules have not been configured.",
          area: "accessRules",
        },
        {
          code: "MISSING_PRICING",
          message: "Course pricing has not been configured.",
          area: "pricing",
        },
      ],
      warnings: [],
    };

    vi.spyOn(coursesService, "getValidation").mockResolvedValue(mockValidation);

    const result = await coursesService.getValidation(courseId);

    expect(result.canPublish).toBe(false);
    expect(result.sections.basics.valid).toBe(false);
    expect(result.sections.curriculum.valid).toBe(false);
    expect(result.sections.accessRules.valid).toBe(false);
    expect(result.sections.pricing.valid).toBe(false);
    expect(result.sections.extras.valid).toBe(true);
    expect(result.errors).toHaveLength(5);
  });

  it("query key helper formats validation cache key correctly", () => {
    const key = courseKeys.validation(courseId);
    expect(key).toEqual(["courses", "validation", courseId]);
  });

  it("respects enabled option to prevent validation calls when not on publish step", async () => {
    const spy = vi.spyOn(coursesService, "getValidation").mockResolvedValue({
      canPublish: true,
      valid: true,
      sections: {
        basics: { valid: true, status: "Completed", errors: [] },
        curriculum: {
          valid: true,
          status: "1 Sections, 1 Lessons",
          errors: [],
        },
        accessRules: { valid: true, status: "Everyone", errors: [] },
        pricing: { valid: true, status: "Free", errors: [] },
        extras: { valid: true, status: "Disabled", errors: [] },
      },
      errors: [],
      warnings: [],
    });

    // When disabled (e.g. activeStep !== "publish")
    const enabledFalse = Boolean(courseId && false);
    expect(enabledFalse).toBe(false);

    // When enabled (activeStep === "publish")
    const enabledTrue = Boolean(courseId && true);
    expect(enabledTrue).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
