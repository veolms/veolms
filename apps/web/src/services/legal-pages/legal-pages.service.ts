import type {
  AdminLegalPageListResponse,
  AdminLegalPageResponse,
  LegalPageResponse,
  LegalPageSlug,
  UpdateLegalPageRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const legalPagesService = {
  /** A page as every visitor reads it. */
  getPage(slug: LegalPageSlug): Promise<LegalPageResponse> {
    return api.get<LegalPageResponse>(`/legal-pages/${slug}`);
  },
  /** Every page, for the Platform page (administrators only). */
  listAdminPages(): Promise<AdminLegalPageListResponse> {
    return api.get<AdminLegalPageListResponse>("/platform/legal-pages");
  },
  getAdminPage(slug: LegalPageSlug): Promise<AdminLegalPageResponse> {
    return api.get<AdminLegalPageResponse>(`/platform/legal-pages/${slug}`);
  },
  savePage(
    slug: LegalPageSlug,
    page: UpdateLegalPageRequest,
  ): Promise<AdminLegalPageResponse> {
    return api.put<AdminLegalPageResponse>(
      `/platform/legal-pages/${slug}`,
      page,
    );
  },
  resetPage(slug: LegalPageSlug): Promise<AdminLegalPageResponse> {
    return api.delete<AdminLegalPageResponse>(`/platform/legal-pages/${slug}`);
  },
};
