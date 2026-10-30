import type { DatabaseExecutor as Executor } from "@veolms/database";
import type { Permission, CapabilitiesResponse } from "@veolms/contracts";
import {
  checkPermission,
  isFeatureOn,
  listEffectivePermissions,
} from "./permission-cache.ts";
import { resolveResourceCourseId } from "./scope-cache.ts";

export interface AuthorizationCheckRequest {
  userId: string;
  permission: Permission;
  courseId?: string | null;
  featureKey?: string;
  /**
   * Count only roles that reach every course: for academy-wide surfaces
   * (platform moderation, all students), where an instructor's course
   * permissions must not apply.
   */
  platformWide?: boolean;
}

export interface AuthorizationDecision {
  allowed: boolean;
  code?: "ALLOWED" | "PERMISSION_DENIED" | "FEATURE_DISABLED";
  reason?: string;
  permission?: Permission;
  scope?: {
    courseId?: string | null;
  };
}

export interface AuthorizationService {
  check(request: AuthorizationCheckRequest): Promise<AuthorizationDecision>;
  getCapabilities(params: {
    userId: string;
    courseId?: string | null;
  }): Promise<CapabilitiesResponse>;
  resolveScope(
    resourceType: "platform" | "course" | "lesson" | "section",
    resourceId?: string,
  ): Promise<{ courseId: string | null }>;
}

export function createAuthorizationService(
  database: Executor,
): AuthorizationService {
  return {
    async check(
      request: AuthorizationCheckRequest,
    ): Promise<AuthorizationDecision> {
      const { userId, permission, courseId, featureKey, platformWide } =
        request;

      // 1. Check Feature Entitlement if a feature is bound to this action
      if (featureKey) {
        const featureEnabled = await isFeatureOn(database, featureKey);
        if (!featureEnabled) {
          return {
            allowed: false,
            code: "FEATURE_DISABLED",
            reason: `Feature '${featureKey}' is disabled on the platform`,
            scope: { courseId },
          };
        }
      }

      // 2. Check Scoped Role Permissions
      const result = await checkPermission(database, {
        userId,
        permissionKey: permission,
        courseId,
        excludeOwnCoursesOnlyRoles: platformWide,
      });

      if (!result.allowed) {
        return {
          allowed: false,
          code: "PERMISSION_DENIED",
          reason:
            result.reason ??
            "You do not have permission to perform this action",
          scope: { courseId },
        };
      }

      return {
        allowed: true,
        code: "ALLOWED",
        scope: { courseId },
      };
    },

    async getCapabilities(params: {
      userId: string;
      courseId?: string | null;
    }): Promise<CapabilitiesResponse> {
      const { userId, courseId } = params;

      const [permissions, academyPermissions] = await Promise.all([
        listEffectivePermissions(database, { userId, courseId }),
        listEffectivePermissions(database, {
          userId,
          excludeOwnCoursesOnlyRoles: true,
        }),
      ]);
      return { permissions, academyPermissions };
    },

    async resolveScope(
      resourceType: "platform" | "course" | "lesson" | "section",
      resourceId?: string,
    ): Promise<{ courseId: string | null }> {
      if (resourceType === "platform" || !resourceId) {
        return { courseId: null };
      }

      const courseId = await resolveResourceCourseId(
        database,
        resourceType,
        resourceId,
      );
      // An unknown course keeps the id it was asked by, as before.
      return {
        courseId: courseId ?? (resourceType === "course" ? resourceId : null),
      };
    },
  };
}
