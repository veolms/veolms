import type {
  CertificateCandidatesResponse,
  CourseCertificateSettings,
  CourseCertificatesResponse,
  CourseCertificateStatus,
  MyCertificate,
  MyCertificatesResponse,
  PublicCertificate,
  StaffCertificate,
  UpdateCourseCertificateSettingsRequest,
} from "@veolms/contracts";

import { api, getApiRequestUrl } from "../../lib/api-client";

const enc = encodeURIComponent;

/** Course certificates: the learner's, the public check, and the staff list. */
export const certificatesService = {
  courseStatus(courseKey: string): Promise<CourseCertificateStatus> {
    return api.get(`/certificates/courses/${enc(courseKey)}`);
  },

  /** Issues it to the learner's profile name: nothing is sent. */
  claim(courseKey: string): Promise<MyCertificate> {
    return api.post(`/certificates/courses/${enc(courseKey)}/claim`, {});
  },

  mine(): Promise<MyCertificatesResponse> {
    return api.get("/certificates/mine");
  },

  /** Puts the learner's current profile name on their certificate. */
  updateNameFromProfile(code: string): Promise<MyCertificate> {
    return api.patch(`/certificates/${enc(code)}/name`, {});
  },

  publicCertificate(code: string): Promise<PublicCertificate> {
    return api.get(`/certificates/public/${enc(code)}`);
  },

  /**
   * The PDF, drawn by the API for this download. Read as a file (not JSON),
   * with the session's cookies.
   */
  async downloadPdf(code: string): Promise<Blob> {
    const response = await fetch(
      getApiRequestUrl(`/certificates/${enc(code)}/download`),
      { credentials: "include" },
    );
    if (!response.ok) {
      let message = "The certificate could not be downloaded. Try again.";
      try {
        const body = (await response.json()) as {
          error?: { message?: string };
        };
        if (body.error?.message) message = body.error.message;
      } catch {
        // Not JSON: keep the general message.
      }
      throw new Error(message);
    }
    return await response.blob();
  },

  courseCertificates(
    courseId: string,
    options: { cursor?: string | null; q?: string },
  ): Promise<CourseCertificatesResponse> {
    const query = new URLSearchParams({ limit: "30" });
    if (options.cursor) query.set("cursor", options.cursor);
    if (options.q) query.set("q", options.q);
    return api.get(`/certificates/admin/courses/${enc(courseId)}?${query}`);
  },

  /**
   * Saves what is given: the share (null: the academy's) and the line under
   * the course title (null: written from the course's length).
   */
  updateSettings(
    courseId: string,
    changes: UpdateCourseCertificateSettingsRequest,
  ): Promise<CourseCertificateSettings> {
    return api.put(
      `/certificates/admin/courses/${enc(courseId)}/settings`,
      changes,
    );
  },

  /** The course's learners, with their progress, to issue one by hand. */
  candidates(
    courseId: string,
    q: string,
  ): Promise<CertificateCandidatesResponse> {
    const query = q ? `?${new URLSearchParams({ q })}` : "";
    return api.get(
      `/certificates/admin/courses/${enc(courseId)}/candidates${query}`,
    );
  },

  /** Issues the learner's certificate whatever their progress. */
  issue(courseId: string, userId: string): Promise<StaffCertificate> {
    return api.post(`/certificates/admin/courses/${enc(courseId)}/issue`, {
      userId,
    });
  },

  revoke(certificateId: string, reason: string): Promise<StaffCertificate> {
    return api.post(`/certificates/admin/${enc(certificateId)}/revoke`, {
      reason,
    });
  },

  restore(certificateId: string): Promise<StaffCertificate> {
    return api.post(`/certificates/admin/${enc(certificateId)}/restore`, {});
  },
};
