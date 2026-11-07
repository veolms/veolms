import { api } from "../../lib/api-client";
import type {
  ContactChangeCompletedResponse,
  ContactChangeResponse,
  ContactChannel,
} from "@veolms/contracts";

/**
 * Changing one's own email address or mobile number: a code to the current
 * value first, then one to the new value. Kept out of `auth.service`, which
 * every page loads: only the change dialog needs these.
 */
export const contactChangeService = {
  start: (channel: ContactChannel): Promise<ContactChangeResponse> =>
    api.post<ContactChangeResponse>("/auth/me/contact-changes", { channel }),

  proveCurrent: (
    changeId: string,
    code: string,
  ): Promise<ContactChangeResponse> =>
    api.post<ContactChangeResponse>(
      `/auth/me/contact-changes/${encodeURIComponent(changeId)}/current`,
      { code },
    ),

  sendToNew: (
    changeId: string,
    value: string,
  ): Promise<ContactChangeResponse> =>
    api.post<ContactChangeResponse>(
      `/auth/me/contact-changes/${encodeURIComponent(changeId)}/new`,
      { value },
    ),

  confirmNew: (
    changeId: string,
    value: string,
    code: string,
  ): Promise<ContactChangeCompletedResponse> =>
    api.post<ContactChangeCompletedResponse>(
      `/auth/me/contact-changes/${encodeURIComponent(changeId)}/confirm`,
      { value, code },
    ),
};
