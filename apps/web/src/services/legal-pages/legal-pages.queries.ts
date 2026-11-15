import { useQuery } from "@tanstack/react-query";
import type {
  AdminLegalPageListResponse,
  AdminLegalPageResponse,
  LegalPageResponse,
  LegalPageSlug,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { legalPagesKeys } from "./legal-pages.keys";
import { legalPagesService } from "./legal-pages.service";

/**
 * A legal page as visitors read it. A prerendered page starts from the copy
 * built into it and is checked once against the current words.
 */
export function useLegalPage(
  slug: LegalPageSlug,
  builtPage: LegalPageResponse | undefined,
) {
  return useQuery<LegalPageResponse, ApiError>({
    queryKey: legalPagesKeys.page(slug),
    queryFn: () => legalPagesService.getPage(slug),
    initialData: builtPage,
    // Treat the built copy as old, so the current words replace it.
    initialDataUpdatedAt: 0,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

/** Every page with what it is missing (Platform › Legal pages). */
export function useAdminLegalPages() {
  return useQuery<AdminLegalPageListResponse, ApiError>({
    queryKey: legalPagesKeys.adminList(),
    queryFn: () => legalPagesService.listAdminPages(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** One page with its placeholders, for editing. */
export function useAdminLegalPage(slug: LegalPageSlug | null) {
  return useQuery<AdminLegalPageResponse, ApiError>({
    queryKey: legalPagesKeys.adminPage(slug ?? "terms"),
    queryFn: () => legalPagesService.getAdminPage(slug!),
    enabled: slug !== null,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });
}
