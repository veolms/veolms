import type {
  CertificateAcademySettings,
  CertificateImageKind,
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
   * Uploads a signature, badge or background straight to storage, then has
   * the API check it and print it on certificates from then on.
   */
  async uploadImage(
    kind: CertificateImageKind,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<CertificateAcademySettings> {
    const contentType = file.type as "image/png" | "image/jpeg";
    const { uploadId, uploadUrl } = await api.post<{
      uploadId: string;
      uploadUrl: string;
    }>(`/certificates/settings/${kind}/presign`, {
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
      `/certificates/settings/${kind}`,
      { uploadId, contentType },
    );
  },

  /** Goes back to the design's own signature, badge or background. */
  removeImage(kind: CertificateImageKind): Promise<CertificateAcademySettings> {
    return api.delete(`/certificates/settings/${kind}`);
  },

  /** An uploaded image, for the settings card and the design editor. */
  async imageFile(kind: CertificateImageKind): Promise<Blob> {
    const response = await fetch(
      getApiRequestUrl(`/certificates/settings/${kind}/file`),
      { credentials: "include" },
    );
    if (!response.ok) throw new Error(`The ${kind} could not be loaded.`);
    return await response.blob();
  },
};
