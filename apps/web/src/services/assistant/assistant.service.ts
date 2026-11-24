import type {
  AssistantCardListResponse,
  AssistantCardResponse,
  AssistantConversationResponse,
  AssistantInfoResponse,
} from "@veolms/contracts";

import api from "../../lib/api-client";

/** The chat assistant ("Claude") for admins and instructors. */
export const assistantService = {
  getInfo: () => api.get<AssistantInfoResponse>("/assistant"),

  openConversation: () =>
    api.post<AssistantConversationResponse>("/assistant/conversation", {}),

  listCards: (roomId: string) =>
    api.get<AssistantCardListResponse>(
      `/assistant/cards?roomId=${encodeURIComponent(roomId)}`,
    ),

  stopCard: (cardId: string) =>
    api.post<AssistantCardResponse>(`/assistant/cards/${cardId}/stop`, {}),
};
