import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LegalPage,
  LegalPageChangeResponse,
  LegalPageSlug,
  LegalPagesResponse,
  SaveLegalPageRequest,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { platformKeys } from "../platform";
import { legalPagesKeys } from "./legal-pages.keys";
import { legalPagesService } from "./legal-pages.service";

/** The list with one page's saved text replaced, or removed when it is null. */
function withPage(
  list: LegalPagesResponse | undefined,
  slug: LegalPageSlug,
  page: LegalPage | null,
): LegalPagesResponse {
  const others = (list?.pages ?? []).filter((entry) => entry.slug !== slug);
  return { pages: page ? [...others, page] : others };
}

/**
 * Saves a page's text, or with `content: null` brings back its built-in
 * text. Either starts the rebuild that publishes it, whose status the
 * Platform page then follows.
 */
export function useSaveLegalPage() {
  const queryClient = useQueryClient();
  return useMutation<
    LegalPageChangeResponse,
    ApiError,
    { slug: LegalPageSlug; content: SaveLegalPageRequest | null }
  >({
    mutationFn: ({ slug, content }) =>
      content
        ? legalPagesService.savePage(slug, content)
        : legalPagesService.resetPage(slug),
    onSuccess: (response, { slug }) => {
      queryClient.setQueryData<LegalPagesResponse>(
        legalPagesKeys.list(),
        (list) => withPage(list, slug, response.page),
      );
      queryClient.setQueryData(
        platformKeys.staticSiteRebuild(),
        response.rebuild,
      );
    },
  });
}
