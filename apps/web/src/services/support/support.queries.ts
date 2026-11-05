import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  SupportAdminListResponse,
  SupportAdminStatsResponse,
  SupportTicketDetail,
  SupportTicketListResponse,
  SupportUnreadResponse,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { useAuthStore } from "../../store/auth.store";
import { supportKeys, type SupportAdminFilters } from "./support.keys";
import { supportService } from "./support.service";

/**
 * Replies and new reports come from other people, so what is cached is shown
 * at once and asked for again each time a list or ticket is shown (opening
 * the page, opening or stepping to a ticket, going back) and when the tab is
 * returned to. No polling.
 */
/**
 * Each account's answers are kept apart: after a switch of account, the
 * other one's tickets are never shown while the new ones load.
 */
function useAccountKey(): string {
  return useAuthStore((state) => state.user?.id) ?? "";
}

const freshOnEveryVisit = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: true,
} as const;

/** The signed-in learner's reports and feedback. */
export function useMySupportTickets(enabled = true) {
  const account = useAccountKey();
  return useQuery<SupportTicketListResponse, ApiError>({
    queryKey: [...supportKeys.mine(), account],
    queryFn: supportService.listMine,
    enabled,
    ...freshOnEveryVisit,
  });
}

/** How many of the learner's tickets have a reply they haven't read. */
export function useSupportUnread(enabled = true) {
  const account = useAccountKey();
  return useQuery<SupportUnreadResponse, ApiError>({
    queryKey: [...supportKeys.unread(), account],
    queryFn: supportService.unread,
    enabled,
    ...freshOnEveryVisit,
  });
}

export function useSupportTicket(
  ticketId: string | null | undefined,
  options?: { asStaff?: boolean },
) {
  const account = useAccountKey();
  const asStaff = options?.asStaff ?? false;
  return useQuery<SupportTicketDetail, ApiError>({
    queryKey: [...supportKeys.ticket(ticketId ?? "", asStaff), account],
    queryFn: () => supportService.getTicket(ticketId!, asStaff),
    enabled: Boolean(ticketId),
    ...freshOnEveryVisit,
  });
}

export function useStaffSupportTickets(
  filters: SupportAdminFilters,
  enabled = true,
) {
  const account = useAccountKey();
  return useInfiniteQuery<
    SupportAdminListResponse,
    ApiError,
    { pages: SupportAdminListResponse[] },
    readonly unknown[],
    string | undefined
  >({
    queryKey: [...supportKeys.staffList(filters), account],
    queryFn: ({ pageParam }) => supportService.listForStaff(filters, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
    ...freshOnEveryVisit,
  });
}

export function useStaffSupportStats(enabled = true) {
  const account = useAccountKey();
  return useQuery<SupportAdminStatsResponse, ApiError>({
    queryKey: [...supportKeys.staffStats(), account],
    queryFn: supportService.statsForStaff,
    enabled,
    ...freshOnEveryVisit,
  });
}
