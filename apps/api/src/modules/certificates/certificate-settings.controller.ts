import type {
  CertificateSignatureCompleteRequest,
  CertificateSignaturePresignRequest,
  UpdateCertificateAcademySettingsRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { CertificateSettingsService } from "./certificate-settings.service.ts";

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

    async presignSignature(
      request: FastifyRequest<{ Body: CertificateSignaturePresignRequest }>,
    ) {
      return await service.presignSignature(request.body);
    },

    async completeSignature(
      request: FastifyRequest<{ Body: CertificateSignatureCompleteRequest }>,
    ) {
      return await service.completeSignature(request.user!.id, request.body);
    },

    async removeSignature(request: FastifyRequest) {
      return await service.removeSignature(request.user!.id);
    },

    /** The uploaded signature itself, for the settings page to show. */
    async signatureFile(_request: FastifyRequest, reply: FastifyReply) {
      const [settings, bytes] = await Promise.all([
        service.get(),
        service.signatureBytes(),
      ]);
      if (!settings.signature || !bytes) {
        return reply.status(404).send({
          success: false,
          statusCode: 404,
          error: { code: "NO_SIGNATURE", message: "No signature uploaded." },
        });
      }
      return reply
        .header("Content-Type", settings.signature.contentType)
        .header("Content-Length", String(bytes.length))
        .header("Cache-Control", "private, max-age=300")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .send(bytes);
    },
  };
}
