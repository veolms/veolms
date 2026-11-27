import type {
  LegalPageChangeResponse,
  LegalPageSlug,
  LegalPagesResponse,
  SaveLegalPageRequest,
} from "@veolms/contracts";
import { api } from "../../lib/api-client";

export const legalPagesService = {
  /** Every legal page with saved text (administrators only). */
  listPages(): Promise<LegalPagesResponse> {
    return api.get<LegalPagesResponse>("/platform/legal-pages");
  },
  savePage(
    slug: LegalPageSlug,
    content: SaveLegalPageRequest,
  ): Promise<LegalPageChangeResponse> {
    return api.put<LegalPageChangeResponse>(
      `/platform/legal-pages/${slug}`,
      content,
    );
  },
  /** Removes the saved text, so the page shows its built-in text again. */
  resetPage(slug: LegalPageSlug): Promise<LegalPageChangeResponse> {
    return api.delete<LegalPageChangeResponse>(`/platform/legal-pages/${slug}`);
  },
};
