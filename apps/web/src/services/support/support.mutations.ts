import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSupportMessageRequest,
  CreateSupportTicketRequest,
  SupportTicketDetail,
  SupportTicketStatus,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { supportKeys } from "./support.keys";
import { supportService } from "./support.service";

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation<
    { id: string; number: number },
    ApiError,
    CreateSupportTicketRequest
  >({
    mutationFn: supportService.createTicket,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supportKeys.all });
    },
  });
}

/** After a reply or a status change: the ticket as the server now has it. */
function useStoreTicket() {
  const queryClient = useQueryClient();
  return (ticket: SupportTicketDetail) => {
    queryClient.setQueryData(
      supportKeys.ticket(ticket.id, ticket.viewerIsStaff),
      ticket,
    );
    void queryClient.invalidateQueries({ queryKey: supportKeys.mine() });
    void queryClient.invalidateQueries({ queryKey: supportKeys.staffLists() });
    void queryClient.invalidateQueries({ queryKey: supportKeys.staffStats() });
  };
}

export function usePostSupportMessage(ticketId: string, asStaff = false) {
  const storeTicket = useStoreTicket();
  return useMutation<
    SupportTicketDetail,
    ApiError,
    CreateSupportMessageRequest
  >({
    mutationFn: (body) => supportService.postMessage(ticketId, body, asStaff),
    onSuccess: storeTicket,
  });
}

export function useUpdateSupportStatus(ticketId: string) {
  const storeTicket = useStoreTicket();
  return useMutation<SupportTicketDetail, ApiError, SupportTicketStatus>({
    mutationFn: (status) => supportService.updateStatus(ticketId, status),
    onSuccess: storeTicket,
  });
}
