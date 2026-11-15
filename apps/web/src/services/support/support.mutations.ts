import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSupportMessageRequest,
  CreateSupportTicketRequest,
  CreateSupportTicketResponse,
  SupportTicketDetail,
  UpdateSupportTicketRequest,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { useAuthStore } from "../../store/auth.store";
import { supportKeys } from "./support.keys";
import { supportService } from "./support.service";

export function useCreateSupportTicket() {
  const queryClient = useQueryClient();
  return useMutation<
    CreateSupportTicketResponse,
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
  const account = useAuthStore((state) => state.user?.id) ?? "";
  return (ticket: SupportTicketDetail) => {
    queryClient.setQueryData(
      [...supportKeys.ticket(ticket.id, ticket.viewerIsStaff), account],
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

/** Status, assignee, priority or category. The team's counts move too. */
export function useUpdateSupportTicket(ticketId: string) {
  const queryClient = useQueryClient();
  const storeTicket = useStoreTicket();
  return useMutation<SupportTicketDetail, ApiError, UpdateSupportTicketRequest>(
    {
      mutationFn: (body) => supportService.updateTicket(ticketId, body),
      onSuccess: (ticket) => {
        storeTicket(ticket);
        void queryClient.invalidateQueries({ queryKey: supportKeys.team() });
      },
    },
  );
}

export type SupportNoteAction =
  | { type: "edit"; messageId: string; content: string }
  | { type: "pin"; messageId: string; pinned: boolean }
  | { type: "delete"; messageId: string };

/** Edit, pin or delete an internal note. */
export function useSupportNoteAction(ticketId: string) {
  const storeTicket = useStoreTicket();
  return useMutation<SupportTicketDetail, ApiError, SupportNoteAction>({
    mutationFn: (action) =>
      action.type === "edit"
        ? supportService.editNote(ticketId, action.messageId, action.content)
        : action.type === "pin"
          ? supportService.pinNote(ticketId, action.messageId, action.pinned)
          : supportService.deleteNote(ticketId, action.messageId),
    onSuccess: storeTicket,
  });
}
