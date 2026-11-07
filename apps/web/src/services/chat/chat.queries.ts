import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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
import { chatService } from "./chat.service";

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

export function useChatRoom(roomId: string | null) {
  return useQuery({
    queryKey: chatKeys.room(roomId ?? ""),
    queryFn: async () => (await chatService.getRoom(roomId!)).room,
    enabled: Boolean(roomId),
    staleTime: 30_000,
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

  const loadOlder = useCallback(async () => {
    if (!roomId) return;
    const thread = client.getQueryData<ChatThread>(chatKeys.messages(roomId));
    const oldest = thread?.messages[0]?.seq;
    if (!thread || !thread.hasMoreBefore || oldest === undefined) return;
    setLoadingOlder(true);
    try {
      const page = await chatService.listMessages(roomId, {
        before: oldest,
        limit: 50,
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
