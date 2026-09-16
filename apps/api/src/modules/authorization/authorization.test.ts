import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAuthorizationGuard } from "./authorization.guard.ts";

describe("VeoLMS 2-Tier Scoped Authorization Service & Guards (Platform + Course)", () => {
  const COURSE_1 = "22222222-2222-4000-8000-000000000001";
  const COURSE_2 = "22222222-2222-4000-8000-000000000002";

  const USER_ADMIN = "33333333-3333-4000-8000-000000000001";
  const USER_COURSE_MANAGER_1 = "33333333-3333-4000-8000-000000000002";
  const USER_THUMBNAIL_EDITOR_1 = "33333333-3333-4000-8000-000000000003";
  const USER_DENIED_CURRICULUM = "33333333-3333-4000-8000-000000000004";
  const USER_EXPIRED = "33333333-3333-4000-8000-000000000005";

  // Platform features state
  const platformFeatures = new Map<string, boolean>([
    ["quizzes", true],
    ["certificates", false], // disabled
    ["payments", true],
    ["live_classes", true],
    ["discussions", true],
  ]);

  const lessonCourseMap = new Map<string, string>([
    ["lesson-1", COURSE_1],
    ["lesson-2", COURSE_2],
  ]);

  // Mock implementation of AuthorizationService
  function createTestAuthService() {
    return {
      async check(request: {
        userId: string;
        permission: string;
        courseId?: string | null;
        featureKey?: string;
      }) {
        const { userId, permission, courseId, featureKey } = request;

        // 1. Feature entitlement evaluation
        if (featureKey) {
          const enabled = platformFeatures.get(featureKey) ?? true;
          if (!enabled) {
            return {
              allowed: false,
              code: "FEATURE_DISABLED" as const,
              reason: `Feature '${featureKey}' is disabled on the platform`,
              scope: { courseId },
            };
          }
        }

        // 2. Expired user check
        if (userId === USER_EXPIRED) {
          return {
            allowed: false,
            code: "PERMISSION_DENIED" as const,
            reason: "Role assignment has expired",
            scope: { courseId },
          };
        }

        // 3. Explicit deny policy override
        if (userId === USER_DENIED_CURRICULUM && permission === "course.curriculum.update") {
          return {
            allowed: false,
            code: "PERMISSION_DENIED" as const,
            reason: "Permission explicitly denied by policy",
            scope: { courseId },
          };
        }

        // 4. Admin scope (all permissions across platform & all courses)
        if (userId === USER_ADMIN) {
          return { allowed: true, code: "ALLOWED" as const, scope: { courseId } };
        }

        // 5. Course Manager scope (Course 1 only)
        if (userId === USER_COURSE_MANAGER_1) {
          if (courseId === COURSE_1) {
            const courseManagerPerms = [
              "course.read",
              "course.preview",
              "course.details.update",
              "course.thumbnail.update",
              "course.pricing.update",
              "course.curriculum.update",
              "course.publish",
              "course.unpublish",
              "course.archive",
              "course.delete",
              "lesson.read",
              "lesson.create",
              "lesson.details.update",
              "lesson.content.update",
              "lesson.video.update",
              "lesson.thumbnail.update",
              "lesson.reorder",
              "lesson.publish",
              "lesson.delete",
              "quiz.create",
              "certificate.issue",
            ];
            if (courseManagerPerms.includes(permission)) {
              return { allowed: true, code: "ALLOWED" as const, scope: { courseId } };
            }
          }
          return {
            allowed: false,
            code: "PERMISSION_DENIED" as const,
            reason: "Not authorized for this course",
            scope: { courseId },
          };
        }

        // 6. Thumbnail Editor scope (Course 1 only, thumbnails only)
        if (userId === USER_THUMBNAIL_EDITOR_1) {
          if (
            courseId === COURSE_1 &&
            (permission === "course.thumbnail.update" ||
              permission === "lesson.thumbnail.update" ||
              permission === "course.read" ||
              permission === "lesson.read")
          ) {
            return { allowed: true, code: "ALLOWED" as const, scope: { courseId } };
          }
          return {
            allowed: false,
            code: "PERMISSION_DENIED" as const,
            reason: "You do not have permission to perform this action",
            scope: { courseId },
          };
        }

        return {
          allowed: false,
          code: "PERMISSION_DENIED" as const,
          reason: "No matching role assignment grants this permission",
          scope: { courseId },
        };
      },

      async getCapabilities(params: {
        userId: string;
        courseId?: string | null;
      }) {
        const { userId, courseId } = params;
        const featuresObj: Record<string, boolean> = {};

        for (const [k, v] of platformFeatures.entries()) {
          featuresObj[k] = v;
        }

        let perms: string[] = [];
        if (userId === USER_ADMIN) {
          perms = [
            "course.create",
            "course.read",
            "course.details.update",
            "course.thumbnail.update",
            "course.pricing.update",
            "course.publish",
            "quiz.create",
            "certificate.issue",
          ];
        } else if (userId === USER_COURSE_MANAGER_1 && courseId === COURSE_1) {
          perms = [
            "course.read",
            "course.details.update",
            "course.thumbnail.update",
            "course.pricing.update",
            "course.publish",
            "quiz.create",
          ];
        } else if (userId === USER_THUMBNAIL_EDITOR_1 && courseId === COURSE_1) {
          perms = [
            "course.read",
            "course.thumbnail.update",
            "lesson.read",
            "lesson.thumbnail.update",
          ];
        }

        return {
          courseId: courseId ?? null,
          permissions: perms,
          features: featuresObj,
        };
      },

      async resolveScope(resourceType: string, resourceId?: string) {
        if (resourceType === "platform" || !resourceId) {
          return { courseId: null };
        }
        if (resourceType === "course") {
          return { courseId: resourceId };
        }
        if (resourceType === "lesson") {
          const courseId = lessonCourseMap.get(resourceId) ?? null;
          return { courseId };
        }
        return { courseId: null };
      },
    };
  }

  describe("1. Thumbnail Editor Scoped Permissions", () => {
    const service = createTestAuthService();

    it("allows Thumbnail Editor to update course thumbnail in assigned Course 1", async () => {
      const decision = await service.check({
        userId: USER_THUMBNAIL_EDITOR_1,
        permission: "course.thumbnail.update",
        courseId: COURSE_1,
      });
      assert.equal(decision.allowed, true);
      assert.equal(decision.code, "ALLOWED");
    });

    it("allows Thumbnail Editor to update lesson thumbnail in assigned Course 1", async () => {
      const decision = await service.check({
        userId: USER_THUMBNAIL_EDITOR_1,
        permission: "lesson.thumbnail.update",
        courseId: COURSE_1,
      });
      assert.equal(decision.allowed, true);
      assert.equal(decision.code, "ALLOWED");
    });

    it("denies Thumbnail Editor from updating course details (title/desc)", async () => {
      const decision = await service.check({
        userId: USER_THUMBNAIL_EDITOR_1,
        permission: "course.details.update",
        courseId: COURSE_1,
      });
      assert.equal(decision.allowed, false);
      assert.equal(decision.code, "PERMISSION_DENIED");
    });

    it("denies Thumbnail Editor from updating course pricing", async () => {
      const decision = await service.check({
        userId: USER_THUMBNAIL_EDITOR_1,
        permission: "course.pricing.update",
        courseId: COURSE_1,
      });
      assert.equal(decision.allowed, false);
      assert.equal(decision.code, "PERMISSION_DENIED");
    });

    it("denies Thumbnail Editor from publishing course", async () => {
      const decision = await service.check({
        userId: USER_THUMBNAIL_EDITOR_1,
        permission: "course.publish",
        courseId: COURSE_1,
      });
      assert.equal(decision.allowed, false);
      assert.equal(decision.code, "PERMISSION_DENIED");
    });

    it("denies Thumbnail Editor from deleting course", async () => {
      const decision = await service.check({
        userId: USER_THUMBNAIL_EDITOR_1,
        permission: "course.delete",
        courseId: COURSE_1,
      });
      assert.equal(decision.allowed, false);
      assert.equal(decision.code, "PERMISSION_DENIED");
    });

    it("denies Thumbnail Editor on unassigned Course 2", async () => {
      const decision = await service.check({
        userId: USER_THUMBNAIL_EDITOR_1,
        permission: "course.thumbnail.update",
        courseId: COURSE_2,
      });
      assert.equal(decision.allowed, false);
      assert.equal(decision.code, "PERMISSION_DENIED");
    });
  });

  describe("2. Course Manager Scoped Permissions", () => {
    const service = createTestAuthService();

    it("allows Course Manager full curriculum/details updates on assigned Course 1", async () => {
      const resDetails = await service.check({
        userId: USER_COURSE_MANAGER_1,
        permission: "course.details.update",
        courseId: COURSE_1,
      });
      assert.equal(resDetails.allowed, true);

      const resCurriculum = await service.check({
        userId: USER_COURSE_MANAGER_1,
        permission: "course.curriculum.update",
        courseId: COURSE_1,
      });
      assert.equal(resCurriculum.allowed, true);

      const resPricing = await service.check({
        userId: USER_COURSE_MANAGER_1,
        permission: "course.pricing.update",
        courseId: COURSE_1,
      });
      assert.equal(resPricing.allowed, true);
    });

    it("denies Course Manager on unassigned Course 2", async () => {
      const res = await service.check({
        userId: USER_COURSE_MANAGER_1,
        permission: "course.details.update",
        courseId: COURSE_2,
      });
      assert.equal(res.allowed, false);
      assert.equal(res.code, "PERMISSION_DENIED");
    });
  });

  describe("3. Administrator Scope", () => {
    const service = createTestAuthService();

    it("allows Administrator platform-wide and course-scoped actions across all courses", async () => {
      const resPlatform = await service.check({
        userId: USER_ADMIN,
        permission: "course.create",
      });
      assert.equal(resPlatform.allowed, true);

      const resC1 = await service.check({
        userId: USER_ADMIN,
        permission: "course.delete",
        courseId: COURSE_1,
      });
      assert.equal(resC1.allowed, true);

      const resC2 = await service.check({
        userId: USER_ADMIN,
        permission: "course.delete",
        courseId: COURSE_2,
      });
      assert.equal(resC2.allowed, true);
    });
  });

  describe("4. Expiration and Deny Precedence", () => {
    const service = createTestAuthService();

    it("denies access when role assignment has expired", async () => {
      const res = await service.check({
        userId: USER_EXPIRED,
        permission: "course.thumbnail.update",
        courseId: COURSE_1,
      });
      assert.equal(res.allowed, false);
      assert.equal(res.code, "PERMISSION_DENIED");
      assert.match(res.reason!, /expired/i);
    });

    it("enforces explicit deny rule over allow rule", async () => {
      const res = await service.check({
        userId: USER_DENIED_CURRICULUM,
        permission: "course.curriculum.update",
        courseId: COURSE_1,
      });
      assert.equal(res.allowed, false);
      assert.equal(res.code, "PERMISSION_DENIED");
      assert.match(res.reason!, /denied/i);
    });
  });

  describe("5. Platform Feature Entitlements", () => {
    const service = createTestAuthService();

    it("allows action when platform feature is enabled", async () => {
      const res = await service.check({
        userId: USER_COURSE_MANAGER_1,
        permission: "quiz.create",
        courseId: COURSE_1,
        featureKey: "quizzes",
      });
      assert.equal(res.allowed, true);
      assert.equal(res.code, "ALLOWED");
    });

    it("rejects action with FEATURE_DISABLED when platform feature is disabled", async () => {
      // Platform has certificates disabled
      const resCert = await service.check({
        userId: USER_COURSE_MANAGER_1,
        permission: "certificate.issue",
        courseId: COURSE_1,
        featureKey: "certificates",
      });
      assert.equal(resCert.allowed, false);
      assert.equal(resCert.code, "FEATURE_DISABLED");
      assert.match(resCert.reason!, /disabled/i);
    });
  });

  describe("6. Capabilities API", () => {
    const service = createTestAuthService();

    it("returns capabilities for Thumbnail Editor scoped to Course 1", async () => {
      const capabilities = await service.getCapabilities({
        userId: USER_THUMBNAIL_EDITOR_1,
        courseId: COURSE_1,
      });

      assert.equal(capabilities.courseId, COURSE_1);
      assert.ok(capabilities.permissions.includes("course.thumbnail.update"));
      assert.ok(capabilities.permissions.includes("lesson.thumbnail.update"));
      assert.ok(!capabilities.permissions.includes("course.pricing.update"));
      assert.ok(!capabilities.permissions.includes("course.publish"));
      assert.equal(capabilities.features["quizzes"], true);
      assert.equal(capabilities.features["certificates"], false);
    });
  });

  describe("7. Fastify Authorization Guard Execution", () => {
    const service = createTestAuthService();
    const guard = createAuthorizationGuard(service as any);

    it("blocks unauthenticated requests with 401 UNAUTHORIZED", async () => {
      const handler = guard.authorize("course.thumbnail.update", "course");
      let statusCode = 200;
      let sentBody: any = null;

      const mockRequest: any = { user: null, params: { id: COURSE_1 } };
      const mockReply: any = {
        code(status: number) {
          statusCode = status;
          return this;
        },
        send(body: any) {
          sentBody = body;
          return this;
        },
      };

      await handler(mockRequest, mockReply);
      assert.equal(statusCode, 401);
      assert.equal(sentBody.error.code, "UNAUTHORIZED");
    });

    it("blocks unauthorized user with 403 PERMISSION_DENIED", async () => {
      const handler = guard.authorize("course.pricing.update", "course");
      let statusCode = 200;
      let sentBody: any = null;

      const mockRequest: any = {
        user: { id: USER_THUMBNAIL_EDITOR_1 },
        params: { id: COURSE_1 },
      };
      const mockReply: any = {
        code(status: number) {
          statusCode = status;
          return this;
        },
        send(body: any) {
          sentBody = body;
          return this;
        },
      };

      await handler(mockRequest, mockReply);
      assert.equal(statusCode, 403);
      assert.equal(sentBody.error.code, "PERMISSION_DENIED");
    });

    it("allows authorized thumbnail update and attaches decision to request", async () => {
      const handler = guard.authorize("course.thumbnail.update", "course");
      let statusCode = 200;

      const mockRequest: any = {
        user: { id: USER_THUMBNAIL_EDITOR_1 },
        params: { id: COURSE_1 },
      };
      const mockReply: any = {
        code(status: number) {
          statusCode = status;
          return this;
        },
        send(body: any) {
          return this;
        },
      };

      await handler(mockRequest, mockReply);
      assert.equal(statusCode, 200);
      assert.ok(mockRequest.authorization);
      assert.equal(mockRequest.authorization.allowed, true);
    });

    it("blocks request with 403 FEATURE_DISABLED when feature is disabled on the platform", async () => {
      const handler = guard.authorize("certificate.issue", "course", "certificates");
      let statusCode = 200;
      let sentBody: any = null;

      const mockRequest: any = {
        user: { id: USER_ADMIN },
        params: { id: COURSE_1 },
      };
      const mockReply: any = {
        code(status: number) {
          statusCode = status;
          return this;
        },
        send(body: any) {
          sentBody = body;
          return this;
        },
      };

      await handler(mockRequest, mockReply);
      assert.equal(statusCode, 403);
      assert.equal(sentBody.error.code, "FEATURE_DISABLED");
    });
  });
});

