import type {
  CoursePageSectionKind,
  ReorderCoursePageSectionsRequest,
  UpdateCoursePageSectionRequest,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { PageSectionsService } from "./page-sections.service.ts";

export function createPageSectionsController({
  service,
}: {
  service: PageSectionsService;
}) {
  return {
    async get(request: FastifyRequest<{ Params: { id: string } }>) {
      return await service.get(
        request.params.id,
        request.user!.id,
        request.user?.roles,
      );
    },

    async update(
      request: FastifyRequest<{
        Params: { id: string; kind: CoursePageSectionKind | "seo" };
        Body: UpdateCoursePageSectionRequest;
      }>,
    ) {
      return await service.update(
        request.params.id,
        request.params.kind,
        request.body,
        request.user!.id,
        request.user?.roles,
      );
    },

    async reorder(
      request: FastifyRequest<{
        Params: { id: string };
        Body: ReorderCoursePageSectionsRequest;
      }>,
    ) {
      return await service.reorder(
        request.params.id,
        request.body.kinds,
        request.user!.id,
        request.user?.roles,
      );
    },
  };
}
