import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { ChatRoomDetail, ChatRoomSummary } from "@veolms/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { upsertMessages, type ChatThread } from "./chat.cache";
import { chatKeys } from "./chat.keys";
import { getOutboxSnapshot, subscribeOutbox } from "./chat.outbox";
import {
  getTypingSnapshot,
  isChatStreamLive,
  startChatStream,
  subscribeChatStreamLive,
  subscribeTyping,
} from "./chat.realtime";
import { chatService, type ChatRoomList } from "./chat.service";

export function useChatRooms(enabled = true) {
  const live = useSyncExternalStore(
    subscribeChatStreamLive,
    isChatStreamLive,
    () => false,
  );
  return useQuery({
    queryKey: chatKeys.rooms(),
    queryFn: () => chatService.listRooms(),
    enabled,
    staleTime: 30_000,
    // The stream keeps it current; without it, ask again now and then.
    refetchInterval: live ? false : 60_000,
    refetchOnWindowFocus: true,
  });
}

/**
 * A chat's header and settings. Until it arrives, the chat list's entry
 * stands in for it, so an open chat draws at once (name, picture, ticks)
 * instead of a skeleton.
 */
export function useChatRoom(roomId: string | null) {
  const client = useQueryClient();
  return useQuery({
    queryKey: chatKeys.room(roomId ?? ""),
    queryFn: async () => (await chatService.getRoom(roomId!)).room,
    enabled: Boolean(roomId),
    staleTime: 30_000,
    placeholderData: () => {
      const summary = client
        .getQueryData<ChatRoomList>(chatKeys.rooms())
        ?.rooms.find((room) => room.id === roomId);
      return summary ? detailFromSummary(summary) : undefined;
    },
  });
}

/** A chat list entry dressed as a chat's details (for the first frame). */
function detailFromSummary(summary: ChatRoomSummary): ChatRoomDetail {
  return {
    ...summary,
    description: null,
    directMessagesAllowed: false,
    attachmentsAllowed: true,
    memberCount: null,
    pinnedMessages: [],
    memberNames: [],
    peerPresence: null,
  };
}

const PREFETCH_STALE_MS = 30_000;

/**
 * Starts loading a chat before it is opened (the pointer reaches its row,
 * a finger touches it, or the list just loaded and it is near the top), so
 * opening it is instant. Does nothing for a chat already in the cache.
 */
export function prefetchChat(client: QueryClient, roomId: string) {
  if (!client.getQueryData(chatKeys.messages(roomId))) {
    void client.prefetchQuery({
      queryKey: chatKeys.messages(roomId),
      queryFn: () => chatService.listMessages(roomId, { limit: 50 }),
      staleTime: Number.POSITIVE_INFINITY,
    });
  }
  void client.prefetchQuery({
    queryKey: chatKeys.room(roomId),
    queryFn: async () => (await chatService.getRoom(roomId)).room,
    staleTime: PREFETCH_STALE_MS,
  });
}

/** A chat's messages (newest page first), and a way to load older ones. */
export function useChatThread(roomId: string | null) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: chatKeys.messages(roomId ?? ""),
    queryFn: async (): Promise<ChatThread> =>
      chatService.listMessages(roomId!, { limit: 50 }),
    enabled: Boolean(roomId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 10 * 60_000,
  });
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Scroll events come faster than renders: one older page at a time.
  const inFlight = useRef(false);

  const loadOlder = useCallback(async () => {
    if (!roomId || inFlight.current) return;
    const thread = client.getQueryData<ChatThread>(chatKeys.messages(roomId));
    const oldest = thread?.messages[0]?.seq;
    if (!thread || !thread.hasMoreBefore || oldest === undefined) return;
    inFlight.current = true;
    setLoadingOlder(true);
    try {
      // Bigger pages further back: scrolling up a long group asks rarely.
      const page = await chatService.listMessages(roomId, {
        before: oldest,
        limit: 100,
      });
      client.setQueryData<ChatThread>(chatKeys.messages(roomId), (current) =>
        current
          ? {
              ...upsertMessages(current, page.messages),
              hasMoreBefore: page.hasMoreBefore,
            }
          : current,
      );
    } finally {
      inFlight.current = false;
      setLoadingOlder(false);
    }
  }, [client, roomId]);

  return { ...query, loadOlder, loadingOlder };
}

/** Keeps the tab's chat stream open while mounted. */
export function useChatStream(viewerId: string | null, enabled = true) {
  const client = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    return startChatStream(client, viewerId);
  }, [client, viewerId, enabled]);
}

export function useTypingNames(roomId: string | null): string[] {
  const snapshot = useSyncExternalStore(
    subscribeTyping,
    getTypingSnapshot,
    getTypingSnapshot,
  );
  return roomId ? (snapshot.get(roomId) ?? []) : [];
}

export function useOutgoingMessages(roomId: string | null) {
  const snapshot = useSyncExternalStore(
    subscribeOutbox,
    getOutboxSnapshot,
    getOutboxSnapshot,
  );
  return roomId ? (snapshot.get(roomId) ?? []) : [];
}

export function useChatMembers(roomId: string | null, search: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.members(roomId ?? "", search),
    queryFn: ({ pageParam }) =>
      chatService.listMembers(roomId!, {
        ...(search ? { search } : {}),
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(roomId),
    staleTime: 60_000,
  });
}

export function useChatCandidates(search: string, enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.candidates(search),
    queryFn: () => chatService.candidates(search),
    enabled,
    staleTime: 60_000,
  });
}

export function useStarredMessages(enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.stars(),
    queryFn: () => chatService.listStars(),
    enabled,
  });
}

/** Your chat privacy and preferences (defaults until it loads). */
export function useChatProfile(enabled = true) {
  return useQuery({
    queryKey: chatKeys.profile(),
    queryFn: () => chatService.getProfile(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Message info: who read and who received your message. */
export function useMessageInfo(roomId: string, seq: number | null) {
  return useQuery({
    queryKey: chatKeys.messageInfo(roomId, seq ?? 0),
    queryFn: () => chatService.messageInfo(roomId, seq!),
    enabled: seq !== null && seq > 0,
    // Receipts are written every few seconds: look again while it is open.
    refetchInterval: 5_000,
  });
}

/** "Search in this chat": newest matches first, more on demand. */
export function useMessageSearch(roomId: string, q: string) {
  return useInfiniteQuery({
    queryKey: chatKeys.search(roomId, q),
    queryFn: ({ pageParam }) =>
      chatService.searchMessages(roomId, q, pageParam ?? undefined),
    initialPageParam: null as number | null,
    getNextPageParam: (last) =>
      last.hasMore ? (last.messages.at(-1)?.seq ?? null) : null,
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}

/** Staff: reports about this chat's messages, and who is muted or removed. */
export function useChatReports(roomId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.reports(roomId),
    queryFn: () =>
      chatService.listReports({
        status: "open",
        ...(roomId ? { roomId } : {}),
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useChatRestrictions(roomId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: chatKeys.restrictions(roomId),
    queryFn: () =>
      chatService.listRestrictions({
        active: true,
        ...(roomId ? { roomId } : {}),
      }),
    enabled,
    staleTime: 30_000,
  });
}
