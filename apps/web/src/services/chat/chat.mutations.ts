import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type {
  ChatMessage,
  ChatProfile,
  ChatReason,
  ChatRestrictionType,
  ChatRoomDetail,
  ChatRoomSummary,
} from "@veolms/contracts";

import { applyMessages, type ChatThread } from "./chat.cache";
import { chatKeys } from "./chat.keys";
import { chatService, type ChatRoomList } from "./chat.service";

/** Writes a changed message into its chat. */
function useMessageResult() {
  const client = useQueryClient();
  return (message: ChatMessage) =>
    applyMessages(client, message.roomId, [message]);
}

export function useEditMessage() {
  const apply = useMessageResult();
  return useMutation({
    mutationFn: (v: { roomId: string; seq: number; body: string }) =>
      chatService.edit(v.roomId, v.seq, v.body),
    onSuccess: ({ message }) => apply(message),
  });
}

export function useDeleteMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      roomId: string;
      seq: number;
      scope: "everyone" | "me";
    }) => chatService.remove(v.roomId, v.seq, v.scope),
    onMutate: (v) => {
      // "Delete for me" disappears at once; "for everyone" waits for the event.
      if (v.scope !== "me") return;
      client.setQueryData<ChatThread>(chatKeys.messages(v.roomId), (thread) =>
        thread
          ? {
              ...thread,
              messages: thread.messages.filter((m) => m.seq !== v.seq),
            }
          : thread,
      );
    },
    onSuccess: (_data, v) => {
      if (v.scope === "everyone") {
        void client.invalidateQueries({ queryKey: chatKeys.room(v.roomId) });
      }
    },
  });
}

export function useRestoreMessage() {
  const apply = useMessageResult();
  return useMutation({
    mutationFn: (v: { roomId: string; seq: number }) =>
      chatService.restore(v.roomId, v.seq),
    onSuccess: ({ message }) => apply(message),
  });
}

export function usePinMessage() {
  const apply = useMessageResult();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { roomId: string; seq: number; pinned: boolean }) =>
      chatService.pin(v.roomId, v.seq, v.pinned),
    onSuccess: ({ message }) => {
      apply(message);
      void client.invalidateQueries({
        queryKey: chatKeys.room(message.roomId),
      });
    },
  });
}

export function useReactToMessage() {
  const client = useQueryClient();
  const apply = useMessageResult();
  return useMutation({
    mutationFn: (v: {
      roomId: string;
      seq: number;
      emoji: string | null;
      previous: string | null;
    }) => chatService.react(v.roomId, v.seq, v.emoji),
    // Shows at once, like WhatsApp; the answer (and the event) correct it.
    onMutate: (v) => {
      client.setQueryData<ChatThread>(chatKeys.messages(v.roomId), (thread) => {
        if (!thread) return thread;
        return {
          ...thread,
          messages: thread.messages.map((m) => {
            if (m.seq !== v.seq) return m;
            const reactions = { ...m.reactions };
            if (v.previous) {
              reactions[v.previous] = (reactions[v.previous] ?? 1) - 1;
              if (reactions[v.previous]! <= 0) delete reactions[v.previous];
            }
            if (v.emoji) reactions[v.emoji] = (reactions[v.emoji] ?? 0) + 1;
            return { ...m, reactions };
          }),
        };
      });
    },
    onSuccess: ({ message }) => apply(message),
  });
}

export function useStarMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { roomId: string; seq: number; starred: boolean }) =>
      chatService.star(v.roomId, v.seq, v.starred),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: chatKeys.stars() }),
  });
}

/**
 * Puts a chat's new header (a settings answer) in the cache at once, in its
 * page and its row in the list, then checks with the server in the
 * background: the change shows without waiting for a second request.
 */
export function storeRoomDetail(client: QueryClient, room: ChatRoomDetail) {
  client.setQueryData(chatKeys.room(room.id), room);
  client.setQueryData<ChatRoomList>(chatKeys.rooms(), (old) =>
    old
      ? {
          ...old,
          rooms: old.rooms.map((r) =>
            r.id === room.id
              ? (Object.fromEntries(
                  Object.keys(r).map((key) => [
                    key,
                    key in room
                      ? room[key as keyof ChatRoomDetail]
                      : r[key as keyof ChatRoomSummary],
                  ]),
                ) as unknown as ChatRoomSummary)
              : r,
          ),
        }
      : old,
  );
  void client.invalidateQueries({ queryKey: chatKeys.rooms() });
}

function useRoomResult() {
  const client = useQueryClient();
  return (roomId: string) => {
    void client.invalidateQueries({ queryKey: chatKeys.room(roomId) });
    void client.invalidateQueries({ queryKey: chatKeys.rooms() });
  };
}

export function useUpdateMyChatState() {
  const refresh = useRoomResult();
  return useMutation({
    mutationFn: (v: {
      roomId: string;
      patch: {
        notifyLevel?: "all" | "mentions" | "none";
        muteFor?: "8h" | "1w" | "always" | "off";
        archived?: boolean;
        pinned?: boolean;
      };
    }) => chatService.updateMyState(v.roomId, v.patch),
    onSuccess: (_d, v) => refresh(v.roomId),
  });
}

export function useUpdateRoomSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: {
      roomId: string;
      patch: Parameters<typeof chatService.updateSettings>[1];
    }) => chatService.updateSettings(v.roomId, v.patch),
    onSuccess: (data) => storeRoomDetail(client, data.room),
  });
}

export function useSetHelper() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { roomId: string; userId: string; helper: boolean }) =>
      chatService.setHelper(v.roomId, v.userId, v.helper),
    onSuccess: (_d, v) =>
      void client.invalidateQueries({
        queryKey: [...chatKeys.all, "members", v.roomId],
      }),
  });
}

export function useLeaveChat() {
  const refresh = useRoomResult();
  return useMutation({
    mutationFn: (roomId: string) => chatService.leave(roomId),
    onSuccess: (_d, roomId) => refresh(roomId),
  });
}

/**
 * "Clear chat" empties your copy at once; "Delete chat" also takes it out
 * of your list. The server is told in the background, then checked.
 */
export function useClearChat() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { roomId: string; deleteChat: boolean }) =>
      chatService.clearChat(v.roomId, v.deleteChat),
    onMutate: async ({ roomId, deleteChat }) => {
      await client.cancelQueries({ queryKey: chatKeys.rooms() });
      client.setQueryData<ChatRoomList>(chatKeys.rooms(), (old) =>
        old
          ? {
              ...old,
              rooms: deleteChat
                ? old.rooms.filter((r) => r.id !== roomId)
                : old.rooms.map((r) =>
                    r.id === roomId
                      ? { ...r, lastMessage: null, unreadCount: 0 }
                      : r,
                  ),
            }
          : old,
      );
      client.setQueryData<ChatThread>(chatKeys.messages(roomId), (old) =>
        old
          ? { ...old, messages: [], hasMoreBefore: false, oldestSeq: null }
          : old,
      );
    },
    onSettled: (_d, _e, { roomId }) => {
      void client.invalidateQueries({ queryKey: chatKeys.rooms() });
      void client.invalidateQueries({ queryKey: chatKeys.messages(roomId) });
    },
  });
}

export function useStartDirect() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => chatService.startDirect(userId),
    onSuccess: ({ room }) => {
      client.setQueryData(chatKeys.room(room.id), room);
      void client.invalidateQueries({ queryKey: chatKeys.rooms() });
    },
  });
}

export function useAnswerRequest() {
  const refresh = useRoomResult();
  return useMutation({
    mutationFn: async (v: {
      roomId: string;
      accept: boolean;
    }): Promise<void> => {
      if (v.accept) await chatService.acceptDirect(v.roomId);
      else await chatService.declineDirect(v.roomId);
    },
    onSuccess: (_d, v) => refresh(v.roomId),
  });
}

export function useBlockUser() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { userId: string; blocked: boolean }) =>
      v.blocked ? chatService.block(v.userId) : chatService.unblock(v.userId),
    onSuccess: () => void client.invalidateQueries({ queryKey: chatKeys.all }),
  });
}

export function useRestrictMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      userId: string;
      roomId: string | null;
      type: ChatRestrictionType;
      durationMinutes: number | null;
      reason: ChatReason;
    }) => chatService.restrict(input),
    onSuccess: (_d, v) => {
      if (v.roomId)
        void client.invalidateQueries({ queryKey: chatKeys.room(v.roomId) });
    },
  });
}

export function useReportMessage() {
  return useMutation({
    mutationFn: (v: {
      roomId: string;
      seq: number;
      reason: ChatReason;
      details?: string;
      block?: boolean;
    }) =>
      chatService.report(v.roomId, v.seq, {
        reason: v.reason,
        ...(v.details ? { details: v.details } : {}),
        ...(v.block ? { block: true } : {}),
      }),
  });
}

export function useUpdateChatProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<ChatProfile>) =>
      chatService.updateProfile(patch),
    onMutate: (patch) => {
      const before = client.getQueryData<ChatProfile>(chatKeys.profile());
      if (before) {
        client.setQueryData<ChatProfile>(chatKeys.profile(), {
          ...before,
          ...patch,
        });
      }
      return { before };
    },
    onError: (_error, _patch, context) => {
      if (context?.before) {
        client.setQueryData(chatKeys.profile(), context.before);
      }
    },
    onSuccess: (profile) => {
      client.setQueryData(chatKeys.profile(), profile);
      // Ticks and "last seen" depend on it.
      void client.invalidateQueries({ queryKey: chatKeys.rooms() });
      void client.invalidateQueries({
        queryKey: [...chatKeys.all, "room"],
      });
    },
  });
}

export function useHandleReport() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; status: "actioned" | "dismissed" }) =>
      chatService.handleReport(v.id, v.status),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: [...chatKeys.all, "reports"],
      }),
  });
}

export function useLiftRestriction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => chatService.liftRestriction(id),
    onSuccess: () =>
      void client.invalidateQueries({
        queryKey: [...chatKeys.all, "restrictions"],
      }),
  });
}
