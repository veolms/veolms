import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type {
  ShortLinkListResponse,
  ShortLinkPathCheckResponse,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { linksKeys } from "./links.keys";
import { linksService } from "./links.service";

export function useShortLinks(options?: { enabled?: boolean }) {
  return useQuery<ShortLinkListResponse, ApiError>({
    queryKey: linksKeys.list(),
    queryFn: () => linksService.list(),
    enabled: options?.enabled ?? true,
  });
}

/** Checks a path as it is typed (pass it debounced). */
export function useShortLinkPathCheck(
  path: string,
  options?: { linkId?: string; enabled?: boolean },
) {
  return useQuery<ShortLinkPathCheckResponse, ApiError>({
    queryKey: linksKeys.pathCheck(path, options?.linkId),
    queryFn: () => linksService.checkPath(path, options?.linkId),
    enabled: options?.enabled ?? true,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });
}
