import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  ContactChangeCompletedResponse,
  ContactChangeResponse,
  ContactChannel,
} from "@veolms/contracts";

import type { ApiError } from "../../lib/api-error";
import { authKeys } from "./auth.keys";
import { contactChangeService } from "./contact-change.service";

/** Starts a change: a code goes to the current email or number, if confirmed. */
export function useStartContactChange() {
  return useMutation<ContactChangeResponse, ApiError, ContactChannel>({
    mutationFn: (channel) => contactChangeService.start(channel),
  });
}

/** The code sent to the current value. */
export function useProveCurrentContact() {
  return useMutation<
    ContactChangeResponse,
    ApiError,
    { changeId: string; code: string }
  >({
    mutationFn: ({ changeId, code }) =>
      contactChangeService.proveCurrent(changeId, code),
  });
}

/** Sends (or sends again) a code to the new value. */
export function useSendNewContactCode() {
  return useMutation<
    ContactChangeResponse,
    ApiError,
    { changeId: string; value: string }
  >({
    mutationFn: ({ changeId, value }) =>
      contactChangeService.sendToNew(changeId, value),
  });
}

/**
 * The code sent to the new value: the change is made, and the account's
 * other devices are signed out. The account and its sessions are read again.
 */
export function useConfirmNewContact() {
  const queryClient = useQueryClient();
  return useMutation<
    ContactChangeCompletedResponse,
    ApiError,
    { changeId: string; value: string; code: string }
  >({
    mutationFn: ({ changeId, value, code }) =>
      contactChangeService.confirmNew(changeId, value, code),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: authKeys.me() }),
        queryClient.invalidateQueries({ queryKey: authKeys.sessions() }),
      ]);
    },
  });
}
