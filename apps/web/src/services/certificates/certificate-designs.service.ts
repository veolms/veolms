import type {
  CertificateDesign,
  CertificateDesignContentType,
  CertificateDesignLayout,
  CertificateDesignPresignResponse,
  CertificateDesignsResponse,
} from "@veolms/contracts";

import { api, getApiRequestUrl } from "../../lib/api-client";
import { mediaService } from "../media";

const enc = encodeURIComponent;

async function readFile(response: Response, fallback: string): Promise<Blob> {
  if (response.ok) return await response.blob();
  let message = fallback;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) message = body.error.message;
  } catch {
    // Not JSON: keep the general message.
  }
  throw new Error(message);
}

/** Certificate designs (Platform > Certificates). */
export const certificateDesignsService = {
  list(): Promise<CertificateDesignsResponse> {
    return api.get("/certificates/designs");
  },

  /**
   * Uploads a sheet straight to storage, then has the API check it and
   * save it as a design (not finalised).
   */
  async upload(
    file: File,
    name: string,
    onProgress?: (percent: number) => void,
  ): Promise<CertificateDesign> {
    const contentType = file.type as CertificateDesignContentType;
    const { uploadId, uploadUrl } =
      await api.post<CertificateDesignPresignResponse>(
        "/certificates/designs/presign",
        { contentType, fileSize: file.size },
      );
    await mediaService.uploadFileToPresignedUrl(
      uploadUrl,
      file,
      onProgress
        ? (progress) => onProgress(Math.round(progress.percent))
        : undefined,
    );
    return api.post<CertificateDesign>("/certificates/designs", {
      uploadId,
      contentType,
      name,
    });
  },

  update(
    id: string,
    body: { name?: string; layout?: CertificateDesignLayout },
  ): Promise<CertificateDesign> {
    return api.patch(`/certificates/designs/${enc(id)}`, body);
  },

  activate(id: string): Promise<CertificateDesignsResponse> {
    return api.post(`/certificates/designs/${enc(id)}/activate`, {});
  },

  remove(id: string): Promise<{ deleted: true }> {
    return api.delete(`/certificates/designs/${enc(id)}`);
  },

  /** The uploaded sheet itself, for the editor to draw. */
  async file(id: string): Promise<Blob> {
    const response = await fetch(
      getApiRequestUrl(`/certificates/designs/${enc(id)}/file`),
      { credentials: "include" },
    );
    return readFile(response, "The design could not be loaded.");
  },

  /** A sample certificate on the design, with unsaved changes if given. */
  async preview(id: string, layout?: CertificateDesignLayout): Promise<Blob> {
    const response = await fetch(
      getApiRequestUrl(`/certificates/designs/${enc(id)}/preview`),
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout ? { layout } : {}),
      },
    );
    return readFile(response, "The preview could not be made.");
  },
};
