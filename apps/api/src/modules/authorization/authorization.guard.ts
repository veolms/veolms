import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission } from "@veolms/contracts";
import { httpError } from "../../lib/errors.ts";
import type { AuthorizationService, AuthorizationDecision } from "./authorization.service.ts";

declare module "fastify" {
  interface FastifyRequest {
    authorization?: AuthorizationDecision;
  }
}

export type ResourceType =
  | "platform"
  | "course"
  | "lesson"
  | "section";

export interface AuthorizationGuard {
  authorize: (
    permission: Permission,
    resourceType?: ResourceType,
    featureKey?: string,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  requireFeature: (
    featureKey: string,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export function createAuthorizationGuard(
  service: AuthorizationService,
): AuthorizationGuard {
  function extractResourceId(
    request: FastifyRequest,
    resourceType: ResourceType,
  ): string | undefined {
    const params = (request.params ?? {}) as Record<string, string>;
    const query = (request.query ?? {}) as Record<string, string>;
    const body = (request.body ?? {}) as Record<string, unknown>;

    if (resourceType === "course") {
      return (
        params["courseId"] ??
        params["id"] ??
        params["idOrSlug"] ??
        params["slug"] ??
        query["courseId"] ??
        (body["courseId"] as string | undefined)
      );
    }

    if (resourceType === "lesson") {
      return (
        params["lessonId"] ??
        params["id"] ??
        (body["lessonId"] as string | undefined)
      );
    }

    if (resourceType === "section") {
      return (
        params["sectionId"] ??
        params["id"] ??
        (body["sectionId"] as string | undefined)
      );
    }

    return undefined;
  }

  function authorize(
    permission: Permission,
    resourceType: ResourceType = "platform",
    featureKey?: string,
  ) {
    return async function authorizationGuardHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      if (!request.user) {
        return reply
          .code(401)
          .send(httpError(401, "UNAUTHORIZED", "Authentication required"));
      }

      const resourceId = extractResourceId(request, resourceType);
      const scope = await service.resolveScope(resourceType, resourceId);

      const decision = await service.check({
        userId: request.user.id,
        permission,
        courseId: scope.courseId,
        featureKey,
      });

      if (!decision.allowed) {
        if (decision.code === "FEATURE_DISABLED") {
          return reply
            .code(403)
            .send(
              httpError(
                403,
                "FEATURE_DISABLED",
                decision.reason ?? "This feature is not enabled on the platform",
              ),
            );
        }

        return reply
          .code(403)
          .send(
            httpError(
              403,
              "PERMISSION_DENIED",
              decision.reason ?? "You do not have permission to perform this action",
            ),
          );
      }

      request.authorization = decision;
    };
  }

  function requireFeature(featureKey: string) {
    return async function requireFeatureHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      const decision = await service.check({
        userId: request.user?.id ?? "00000000-0000-0000-0000-000000000000",
        permission: "course.read",
        featureKey,
      });

      if (decision.code === "FEATURE_DISABLED") {
        return reply
          .code(403)
          .send(
            httpError(
              403,
              "FEATURE_DISABLED",
              `Feature '${featureKey}' is disabled on the platform`,
            ),
          );
      }
    };
  }

  return {
    authorize,
    requireFeature,
  };
}
