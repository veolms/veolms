import type {
  CertificateDesignPresignRequest,
  CreateCertificateDesignRequest,
  PreviewCertificateDesignRequest,
  UpdateCertificateDesignRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { CertificateDesignsService } from "./certificate-designs.service.ts";

type DesignParams = { Params: { designId: string } };

export function createCertificateDesignsController({
  service,
}: {
  service: CertificateDesignsService;
}) {
  return {
    async list() {
      return { items: await service.list() };
    },

    async presign(
      request: FastifyRequest<{ Body: CertificateDesignPresignRequest }>,
    ) {
      return await service.presign(request.body);
    },

    async create(
      request: FastifyRequest<{ Body: CreateCertificateDesignRequest }>,
    ) {
      return await service.create(request.user!.id, request.body);
    },

    async update(
      request: FastifyRequest<
        DesignParams & { Body: UpdateCertificateDesignRequest }
      >,
    ) {
      return await service.update(request.params.designId, request.body);
    },

    async activate(request: FastifyRequest<DesignParams>) {
      return { items: await service.activate(request.params.designId) };
    },

    async remove(request: FastifyRequest<DesignParams>) {
      await service.remove(request.params.designId);
      return { deleted: true as const };
    },

    async file(request: FastifyRequest<DesignParams>, reply: FastifyReply) {
      const { bytes, contentType } = await service.file(
        request.params.designId,
      );
      return reply
        .header("Content-Type", contentType)
        .header("Content-Length", String(bytes.length))
        .header("Cache-Control", "private, max-age=3600")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .send(bytes);
    },

    async preview(
      request: FastifyRequest<
        DesignParams & { Body: PreviewCertificateDesignRequest }
      >,
      reply: FastifyReply,
    ) {
      const pdf = await service.preview(
        request.params.designId,
        request.body.layout,
      );
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Length", String(pdf.length))
        .header(
          "Content-Disposition",
          'inline; filename="certificate-preview.pdf"',
        )
        .header("Cache-Control", "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .send(pdf);
    },
  };
}
