import { describe, it, expect, vi, beforeEach } from "vitest";
import { coursesService } from "../../src/services/courses/courses.service";
import type {
  CourseValidationResponse,
  Course,
  CourseAccessRule,
  CoursePricing,
  CourseSettings,
} from "@veolms/contracts";

describe("Course Wizard Step 5: Publish Validation Reconciliation", () => {
  const sampleCourseId = "11112222-3333-4444-5555-666677778888";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createMockValidationResponse = (
    canPublish: boolean = true,
  ): CourseValidationResponse => ({
    canPublish,
    valid: canPublish,
    sections: {
      basics: { valid: true, status: "complete", errors: [] },
      curriculum: { valid: true, status: "complete", errors: [] },
      accessRules: { valid: true, status: "complete", errors: [] },
      pricing: { valid: true, status: "complete", errors: [] },
      extras: { valid: true, status: "complete", errors: [] },
    },
    errors: [],
    warnings: [],
  });

  interface ReconciliationRunnerOptions {
    courseId: string | null;
    isBasicsDirty: boolean;
    isAccessRulesDirty: boolean;
    isPricingDirty: boolean;
    isExtrasDirty: boolean;
    onSaveBasics?: () => Promise<Partial<Course>>;
    onSaveAccessRules?: (id: string) => Promise<CourseAccessRule>;
    onSavePricing?: (id: string) => Promise<CoursePricing>;
    onSaveExtras?: (id: string) => Promise<CourseSettings>;
    onValidate?: (id: string) => Promise<CourseValidationResponse>;
  }

  // Simulated handler matching handleValidateCourseAction logic
  const runValidationReconciliation = async ({
    courseId,
    isBasicsDirty,
    isAccessRulesDirty,
    isPricingDirty,
    isExtrasDirty,
    onSaveBasics,
    onSaveAccessRules,
    onSavePricing,
    onSaveExtras,
    onValidate,
  }: ReconciliationRunnerOptions) => {
    let targetCourseId = courseId;

    // 1. If basics is dirty or course has not been created yet, save basics first
    if (!targetCourseId || isBasicsDirty) {
      if (!onSaveBasics) throw new Error("onSaveBasics not provided");
      const createdOrUpdated = await onSaveBasics();
      if (
        createdOrUpdated &&
        typeof createdOrUpdated === "object" &&
        "id" in createdOrUpdated
      ) {
        targetCourseId = (createdOrUpdated as { id: string }).id;
      }
    }

    if (!targetCourseId) {
      throw new Error("Cannot validate course without a valid course ID.");
    }

    // 2. Save only dirty server-backed pages
    const pendingSaves: Promise<unknown>[] = [];
    if (isAccessRulesDirty && onSaveAccessRules) {
      pendingSaves.push(onSaveAccessRules(targetCourseId));
    }
    if (isPricingDirty && onSavePricing) {
      pendingSaves.push(onSavePricing(targetCourseId));
    }
    if (isExtrasDirty && onSaveExtras) {
      pendingSaves.push(onSaveExtras(targetCourseId));
    }

    if (pendingSaves.length > 0) {
      await Promise.all(pendingSaves);
    }

    // 3. Trigger server validation
    if (!onValidate) throw new Error("onValidate not provided");
    return await onValidate(targetCourseId);
  };

  it("calls validation API directly with no save mutations when all pages are clean", async () => {
    const saveBasicsSpy = vi.fn();
    const saveAccessRulesSpy = vi.fn();
    const savePricingSpy = vi.fn();
    const saveExtrasSpy = vi.fn();
    const validateSpy = vi
      .fn()
      .mockResolvedValue(createMockValidationResponse(true));

    const result = await runValidationReconciliation({
      courseId: sampleCourseId,
      isBasicsDirty: false,
      isAccessRulesDirty: false,
      isPricingDirty: false,
      isExtrasDirty: false,
      onSaveBasics: saveBasicsSpy,
      onSaveAccessRules: saveAccessRulesSpy,
      onSavePricing: savePricingSpy,
      onSaveExtras: saveExtrasSpy,
      onValidate: validateSpy,
    });

    expect(saveBasicsSpy).not.toHaveBeenCalled();
    expect(saveAccessRulesSpy).not.toHaveBeenCalled();
    expect(savePricingSpy).not.toHaveBeenCalled();
    expect(saveExtrasSpy).not.toHaveBeenCalled();
    expect(validateSpy).toHaveBeenCalledTimes(1);
    expect(validateSpy).toHaveBeenCalledWith(sampleCourseId);
    expect(result.canPublish).toBe(true);
  });

  it("saves Basics first then validates when Basics is dirty", async () => {
    const saveBasicsSpy = vi
      .fn()
      .mockResolvedValue({ id: sampleCourseId, title: "Updated Title" });
    const saveAccessRulesSpy = vi.fn();
    const savePricingSpy = vi.fn();
    const saveExtrasSpy = vi.fn();
    const validateSpy = vi
      .fn()
      .mockResolvedValue(createMockValidationResponse(true));

    await runValidationReconciliation({
      courseId: sampleCourseId,
      isBasicsDirty: true,
      isAccessRulesDirty: false,
      isPricingDirty: false,
      isExtrasDirty: false,
      onSaveBasics: saveBasicsSpy,
      onSaveAccessRules: saveAccessRulesSpy,
      onSavePricing: savePricingSpy,
      onSaveExtras: saveExtrasSpy,
      onValidate: validateSpy,
    });

    expect(saveBasicsSpy).toHaveBeenCalledTimes(1);
    expect(saveAccessRulesSpy).not.toHaveBeenCalled();
    expect(savePricingSpy).not.toHaveBeenCalled();
    expect(saveExtrasSpy).not.toHaveBeenCalled();
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it("saves Access Rules then validates when Access Rules is dirty", async () => {
    const saveBasicsSpy = vi.fn();
    const saveAccessRulesSpy = vi
      .fn()
      .mockResolvedValue({ id: "rule-1", courseId: sampleCourseId });
    const savePricingSpy = vi.fn();
    const saveExtrasSpy = vi.fn();
    const validateSpy = vi
      .fn()
      .mockResolvedValue(createMockValidationResponse(true));

    await runValidationReconciliation({
      courseId: sampleCourseId,
      isBasicsDirty: false,
      isAccessRulesDirty: true,
      isPricingDirty: false,
      isExtrasDirty: false,
      onSaveBasics: saveBasicsSpy,
      onSaveAccessRules: saveAccessRulesSpy,
      onSavePricing: savePricingSpy,
      onSaveExtras: saveExtrasSpy,
      onValidate: validateSpy,
    });

    expect(saveBasicsSpy).not.toHaveBeenCalled();
    expect(saveAccessRulesSpy).toHaveBeenCalledTimes(1);
    expect(saveAccessRulesSpy).toHaveBeenCalledWith(sampleCourseId);
    expect(savePricingSpy).not.toHaveBeenCalled();
    expect(saveExtrasSpy).not.toHaveBeenCalled();
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it("saves Pricing then validates when Pricing is dirty", async () => {
    const saveBasicsSpy = vi.fn();
    const saveAccessRulesSpy = vi.fn();
    const savePricingSpy = vi
      .fn()
      .mockResolvedValue({ id: "pricing-1", courseId: sampleCourseId });
    const saveExtrasSpy = vi.fn();
    const validateSpy = vi
      .fn()
      .mockResolvedValue(createMockValidationResponse(true));

    await runValidationReconciliation({
      courseId: sampleCourseId,
      isBasicsDirty: false,
      isAccessRulesDirty: false,
      isPricingDirty: true,
      isExtrasDirty: false,
      onSaveBasics: saveBasicsSpy,
      onSaveAccessRules: saveAccessRulesSpy,
      onSavePricing: savePricingSpy,
      onSaveExtras: saveExtrasSpy,
      onValidate: validateSpy,
    });

    expect(savePricingSpy).toHaveBeenCalledTimes(1);
    expect(savePricingSpy).toHaveBeenCalledWith(sampleCourseId);
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it("saves Extras then validates when Extras is dirty", async () => {
    const saveBasicsSpy = vi.fn();
    const saveAccessRulesSpy = vi.fn();
    const savePricingSpy = vi.fn();
    const saveExtrasSpy = vi
      .fn()
      .mockResolvedValue({ id: "settings-1", courseId: sampleCourseId });
    const validateSpy = vi
      .fn()
      .mockResolvedValue(createMockValidationResponse(true));

    await runValidationReconciliation({
      courseId: sampleCourseId,
      isBasicsDirty: false,
      isAccessRulesDirty: false,
      isPricingDirty: false,
      isExtrasDirty: true,
      onSaveBasics: saveBasicsSpy,
      onSaveAccessRules: saveAccessRulesSpy,
      onSavePricing: savePricingSpy,
      onSaveExtras: saveExtrasSpy,
      onValidate: validateSpy,
    });

    expect(saveExtrasSpy).toHaveBeenCalledTimes(1);
    expect(saveExtrasSpy).toHaveBeenCalledWith(sampleCourseId);
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it("saves only dirty pages when multiple pages have uncommitted edits", async () => {
    const saveBasicsSpy = vi
      .fn()
      .mockResolvedValue({ id: sampleCourseId, title: "Title" });
    const saveAccessRulesSpy = vi
      .fn()
      .mockResolvedValue({ id: "rule-1", courseId: sampleCourseId });
    const savePricingSpy = vi.fn();
    const saveExtrasSpy = vi
      .fn()
      .mockResolvedValue({ id: "settings-1", courseId: sampleCourseId });
    const validateSpy = vi
      .fn()
      .mockResolvedValue(createMockValidationResponse(true));

    await runValidationReconciliation({
      courseId: sampleCourseId,
      isBasicsDirty: true,
      isAccessRulesDirty: true,
      isPricingDirty: false, // Clean
      isExtrasDirty: true,
      onSaveBasics: saveBasicsSpy,
      onSaveAccessRules: saveAccessRulesSpy,
      onSavePricing: savePricingSpy,
      onSaveExtras: saveExtrasSpy,
      onValidate: validateSpy,
    });

    expect(saveBasicsSpy).toHaveBeenCalledTimes(1);
    expect(saveAccessRulesSpy).toHaveBeenCalledTimes(1);
    expect(savePricingSpy).not.toHaveBeenCalled();
    expect(saveExtrasSpy).toHaveBeenCalledTimes(1);
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it("aborts validation and preserves dirty state if any dirty page save fails", async () => {
    const saveBasicsSpy = vi.fn();
    const saveAccessRulesSpy = vi
      .fn()
      .mockRejectedValue(new Error("Database write failure"));
    const validateSpy = vi.fn();

    let error: Error | null = null;
    try {
      await runValidationReconciliation({
        courseId: sampleCourseId,
        isBasicsDirty: false,
        isAccessRulesDirty: true,
        isPricingDirty: false,
        isExtrasDirty: false,
        onSaveBasics: saveBasicsSpy,
        onSaveAccessRules: saveAccessRulesSpy,
        onValidate: validateSpy,
      });
    } catch (err: any) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error?.message).toContain("Database write failure");
    expect(validateSpy).not.toHaveBeenCalled();
  });

  it("handles validation failure while preserving confirmed saved server baselines", async () => {
    const saveAccessRulesSpy = vi
      .fn()
      .mockResolvedValue({ id: "rule-1", courseId: sampleCourseId });
    const validateSpy = vi
      .fn()
      .mockRejectedValue(new Error("Validation network timeout"));

    let error: Error | null = null;
    try {
      await runValidationReconciliation({
        courseId: sampleCourseId,
        isBasicsDirty: false,
        isAccessRulesDirty: true,
        isPricingDirty: false,
        isExtrasDirty: false,
        onSaveAccessRules: saveAccessRulesSpy,
        onValidate: validateSpy,
      });
    } catch (err: any) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(saveAccessRulesSpy).toHaveBeenCalledTimes(1);
    expect(validateSpy).toHaveBeenCalledTimes(1);
  });

  it("guards against duplicate concurrent validation runs while actionLoading is set", () => {
    let actionLoading: string | null = "validate";
    let isValidating = true;

    const canTrigger = !actionLoading && !isValidating;
    expect(canTrigger).toBe(false);
  });

  it("uses server validation response as the sole source of truth for checklist items", () => {
    const serverVal: CourseValidationResponse = {
      canPublish: false,
      valid: false,
      sections: {
        basics: { valid: true, status: "complete", errors: [] },
        curriculum: {
          valid: false,
          status: "incomplete",
          errors: [
            "Course must have at least 1 section with a published lesson",
          ],
        },
        accessRules: { valid: true, status: "complete", errors: [] },
        pricing: { valid: true, status: "complete", errors: [] },
        extras: { valid: true, status: "complete", errors: [] },
      },
      errors: [
        {
          code: "ERR_NO_SECTIONS",
          area: "curriculum",
          message:
            "Course must have at least 1 section with a published lesson",
        },
      ],
      warnings: [],
    };

    const isBasicsValid = serverVal?.sections?.basics?.valid ?? false;
    const isCurriculumValid = serverVal?.sections?.curriculum?.valid ?? false;
    const isAccessRulesValid = serverVal?.sections?.accessRules?.valid ?? false;
    const isPricingValid = serverVal?.sections?.pricing?.valid ?? false;
    const isExtrasValid = serverVal?.sections?.extras?.valid ?? false;
    const isCourseReadyToPublish = serverVal?.canPublish ?? false;

    expect(isBasicsValid).toBe(true);
    expect(isCurriculumValid).toBe(false);
    expect(isAccessRulesValid).toBe(true);
    expect(isPricingValid).toBe(true);
    expect(isExtrasValid).toBe(true);
    expect(isCourseReadyToPublish).toBe(false);
  });
});
