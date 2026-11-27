import { useMutation, useQueryClient } from "@tanstack/react-query";

import { chatKeys } from "../chat/chat.keys";
import { assistantKeys } from "./assistant.keys";
import { assistantService } from "./assistant.service";

/** Opens (or finds) your private chat with the assistant. */
export function useOpenAssistant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => assistantService.openConversation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assistantKeys.info() }),
        queryClient.invalidateQueries({ queryKey: chatKeys.rooms() }),
      ]);
    },
  });
}

/** Asks the assistant to stop a running request. */
export function useStopAssistantCard(roomId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => assistantService.stopCard(cardId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: assistantKeys.cards(roomId) }),
  });
}
