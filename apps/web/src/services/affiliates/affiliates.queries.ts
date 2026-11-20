import { useQuery } from "@tanstack/react-query";

import { affiliatesKeys } from "./affiliates.keys";
import { affiliatesService } from "./affiliates.service";

/** The affiliate program's public facts (the join page). */
export function useAffiliateProgram(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: affiliatesKeys.program(),
    queryFn: affiliatesService.getProgram,
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
  });
}
