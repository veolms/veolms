import type {
  ChatAttachment,
  ChatChangesResponse,
  ChatForwardRequest,
  ChatForwardResponse,
  ChatMessage,
  ChatMessageInfo,
  ChatMessageReactions,
  ChatUploadLink,
  ChatMessageSearchResponse,
  ChatPersonCardResponse,
  ChatProfile,
  ChatReason,
  ChatReport,
  ChatRestriction,
  ChatRestrictionType,
  ChatRoomDetail,
  ChatRoomSummary,
  ChatSenderRole,
  ChatUploadKind,
} from "@veolms/contracts";

import api, { getApiRequestUrl } from "../../lib/api-client";

/**
 * CDN links (`?t=` token) the API sent for chat files and group pictures,
 * by the API path they stand for. A message from the live stream carries
 * no link, so the one seen before is kept for it.
 */
const directLinks = new Map<string, string>();
/** The other way: a CDN link back to its API path, for the fallback. */
const apiPaths = new Map<string, string>();
/** CDN links that did not load (expired, or refused): not used again. */
const failedLinks = new Set<string>();

/** When a CDN link's token runs out (ms), from its first 8 hex digits. */
function linkExpiry(link: string): number | null {
  const token = /[?&]t=([0-9a-f]{8})/i.exec(link)?.[1];
  return token ? parseInt(token, 16) * 1000 : null;
}

/** The CDN link to show for a file, while it still works. */
function directLink(apiPath: string, directUrl?: string): string | null {
  if (directUrl) directLinks.set(apiPath, directUrl);
  const link = directUrl ?? directLinks.get(apiPath);
  if (!link || failedLinks.has(link)) return null;
  const expiry = linkExpiry(link);
  if (expiry !== null && expiry < Date.now() + 60_000) {
    directLinks.delete(apiPath);
    return null;
  }
  return link;
}

function apiFileUrl(url: string, download = false): string {
  const path = url.replace(/^\/v1/, "");
  return getApiRequestUrl(download ? `${path}?download=1` : path);
}

/**
 * Reads a file through its short-lived link (no cookies to the store), or
 * from the API in development.
 */
async function readFile(
  attachment: Pick<ChatAttachment, "url">,
  signal?: AbortSignal,
): Promise<Response> {
  if (attachment.url.startsWith("blob:")) return fetch(attachment.url);
  const path = attachment.url.replace(/^\/v1/, "");
  const { url } = await api.get<ChatUploadLink>(`${path}?link=1`);
  const viaApi = url.startsWith("/v1/");
  const response = await fetch(
    viaApi ? getApiRequestUrl(url.replace(/^\/v1/, "")) : url,
    { signal, credentials: viaApi ? "include" : "omit" },
  );
  if (!response.ok) throw new Error(`File read failed (${response.status})`);
  return response;
}

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
  /** With a search: everyone found whom you may message. */
  results: Array<{
    id: string;
    name: string;
    avatarUrl: string | null;
    role: ChatSenderRole;
  }>;
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
  /** "Reply privately": the group `replyToSeq` is in. */
  replyToRoomId?: string;
  mentions?: string[];
  mentionAll?: boolean;
  attachmentIds?: string[];
}

export interface ChatUploadStart {
  uploadId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  viaApi: boolean;
  /** A large file goes up in parts (see `putFile`). */
  multipart?: {
    storageUploadId: string;
    partSize: number;
    partUrls: string[];
  };
}

/** Parts of a large file sent at once. */
const PART_CONCURRENCY = 3;
/** Tries per part before the upload fails (a dropped connection). */
const PART_ATTEMPTS = 4;

/** PUTs one blob with progress. */
function putBlob(
  url: string,
  body: Blob,
  options: {
    headers?: Record<string, string>;
    withCredentials?: boolean;
    onProgress: (loaded: number) => void;
    signal?: AbortSignal;
  },
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (options.withCredentials) xhr.withCredentials = true;
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress(event.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    if (options.signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    options.signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

/**
 * Sends a large file in parts, a few at a time; a part that fails is sent
 * again (a long upload over a phone line drops now and then).
 */
async function putParts(
  multipart: NonNullable<ChatUploadStart["multipart"]>,
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
) {
  const { partSize, partUrls } = multipart;
  const loaded = new Array<number>(partUrls.length).fill(0);
  const report = () =>
    onProgress(loaded.reduce((sum, bytes) => sum + bytes, 0) / file.size);
  let next = 0;
  const worker = async () => {
    while (next < partUrls.length) {
      const index = next++;
      const body = file.slice(index * partSize, (index + 1) * partSize);
      for (let attempt = 1; ; attempt += 1) {
        try {
          await putBlob(partUrls[index]!, body, {
            signal,
            onProgress: (bytes) => {
              loaded[index] = bytes;
              report();
            },
          });
          loaded[index] = body.size;
          report();
          break;
        } catch (error) {
          loaded[index] = 0;
          if (
            attempt >= PART_ATTEMPTS ||
            (error instanceof DOMException && error.name === "AbortError")
          ) {
            throw error;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PART_CONCURRENCY, partUrls.length) }, worker),
  );
}

export const chatService = {
  listRooms: () => api.get<ChatRoomList>("/chat/rooms"),
  getProfile: () => api.get<ChatProfile>("/chat/me/profile"),
  updateProfile: (patch: Partial<ChatProfile>) =>
    api.patch<ChatProfile>("/chat/me/profile", patch),
  searchMessages: (roomId: string, q: string, before?: number) =>
    api.get<ChatMessageSearchResponse>(`/chat/rooms/${roomId}/search`, {
      params: before ? { q, before } : { q },
    }),
  listReports: (params: {
    roomId?: string;
    status?: "open" | "actioned" | "dismissed";
  }) =>
    api.get<{ reports: ChatReport[]; nextCursor: string | null }>(
      "/chat/reports",
      { params },
    ),
  handleReport: (id: string, status: "actioned" | "dismissed") =>
    api.patch<{ ok: true }>(`/chat/reports/${id}`, { status }),
  listRestrictions: (params: { roomId?: string; active?: boolean }) =>
    api.get<{ restrictions: ChatRestriction[] }>("/chat/restrictions", {
      params: {
        ...(params.roomId ? { roomId: params.roomId } : {}),
        ...(params.active !== undefined
          ? { active: String(params.active) }
          : {}),
      },
    }),
  messageInfo: (roomId: string, seq: number) =>
    api.get<ChatMessageInfo>(`/chat/rooms/${roomId}/messages/${seq}/info`),
  messageReactions: (roomId: string, seq: number) =>
    api.get<ChatMessageReactions>(
      `/chat/rooms/${roomId}/messages/${seq}/reactions`,
    ),
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
      muteFor?: "8h" | "1w" | "always" | "off";
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
      attachmentsAllowed?: boolean;
      iconUploadId?: string | null;
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
  /** Clear a chat for you, or (private chats) delete it from your list. */
  /** Forwards messages to up to 5 chats (POST /chat/forward). */
  forward: (input: ChatForwardRequest) =>
    api.post<ChatForwardResponse>("/chat/forward", input),
  clearChat: (roomId: string, deleteChat: boolean) =>
    api.post<{ ok: true }>(`/chat/rooms/${roomId}/clear`, { deleteChat }),
  candidates: (search: string) =>
    api.get<ChatCandidates>("/chat/direct/candidates", {
      params: search ? { search } : {},
    }),
  /** A person's card: your chat with them and the groups you share. */
  personCard: (userId: string) =>
    api.get<ChatPersonCardResponse>(`/chat/people/${userId}`),
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
  /** `storageUploadId`: a file sent in parts, joined first. */
  completeUpload: (uploadId: string, storageUploadId?: string) =>
    api.post<{ attachment: ChatAttachment }>(
      `/chat/uploads/${uploadId}/complete`,
      storageUploadId ? { storageUploadId } : undefined,
    ),
  /**
   * A photo for a group's icon: uploaded like a message's photo (signed,
   * straight to storage), then set by the group's admin.
   */
  setGroupIcon: async (
    roomId: string,
    file: File,
    size: { width?: number; height?: number },
    onProgress: (fraction: number) => void = () => {},
  ) => {
    const start = await chatService.startUpload(roomId, {
      kind: "image",
      name: file.name,
      mimeType: file.type,
      size: file.size,
      ...size,
    });
    await chatService.putFile(start, file, onProgress);
    await chatService.completeUpload(start.uploadId);
    return chatService.updateSettings(roomId, {
      iconUploadId: start.uploadId,
    });
  },
  /** The live stream (one per tab). */
  openStream: () =>
    new EventSource(getApiRequestUrl("/chat/stream"), {
      withCredentials: true,
    }),
  /**
   * A document's text for the preview: the API answers with a short-lived
   * link (object storage), read without cookies; in development the API
   * serves the file itself.
   */
  readFileText: async (
    attachment: Pick<ChatAttachment, "url">,
    signal?: AbortSignal,
  ) => (await readFile(attachment, signal)).text(),
  /** A file's bytes (copying a photo, drawing a PDF's first page). */
  readFileBlob: async (
    attachment: Pick<ChatAttachment, "url">,
    signal?: AbortSignal,
  ) => (await readFile(attachment, signal)).blob(),
  /**
   * An attachment's address: straight from the CDN when the API sent a
   * link (`directUrl`), else through the API with the session cookie.
   * Downloads always go through the API (it names the file).
   */
  fileUrl: (
    attachment: { url: string; directUrl?: string },
    download = false,
  ) => {
    // A file still on its way is shown from this browser's copy.
    if (attachment.url.startsWith("blob:")) return attachment.url;
    if (!download) {
      const link = directLink(attachment.url, attachment.directUrl);
      if (link) {
        apiPaths.set(link, attachment.url);
        return link;
      }
    }
    return apiFileUrl(attachment.url, download);
  },
  /**
   * What to show instead when a CDN link fails to load: the file through
   * the API (which checks access and answers a fresh link). Null when `src`
   * is not a CDN link from here.
   */
  fileFallbackUrl: (src: string): string | null => {
    const apiPath = apiPaths.get(src);
    if (!apiPath) return null;
    failedLinks.add(src);
    return apiFileUrl(apiPath);
  },
  /**
   * PUTs a file with progress: to object storage (presigned; a large file
   * in parts), or to the API in development (`viaApi`, which needs the
   * session cookie).
   */
  putFile: (
    start: ChatUploadStart,
    file: Blob,
    onProgress: (fraction: number) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    if (start.multipart) {
      return putParts(start.multipart, file, onProgress, signal);
    }
    return putBlob(
      start.viaApi
        ? getApiRequestUrl(start.uploadUrl.replace(/^\/v1/, ""))
        : start.uploadUrl,
      file,
      {
        headers: start.headers,
        withCredentials: start.viaApi,
        onProgress: (loaded) => onProgress(loaded / Math.max(1, file.size)),
        ...(signal ? { signal } : {}),
      },
    );
  },
};
