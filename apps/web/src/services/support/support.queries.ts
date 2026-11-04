import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type {
  SupportAdminListResponse,
  SupportAdminStatsResponse,
  SupportTicketDetail,
  SupportTicketListResponse,
  SupportUnreadResponse,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { supportKeys, type SupportAdminFilters } from "./support.keys";
import { supportService } from "./support.service";

/**
 * Replies and new reports come from other people, so what is cached is shown
 * at once and asked for again each time a list or ticket is shown (opening
 * the page, opening or stepping to a ticket, going back) and when the tab is
 * returned to. No polling.
 */
const freshOnEveryVisit = {
  staleTime: 0,
  refetchOnMount: "always",
  refetchOnWindowFocus: true,
} as const;

/** The signed-in learner's reports and feedback. */
export function useMySupportTickets(enabled = true) {
  return useQuery<SupportTicketListResponse, ApiError>({
    queryKey: supportKeys.mine(),
    queryFn: supportService.listMine,
    enabled,
    ...freshOnEveryVisit,
  });
}

/** How many of the learner's tickets have a reply they haven't read. */
export function useSupportUnread(enabled = true) {
  return useQuery<SupportUnreadResponse, ApiError>({
    queryKey: supportKeys.unread(),
    queryFn: supportService.unread,
    enabled,
    ...freshOnEveryVisit,
  });
}

export function useSupportTicket(
  ticketId: string | null | undefined,
  options?: { asStaff?: boolean },
) {
  const asStaff = options?.asStaff ?? false;
  return useQuery<SupportTicketDetail, ApiError>({
    queryKey: supportKeys.ticket(ticketId ?? "", asStaff),
    queryFn: () => supportService.getTicket(ticketId!, asStaff),
    enabled: Boolean(ticketId),
    ...freshOnEveryVisit,
  });
}

export function useStaffSupportTickets(
  filters: SupportAdminFilters,
  enabled = true,
) {
  return useInfiniteQuery<
    SupportAdminListResponse,
    ApiError,
    { pages: SupportAdminListResponse[] },
    ReturnType<typeof supportKeys.staffList>,
    string | undefined
  >({
    queryKey: supportKeys.staffList(filters),
    queryFn: ({ pageParam }) => supportService.listForStaff(filters, pageParam),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled,
    ...freshOnEveryVisit,
  });
}

export function useStaffSupportStats(enabled = true) {
  return useQuery<SupportAdminStatsResponse, ApiError>({
    queryKey: supportKeys.staffStats(),
    queryFn: supportService.statsForStaff,
    enabled,
    ...freshOnEveryVisit,
  });
}
