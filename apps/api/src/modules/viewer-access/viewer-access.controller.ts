import type { FastifyRequest } from "fastify";

import { isLearnerViewRequest } from "../../lib/learner-view.ts";
import type {
  ViewerAccessService,
  ViewerAccessUser,
} from "./viewer-access.service.ts";

function viewerOf(request: FastifyRequest): ViewerAccessUser | undefined {
  return request.user
    ? {
        id: request.user.id,
        roles: request.user.roles,
        learnerView: isLearnerViewRequest(request),
      }
    : undefined;
}

export function createViewerAccessController({
  service,
}: {
  service: ViewerAccessService;
}) {
  async function listCourseAccess(request: FastifyRequest) {
    return await service.listCourseAccess(viewerOf(request));
  }

  async function getCourseAccess(
    request: FastifyRequest<{ Params: { idOrSlug: string } }>,
  ) {
    return await service.getCourseAccess(
      request.params.idOrSlug,
      viewerOf(request),
    );
  }

  return { listCourseAccess, getCourseAccess };
}
