import type {
  CreateSupportMessageRequest,
  CreateSupportTicketRequest,
  SupportAdminListResponse,
  SupportAdminStatsResponse,
  SupportAttachment,
  SupportTicketDetail,
  SupportTicketListResponse,
  SupportTicketStatus,
  SupportUnreadResponse,
} from "@veolms/contracts";

import api, { getApiRequestUrl } from "../../lib/api-client";
import type { ApiError } from "../../lib/api-error";
import type { SupportAdminFilters } from "./support.keys";

/** Upload progress, 0 to 1. */
export type SupportUploadProgress = (fraction: number) => void;

export const supportService = {
  listMine: (): Promise<SupportTicketListResponse> =>
    api.get<SupportTicketListResponse>("/support/tickets"),

  unread: (): Promise<SupportUnreadResponse> =>
    api.get<SupportUnreadResponse>("/support/unread"),

  /** `asStaff`: as the team, even a ticket the viewer sent themself. */
  getTicket: (
    ticketId: string,
    asStaff = false,
  ): Promise<SupportTicketDetail> =>
    api.get<SupportTicketDetail>(`/support/tickets/${ticketId}`, {
      params: asStaff ? { as: "staff" } : undefined,
    }),

  createTicket: (
    body: CreateSupportTicketRequest,
  ): Promise<{ id: string; number: number }> =>
    api.post<{ id: string; number: number }>("/support/tickets", body),

  postMessage: (
    ticketId: string,
    body: CreateSupportMessageRequest,
    asStaff = false,
  ): Promise<SupportTicketDetail> =>
    api.post<SupportTicketDetail>(
      `/support/tickets/${ticketId}/messages`,
      body,
      { params: asStaff ? { as: "staff" } : undefined },
    ),

  updateStatus: (
    ticketId: string,
    status: SupportTicketStatus,
  ): Promise<SupportTicketDetail> =>
    api.patch<SupportTicketDetail>(`/support/tickets/${ticketId}`, { status }),

  listForStaff: (
    filters: SupportAdminFilters,
    cursor?: string,
  ): Promise<SupportAdminListResponse> =>
    api.get<SupportAdminListResponse>("/support/admin/tickets", {
      params: { ...filters, ...(cursor ? { cursor } : {}) },
    }),

  statsForStaff: (): Promise<SupportAdminStatsResponse> =>
    api.get<SupportAdminStatsResponse>("/support/admin/stats"),

  /**
   * Uploads one file as it is picked, reporting progress (fetch cannot, so
   * this one request uses XMLHttpRequest).
   */
  uploadAttachment(
    file: File,
    dimensions: { width?: number; height?: number },
    onProgress?: SupportUploadProgress,
    signal?: AbortSignal,
  ): Promise<SupportAttachment> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      if (dimensions.width) form.append("width", String(dimensions.width));
      if (dimensions.height) form.append("height", String(dimensions.height));
      form.append("file", file, file.name);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", getApiRequestUrl("/support/attachments"));
      xhr.withCredentials = true;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(event.loaded / event.total);
      };
      const fail = (message: string, status = 0, code = "UPLOAD_FAILED") => {
        const error: ApiError = { status, code, message };
        reject(error);
      };
      xhr.onload = () => {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          // Not JSON: handled below.
        }
        const envelope = body as {
          data?: SupportAttachment;
          error?: { code?: string; message?: string };
        } | null;
        if (xhr.status >= 200 && xhr.status < 300 && envelope?.data) {
          resolve(envelope.data);
        } else {
          fail(
            envelope?.error?.message ?? "The file could not be uploaded.",
            xhr.status,
            envelope?.error?.code,
          );
        }
      };
      xhr.onerror = () =>
        fail("The file could not be uploaded. Check your connection.");
      xhr.onabort = () => fail("Upload cancelled.", 0, "ERR_CANCELED");
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(form);
    });
  },
};

/** A file the API serves, as a URL the browser can open. */
export function supportFileUrl(path: string): string {
  return getApiRequestUrl(path);
}
