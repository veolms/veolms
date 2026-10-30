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

/**
 * What the permission is checked against. "platform" counts every role the
 * user holds, an instructor's own-course roles included (they still need the
 * course service's ownership check). "academy" is for academy-wide surfaces
 * (platform moderation, every student, settings): only roles that reach all
 * courses count.
 */
export type ResourceType =
  "platform" | "academy" | "course" | "lesson" | "section";

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
  /**
   * Allowed only with every permission the request needs, as `pick` reads
   * them from it: one route that changes several things (a lesson's title,
   * its content, whether it is published) checks each thing it changes.
   */
  authorizeEach: (
    pick: (request: FastifyRequest) => readonly Permission[],
    resourceType?: ResourceType,
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

      const platformWide = resourceType === "academy";
      const scopeType = platformWide ? "platform" : resourceType;
      const resourceId = extractResourceId(request, scopeType);
      const scope = await service.resolveScope(scopeType, resourceId);

      const decisions = await Promise.all(
        permissions.map((permission) =>
          service.check({
            userId: request.user!.id,
            permission,
            courseId: scope.courseId,
            featureKey,
            platformWide,
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

  function authorizeEach(
    pick: (request: FastifyRequest) => readonly Permission[],
    resourceType: ResourceType = "platform",
  ) {
    return async function authorizeEachHandler(
      request: FastifyRequest,
      reply: FastifyReply,
    ): Promise<void> {
      for (const permission of pick(request)) {
        await authorizeAny([permission], resourceType)(request, reply);
        // The first permission missing has answered 401 or 403.
        if (reply.sent) return;
      }
    };
  }

  return {
    authorize,
    authorizeAny,
    authorizeEach,
  };
}
