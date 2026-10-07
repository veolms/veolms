import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission } from "@veolms/contracts";
import { httpError } from "../../lib/errors.ts";
import type {
  AuthorizationService,
  AuthorizationDecision,
} from "./authorization.service.ts";

declare module "fastify" {
  interface FastifyRequest {
    authorization?: AuthorizationDecision;
  }
}

export type ResourceType = "platform" | "course" | "lesson" | "section";

export interface AuthorizationGuard {
  authorize: (
    permission: Permission,
    resourceType?: ResourceType,
    featureKey?: string,
  ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  authorizeAny: (
    permissions: readonly Permission[],
    resourceType?: ResourceType,
    featureKey?: string,
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

  function authorizeAny(
    permissions: readonly Permission[],
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

      const decisions = await Promise.all(
        permissions.map((permission) =>
          service.check({
            userId: request.user!.id,
            permission,
            courseId: scope.courseId,
            featureKey,
          }),
        ),
      );
      const allowedIndex = decisions.findIndex((decision) => decision.allowed);
      const decision =
        allowedIndex >= 0
          ? {
              ...decisions[allowedIndex]!,
              permission: permissions[allowedIndex],
            }
          : (decisions[0] ?? {
              allowed: false,
              code: "PERMISSION_DENIED" as const,
              reason: "No permission was provided",
            });

      if (!decision.allowed) {
        // Why the policy said no (which role assignment, deny rule or
        // feature flag) stays in the log; the client gets a fixed message.
        request.log?.info(
          {
            userId: request.user.id,
            permissions,
            courseId: scope.courseId,
            code: decision.code,
            reason: decision.reason,
          },
          "Authorization denied",
        );

        if (decision.code === "FEATURE_DISABLED") {
          return reply
            .code(403)
            .send(
              httpError(
                403,
                "FEATURE_DISABLED",
                "This feature is not enabled on the platform",
              ),
            );
        }

        return reply
          .code(403)
          .send(
            httpError(
              403,
              "PERMISSION_DENIED",
              "You do not have permission to perform this action",
            ),
          );
      }

      request.authorization = decision;
    };
  }

  function authorize(
    permission: Permission,
    resourceType: ResourceType = "platform",
    featureKey?: string,
  ) {
    return authorizeAny([permission], resourceType, featureKey);
  }

  return {
    authorize,
    authorizeAny,
  };
}
