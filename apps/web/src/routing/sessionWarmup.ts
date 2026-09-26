import { queryClient } from "../lib/query-client";
import { currentUserQueryOptions } from "../services/auth/auth.queries";

export function warmCurrentUserSession() {
  return queryClient
    .fetchQuery(currentUserQueryOptions(queryClient))
    .catch(() => null);
}
