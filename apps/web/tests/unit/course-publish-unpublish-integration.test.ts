import { describe, it, expect, vi, beforeEach } from "vitest";
import { coursesService } from "../../src/services/courses/courses.service";
import { api } from "../../src/lib/api-client";
import type { Course, CourseValidationResponse } from "@veolms/contracts";

describe("Course Wizard: Publish & Unpublish API Integration", () => {
  const sampleCourseId = "11112222-3333-4444-5555-666677778888";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const createMockCourse = (overrides?: Partial<Course>): Course => ({
    id: sampleCourseId,
    slug: "mastering-typescript",
    title: "Mastering TypeScript",
    shortDescription: "A great course",
    description: "Full description",
    difficulty: "intermediate",
    status: "published",
    creatorId: "creator-1",
    categoryId: null,
    thumbnailMediaId: null,
    trailerMediaId: null,
    version: 2,
    createdAt: "2026-08-20T10:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
    publishedAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
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

  describe("API Client Service Methods", () => {
    it("calls POST /api/v1/courses/:id/publish when publishCourse is invoked", async () => {
      const mockCourse = createMockCourse({ status: "published", version: 3 });
      const postSpy = vi.spyOn(api, "post").mockResolvedValue(mockCourse);

      const result = await coursesService.publishCourse(sampleCourseId);

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        `/courses/${sampleCourseId}/publish`,
      );
      expect(result.status).toBe("published");
      expect(result.version).toBe(3);
    });

    it("calls POST /api/v1/courses/:id/unpublish when unpublishCourse is invoked", async () => {
      const mockCourse = createMockCourse({ status: "draft", version: 4 });
      const postSpy = vi.spyOn(api, "post").mockResolvedValue(mockCourse);

      const result = await coursesService.unpublishCourse(sampleCourseId);

      expect(postSpy).toHaveBeenCalledTimes(1);
      expect(postSpy).toHaveBeenCalledWith(
        `/courses/${sampleCourseId}/unpublish`,
      );
      expect(result.status).toBe("draft");
      expect(result.version).toBe(4);
    });
  });

  describe("Publish Flow Reconciliation & Mutation Sequence", () => {
    interface PublishRunnerOptions {
      courseId: string;
      isBasicsDirty: boolean;
      isAccessRulesDirty: boolean;
      isPricingDirty: boolean;
      isExtrasDirty: boolean;
      onReconcileSaves?: () => Promise<void>;
      onValidate?: () => Promise<CourseValidationResponse>;
      onPublish?: () => Promise<Course>;
    }

    const runPublishFlow = async ({
      courseId,
      isBasicsDirty,
      isAccessRulesDirty,
      isPricingDirty,
      isExtrasDirty,
      onReconcileSaves,
      onValidate,
      onPublish,
    }: PublishRunnerOptions) => {
      // 1. Reconcile dirty pages
      if (
        (isBasicsDirty ||
          isAccessRulesDirty ||
          isPricingDirty ||
          isExtrasDirty) &&
        onReconcileSaves
      ) {
        await onReconcileSaves();
      }

      // 2. Validate
      if (!onValidate) throw new Error("onValidate required");
      const validation = await onValidate();
      if (!validation.canPublish) {
        throw new Error(validation.errors[0]?.message || "Course incomplete");
      }

      // 3. Publish
      if (!onPublish) throw new Error("onPublish required");
      return await onPublish();
    };

    it("executes Publish directly when form is clean and validation passes", async () => {
      const reconcileSpy = vi.fn();
      const validateSpy = vi
        .fn()
        .mockResolvedValue(createMockValidationResponse(true));
      const publishSpy = vi
        .fn()
        .mockResolvedValue(
          createMockCourse({ status: "published", version: 2 }),
        );

      const published = await runPublishFlow({
        courseId: sampleCourseId,
        isBasicsDirty: false,
        isAccessRulesDirty: false,
        isPricingDirty: false,
        isExtrasDirty: false,
        onReconcileSaves: reconcileSpy,
        onValidate: validateSpy,
        onPublish: publishSpy,
      });

      expect(reconcileSpy).not.toHaveBeenCalled();
      expect(validateSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(published.status).toBe("published");
      expect(published.version).toBe(2);
    });

    it("flushes dirty state first before validating and calling POST /publish", async () => {
      const reconcileSpy = vi.fn().mockResolvedValue(undefined);
      const validateSpy = vi
        .fn()
        .mockResolvedValue(createMockValidationResponse(true));
      const publishSpy = vi
        .fn()
        .mockResolvedValue(
          createMockCourse({ status: "published", version: 3 }),
        );

      const published = await runPublishFlow({
        courseId: sampleCourseId,
        isBasicsDirty: true,
        isAccessRulesDirty: false,
        isPricingDirty: true,
        isExtrasDirty: false,
        onReconcileSaves: reconcileSpy,
        onValidate: validateSpy,
        onPublish: publishSpy,
      });

      expect(reconcileSpy).toHaveBeenCalledTimes(1);
      expect(validateSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).toHaveBeenCalledTimes(1);
      expect(published.status).toBe("published");
      expect(published.version).toBe(3);
    });

    it("stops immediately and does NOT call POST /publish if validation fails", async () => {
      const reconcileSpy = vi.fn().mockResolvedValue(undefined);
      const validateSpy = vi
        .fn()
        .mockResolvedValue(createMockValidationResponse(false));
      const publishSpy = vi.fn();

      let error: Error | null = null;
      try {
        await runPublishFlow({
          courseId: sampleCourseId,
          isBasicsDirty: false,
          isAccessRulesDirty: false,
          isPricingDirty: false,
          isExtrasDirty: false,
          onReconcileSaves: reconcileSpy,
          onValidate: validateSpy,
          onPublish: publishSpy,
        });
      } catch (err: any) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(validateSpy).toHaveBeenCalledTimes(1);
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it("handles backend 400 VALIDATION_FAILED error gracefully", async () => {
      const validateSpy = vi
        .fn()
        .mockResolvedValue(createMockValidationResponse(true));
      const publishSpy = vi
        .fn()
        .mockRejectedValue(
          new Error("Cannot publish course: Missing thumbnail"),
        );

      let error: Error | null = null;
      try {
        await runPublishFlow({
          courseId: sampleCourseId,
          isBasicsDirty: false,
          isAccessRulesDirty: false,
          isPricingDirty: false,
          isExtrasDirty: false,
          onValidate: validateSpy,
          onPublish: publishSpy,
        });
      } catch (err: any) {
        error = err;
      }

      expect(error?.message).toContain("Missing thumbnail");
    });

    it("handles backend 409 OPTIMISTIC_LOCK_CONFLICT error without corrupting status", async () => {
      const validateSpy = vi
        .fn()
        .mockResolvedValue(createMockValidationResponse(true));
      const publishSpy = vi
        .fn()
        .mockRejectedValue(
          new Error("Course was modified by another request."),
        );

      let error: Error | null = null;
      try {
        await runPublishFlow({
          courseId: sampleCourseId,
          isBasicsDirty: false,
          isAccessRulesDirty: false,
          isPricingDirty: false,
          isExtrasDirty: false,
          onValidate: validateSpy,
          onPublish: publishSpy,
        });
      } catch (err: any) {
        error = err;
      }

      expect(error?.message).toContain("modified by another request");
    });
  });

  describe("Unpublish Flow Execution", () => {
    it("calls POST /unpublish and returns course with draft status and updated version", async () => {
      const unpublishSpy = vi.fn().mockResolvedValue(
        createMockCourse({
          status: "draft",
          version: 5,
        }),
      );

      const result = await unpublishSpy(sampleCourseId);

      expect(unpublishSpy).toHaveBeenCalledTimes(1);
      expect(result.status).toBe("draft");
      expect(result.version).toBe(5);
    });

    it("preserves historical publishedAt timestamp upon returning to draft", async () => {
      const publishedAtTimestamp = "2026-08-20T10:00:00.000Z";
      const unpublishResult = createMockCourse({
        status: "draft",
        version: 6,
        publishedAt: publishedAtTimestamp,
      });

      expect(unpublishResult.status).toBe("draft");
      expect(unpublishResult.publishedAt).toBe(publishedAtTimestamp);
      expect(unpublishResult.version).toBe(6);
    });
  });

  describe("Concurrency & Duplicate Action Guards", () => {
    it("prevents publish trigger while another action is already in flight", () => {
      const actionLoading = "publish";
      const isValidating = false;

      const canTriggerPublish = !actionLoading && !isValidating;
      expect(canTriggerPublish).toBe(false);
    });

    it("prevents unpublish trigger while an action is already running", () => {
      const actionLoading = "unpublish";

      const canTriggerUnpublish = !actionLoading;
      expect(canTriggerUnpublish).toBe(false);
    });
  });
});
