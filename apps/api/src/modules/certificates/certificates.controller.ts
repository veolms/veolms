import type {
  IssueCertificateRequest,
  CourseCertificatesQuery,
  RevokeCertificateRequest,
  UpdateCourseCertificateSettingsRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type {
  CertificatesService,
  CertificateViewer,
} from "./certificates.service.ts";

function viewerOf(request: FastifyRequest): CertificateViewer {
  const user = request.user!;
  return { id: user.id, displayName: user.displayName || user.name || "" };
}

/**
 * `attachment` with a plain-ASCII file name for old clients and the full
 * UTF-8 name (a Hindi name, say) for the rest.
 */
function attachmentDisposition(fileName: string): string {
  const ascii =
    fileName
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/gu, "")
      .replace(/["\\/:*?<>|]+/gu, "")
      .replace(/\s+/gu, " ")
      .trim() || "certificate.pdf";
  const encoded = encodeURIComponent(fileName.replace(/[\\/:*?"<>|]+/gu, ""));
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

export function createCertificatesController({
  service,
}: {
  service: CertificatesService;
}) {
  return {
    async courseStatus(
      request: FastifyRequest<{ Params: { courseId: string } }>,
    ) {
      return await service.getCourseStatus(
        viewerOf(request),
        request.params.courseId,
      );
    },

    async claim(
      request: FastifyRequest<{ Params: { courseId: string } }>,
      reply: FastifyReply,
    ) {
      const result = await service.claim(
        viewerOf(request),
        request.params.courseId,
      );
      reply.status(result.created ? 201 : 200);
      return result.certificate;
    },

    async mine(request: FastifyRequest) {
      return { items: await service.listMine(request.user!.id) };
    },

    async correctName(request: FastifyRequest<{ Params: { code: string } }>) {
      return await service.correctName(viewerOf(request), request.params.code);
    },

    async download(
      request: FastifyRequest<{ Params: { code: string } }>,
      reply: FastifyReply,
    ) {
      const result = await service.download(
        viewerOf(request),
        request.params.code,
      );
      if (request.headers["if-none-match"] === result.etag) {
        return reply.status(304).send();
      }
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Length", String(result.pdf.length))
        .header("Content-Disposition", attachmentDisposition(result.fileName))
        .header("Cache-Control", "private, max-age=3600")
        .header("ETag", result.etag)
        .header("X-Content-Type-Options", "nosniff")
        .send(result.pdf);
    },

    /**
     * The public check. Short edge caching: a revoke or a name correction
     * shows within five minutes everywhere.
     */
    async publicCertificate(
      request: FastifyRequest<{ Params: { code: string } }>,
      reply: FastifyReply,
    ) {
      const certificate = await service.getPublic(request.params.code);
      reply.header("Cache-Control", "public, max-age=60, s-maxage=300");
      reply.header("X-Robots-Tag", "noindex");
      return certificate;
    },

    async courseCertificates(
      request: FastifyRequest<{
        Params: { courseId: string };
        Querystring: CourseCertificatesQuery;
      }>,
    ) {
      const query = request.query;
      return await service.listForCourse(
        request.user!.id,
        request.params.courseId,
        {
          cursor: query.cursor,
          limit: Number(query.limit ?? 30),
          q: query.q,
        },
      );
    },

    async updateSettings(
      request: FastifyRequest<{
        Params: { courseId: string };
        Body: UpdateCourseCertificateSettingsRequest;
      }>,
    ) {
      return await service.setThreshold(
        request.user!.id,
        request.params.courseId,
        request.body.thresholdPercent,
      );
    },

    async revoke(
      request: FastifyRequest<{
        Params: { certificateId: string };
        Body: RevokeCertificateRequest;
      }>,
    ) {
      return await service.revoke(
        request.user!.id,
        request.params.certificateId,
        request.body.reason,
      );
    },

    async candidates(
      request: FastifyRequest<{
        Params: { courseId: string };
        Querystring: { q?: string };
      }>,
    ) {
      return {
        items: await service.candidates(
          request.user!.id,
          request.params.courseId,
          request.query.q,
        ),
      };
    },

    async manualIssue(
      request: FastifyRequest<{
        Params: { courseId: string };
        Body: IssueCertificateRequest;
      }>,
    ) {
      return await service.manualIssue(
        request.user!.id,
        request.params.courseId,
        request.body.userId,
      );
    },

    async restore(
      request: FastifyRequest<{ Params: { certificateId: string } }>,
    ) {
      return await service.restore(
        request.user!.id,
        request.params.certificateId,
      );
    },
  };
}
