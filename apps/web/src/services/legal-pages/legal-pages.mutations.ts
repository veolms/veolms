import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  AdminLegalPageResponse,
  LegalPageSlug,
  UpdateLegalPageRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { legalPagesKeys } from "./legal-pages.keys";
import { legalPagesService } from "./legal-pages.service";

function useAfterChange() {
  const queryClient = useQueryClient();
  return (saved: AdminLegalPageResponse) => {
    queryClient.setQueryData(legalPagesKeys.adminPage(saved.slug), saved);
    void queryClient.invalidateQueries({
      queryKey: legalPagesKeys.adminList(),
    });
    void queryClient.invalidateQueries({
      queryKey: legalPagesKeys.page(saved.slug),
    });
  };
}

/** Saves a page's words. */
export function useSaveLegalPage() {
  const afterChange = useAfterChange();
  return useMutation<
    AdminLegalPageResponse,
    ApiError,
    { slug: LegalPageSlug; page: UpdateLegalPageRequest }
  >({
    mutationFn: ({ slug, page }) => legalPagesService.savePage(slug, page),
    onSuccess: afterChange,
  });
}

/** Restores a page's default words. */
export function useResetLegalPage() {
  const afterChange = useAfterChange();
  return useMutation<AdminLegalPageResponse, ApiError, LegalPageSlug>({
    mutationFn: (slug) => legalPagesService.resetPage(slug),
    onSuccess: afterChange,
  });
}
