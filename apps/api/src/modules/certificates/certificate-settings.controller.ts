import type {
  CertificateImageKind,
  CertificateSignatureCompleteRequest,
  CertificateSignaturePresignRequest,
  UpdateCertificateAcademySettingsRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { CertificateSettingsService } from "./certificate-settings.service.ts";

type KindParams = { Params: { kind: CertificateImageKind } };

export function createCertificateSettingsController({
  service,
}: {
  service: CertificateSettingsService;
}) {
  return {
    async get() {
      return await service.get();
    },

    async update(
      request: FastifyRequest<{
        Body: UpdateCertificateAcademySettingsRequest;
      }>,
    ) {
      return await service.update(request.user!.id, request.body);
    },

    async presignImage(
      request: FastifyRequest<
        KindParams & { Body: CertificateSignaturePresignRequest }
      >,
    ) {
      return await service.presignImage(request.params.kind, request.body);
    },

    async completeImage(
      request: FastifyRequest<
        KindParams & { Body: CertificateSignatureCompleteRequest }
      >,
    ) {
      return await service.completeImage(
        request.user!.id,
        request.params.kind,
        request.body,
      );
    },

    async removeImage(request: FastifyRequest<KindParams>) {
      return await service.removeImage(request.user!.id, request.params.kind);
    },

    /** An uploaded image itself, for the settings page to show. */
    async imageFile(request: FastifyRequest<KindParams>, reply: FastifyReply) {
      const { kind } = request.params;
      const [settings, bytes] = await Promise.all([
        service.get(),
        service.imageBytes(kind),
      ]);
      const saved = settings[kind];
      if (!saved || !bytes) {
        return reply.status(404).send({
          success: false,
          statusCode: 404,
          error: { code: "NO_IMAGE", message: `No ${kind} uploaded.` },
        });
      }
      return reply
        .header("Content-Type", saved.contentType)
        .header("Content-Length", String(bytes.length))
        .header("Cache-Control", "private, max-age=300")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .send(bytes);
    },
  };
}
