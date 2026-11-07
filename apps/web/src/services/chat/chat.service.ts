import type {
  ChatAttachment,
  ChatChangesResponse,
  ChatMessage,
  ChatReason,
  ChatRestrictionType,
  ChatRoomDetail,
  ChatRoomSummary,
  ChatSenderRole,
  ChatUploadKind,
} from "@veolms/contracts";

import api, { getApiRequestUrl } from "../../lib/api-client";

/** The chat list, as GET /chat/rooms answers it. */
export interface ChatRoomList {
  rooms: ChatRoomSummary[];
  requestsCount: number;
  unreadTotal: number;
}

export interface ChatMessagePage {
  messages: ChatMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  lastSeq: number;
  lastEventSeq: number;
  oldestSeq: number | null;
}

export interface ChatMemberPage {
  members: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    role: ChatSenderRole;
    isAdmin: boolean;
    isHelper: boolean;
  }>;
  nextCursor: string | null;
  total: number | null;
}

export interface ChatCandidates {
  staff: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    role: ChatSenderRole;
  }>;
  courses: Array<{
    courseId: string;
    title: string;
    directAllowed: boolean;
    people: Array<{
      id: string;
      name: string;
      avatarUrl: string | null;
      role: ChatSenderRole;
    }>;
  }>;
}

export interface ChatSendInput {
  clientId: string;
  body: string;
  replyToSeq?: number;
  mentions?: string[];
  mentionAll?: boolean;
  attachmentIds?: string[];
}

export interface ChatUploadStart {
  uploadId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  viaApi: boolean;
}

export const chatService = {
  listRooms: () => api.get<ChatRoomList>("/chat/rooms"),
  getRoom: (roomId: string) =>
    api.get<{ room: ChatRoomDetail }>(`/chat/rooms/${roomId}`),
  listMessages: (
    roomId: string,
    params: {
      before?: number;
      after?: number;
      around?: number;
      limit?: number;
    } = {},
  ) => api.get<ChatMessagePage>(`/chat/rooms/${roomId}/messages`, { params }),
  changes: (roomId: string, since: number) =>
    api.get<ChatChangesResponse>(`/chat/rooms/${roomId}/changes`, {
      params: { since },
    }),
  send: (roomId: string, input: ChatSendInput) =>
    api.post<{ message: ChatMessage; duplicate: boolean }>(
      `/chat/rooms/${roomId}/messages`,
      input,
    ),
  edit: (roomId: string, seq: number, body: string) =>
    api.patch<{ message: ChatMessage }>(
      `/chat/rooms/${roomId}/messages/${seq}`,
      { body },
    ),
  remove: (roomId: string, seq: number, scope: "everyone" | "me") =>
    api.delete<{ ok: true }>(`/chat/rooms/${roomId}/messages/${seq}`, {
      params: { for: scope },
    }),
  restore: (roomId: string, seq: number) =>
    api.post<{ message: ChatMessage }>(
      `/chat/rooms/${roomId}/messages/${seq}/restore`,
    ),
  pin: (roomId: string, seq: number, pinned: boolean) =>
    pinned
      ? api.put<{ message: ChatMessage }>(
          `/chat/rooms/${roomId}/messages/${seq}/pin`,
        )
      : api.delete<{ message: ChatMessage }>(
          `/chat/rooms/${roomId}/messages/${seq}/pin`,
        ),
  react: (roomId: string, seq: number, emoji: string | null) =>
    api.put<{ message: ChatMessage }>(
      `/chat/rooms/${roomId}/messages/${seq}/reaction`,
      { emoji },
    ),
  star: (roomId: string, seq: number, starred: boolean) =>
    starred
      ? api.put<{ ok: true }>(`/chat/rooms/${roomId}/messages/${seq}/star`)
      : api.delete<{ ok: true }>(`/chat/rooms/${roomId}/messages/${seq}/star`),
  listStars: () =>
    api.get<{
      messages: Array<ChatMessage & { roomTitle: string; starredAt: string }>;
    }>("/chat/stars"),
  receipts: (
    receipts: Array<{
      roomId: string;
      readSeq?: number;
      deliveredSeq?: number;
    }>,
  ) => api.post<{ ok: true }>("/chat/receipts", { receipts }),
  typing: (roomId: string) =>
    api.post<{ ok: true }>(`/chat/rooms/${roomId}/typing`),
  updateMyState: (
    roomId: string,
    patch: {
      notifyLevel?: "all" | "mentions" | "none";
      archived?: boolean;
      pinned?: boolean;
    },
  ) => api.patch<{ room: ChatRoomDetail }>(`/chat/rooms/${roomId}/me`, patch),
  updateSettings: (
    roomId: string,
    patch: {
      title?: string;
      description?: string | null;
      postingPolicy?: "everyone" | "staff_only";
      slowModeSeconds?: number;
      directMessagesAllowed?: boolean;
      status?: "active" | "locked" | "archived";
    },
  ) =>
    api.patch<{ room: ChatRoomDetail }>(
      `/chat/rooms/${roomId}/settings`,
      patch,
    ),
  enableCourseChat: (courseId: string) =>
    api.post<{ room: ChatRoomDetail }>(`/chat/courses/${courseId}/room`),
  listMembers: (roomId: string, params: { search?: string; cursor?: string }) =>
    api.get<ChatMemberPage>(`/chat/rooms/${roomId}/members`, { params }),
  setHelper: (roomId: string, userId: string, helper: boolean) =>
    helper
      ? api.put<{ ok: true }>(`/chat/rooms/${roomId}/helpers/${userId}`)
      : api.delete<{ ok: true }>(`/chat/rooms/${roomId}/helpers/${userId}`),
  leave: (roomId: string) =>
    api.post<{ ok: true }>(`/chat/rooms/${roomId}/leave`),
  candidates: (search: string) =>
    api.get<ChatCandidates>("/chat/direct/candidates", {
      params: search ? { search } : {},
    }),
  startDirect: (userId: string) =>
    api.post<{ room: ChatRoomDetail; created: boolean }>("/chat/direct", {
      userId,
    }),
  acceptDirect: (roomId: string) =>
    api.post<{ room: ChatRoomDetail }>(`/chat/direct/${roomId}/accept`),
  declineDirect: (roomId: string) =>
    api.post<{ ok: true }>(`/chat/direct/${roomId}/decline`),
  block: (userId: string) => api.put<{ ok: true }>(`/chat/blocks/${userId}`),
  unblock: (userId: string) =>
    api.delete<{ ok: true }>(`/chat/blocks/${userId}`),
  restrict: (input: {
    userId: string;
    roomId?: string | null;
    type: ChatRestrictionType;
    durationMinutes?: number | null;
    reason: ChatReason;
    note?: string;
  }) => api.post<{ restriction: { id: string } }>("/chat/restrictions", input),
  liftRestriction: (id: string) => api.delete(`/chat/restrictions/${id}`),
  report: (
    roomId: string,
    seq: number,
    input: { reason: ChatReason; details?: string; block?: boolean },
  ) =>
    api.post<{ ok: true }>(
      `/chat/rooms/${roomId}/messages/${seq}/report`,
      input,
    ),
  startUpload: (
    roomId: string,
    input: {
      kind: ChatUploadKind;
      name: string;
      mimeType: string;
      size: number;
      width?: number;
      height?: number;
      durationMs?: number;
      waveform?: number[];
    },
  ) => api.post<ChatUploadStart>(`/chat/rooms/${roomId}/uploads`, input),
  completeUpload: (uploadId: string) =>
    api.post<{ attachment: ChatAttachment }>(
      `/chat/uploads/${uploadId}/complete`,
    ),
  /** The live stream (one per tab). */
  openStream: () =>
    new EventSource(getApiRequestUrl("/chat/stream"), {
      withCredentials: true,
    }),
  /** An attachment's address, read with the session cookie. */
  fileUrl: (attachment: Pick<ChatAttachment, "url">, download = false) => {
    // A file still on its way is shown from this browser's copy.
    if (attachment.url.startsWith("blob:")) return attachment.url;
    const path = attachment.url.replace(/^\/v1/, "");
    return getApiRequestUrl(download ? `${path}?download=1` : path);
  },
  /**
   * PUTs a file with progress: to object storage (presigned), or to the API
   * in development (`viaApi`, which needs the session cookie).
   */
  putFile: (
    start: ChatUploadStart,
    file: Blob,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const url = start.viaApi
        ? getApiRequestUrl(start.uploadUrl.replace(/^\/v1/, ""))
        : start.uploadUrl;
      xhr.open("PUT", url);
      if (start.viaApi) xhr.withCredentials = true;
      for (const [name, value] of Object.entries(start.headers)) {
        xhr.setRequestHeader(name, value);
      }
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded / event.total);
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(file);
    }),
};
