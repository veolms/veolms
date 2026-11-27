import { useQuery } from "@tanstack/react-query";
import type { LegalPagesResponse } from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { legalPagesKeys } from "./legal-pages.keys";
import { legalPagesService } from "./legal-pages.service";

/** The legal pages with saved text, for Platform → Legal pages. */
export function useLegalPages() {
  return useQuery<LegalPagesResponse, ApiError>({
    queryKey: legalPagesKeys.list(),
    queryFn: () => legalPagesService.listPages(),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
