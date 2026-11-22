import { useQuery } from "@tanstack/react-query";
import type { AssistantCard } from "@veolms/contracts";
import { useMemo } from "react";

import { getApiError } from "../../lib/api-error";
import { assistantKeys } from "./assistant.keys";
import { assistantService } from "./assistant.service";

/**
 * Whether you may use the assistant, your chat with it, and whether its
 * agent is online. Turned off (404) or signed out, it is simply unavailable.
 */
export function useAssistantInfo(enabled = true) {
  return useQuery({
    queryKey: assistantKeys.info(),
    queryFn: async () => {
      try {
        return await assistantService.getInfo();
      } catch (error) {
        if (getApiError(error).status === 404) return null;
        throw error;
      }
    },
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
}

/** Your assistant chat's id, or null (not available or not opened yet). */
export function useAssistantRoomId(): string | null {
  const info = useAssistantInfo();
  return info.data?.available ? info.data.roomId : null;
}

/** The status cards of an assistant chat, by the number of their message. */
export function useAssistantCards(roomId: string | null) {
  const query = useQuery({
    queryKey: assistantKeys.cards(roomId ?? "none"),
    queryFn: () => assistantService.listCards(roomId!),
    enabled: Boolean(roomId),
    staleTime: 10_000,
  });
  const bySeq = useMemo(() => {
    const map = new Map<number, AssistantCard>();
    for (const card of query.data?.cards ?? []) {
      if (card.messageSeq !== null) map.set(card.messageSeq, card);
    }
    return map;
  }, [query.data]);
  return { ...query, bySeq };
}
