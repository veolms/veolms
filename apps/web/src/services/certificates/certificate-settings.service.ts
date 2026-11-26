import type {
  CertificateAcademySettings,
  UpdateCertificateAcademySettingsRequest,
} from "@veolms/contracts";

import { api, getApiRequestUrl } from "../../lib/api-client";
import { mediaService } from "../media";

/** The academy's certificate settings (Platform > Certificates). */
export const certificateSettingsService = {
  get(): Promise<CertificateAcademySettings> {
    return api.get("/certificates/settings");
  },

  update(
    body: UpdateCertificateAcademySettingsRequest,
  ): Promise<CertificateAcademySettings> {
    return api.put("/certificates/settings", body);
  },

  /**
   * Uploads the signature straight to storage, then has the API check it
   * and print it on certificates from then on.
   */
  async uploadSignature(
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<CertificateAcademySettings> {
    const contentType = file.type as "image/png" | "image/jpeg";
    const { uploadId, uploadUrl } = await api.post<{
      uploadId: string;
      uploadUrl: string;
    }>("/certificates/settings/signature/presign", {
      contentType,
      fileSize: file.size,
    });
    await mediaService.uploadFileToPresignedUrl(
      uploadUrl,
      file,
      onProgress
        ? (progress) => onProgress(Math.round(progress.percent))
        : undefined,
    );
    return api.post<CertificateAcademySettings>(
      "/certificates/settings/signature",
      { uploadId, contentType },
    );
  },

  removeSignature(): Promise<CertificateAcademySettings> {
    return api.delete("/certificates/settings/signature");
  },

  /** The signature image, for the settings card and the design editor. */
  async signatureFile(): Promise<Blob> {
    const response = await fetch(
      getApiRequestUrl("/certificates/settings/signature/file"),
      { credentials: "include" },
    );
    if (!response.ok) throw new Error("The signature could not be loaded.");
    return await response.blob();
  },
};
