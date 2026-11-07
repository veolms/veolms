import type { ChatProfile, UpdateChatProfileRequest } from "@veolms/contracts";

import type { ChatRuntime } from "../shared/chat.runtime.ts";

const DEFAULTS: ChatProfile = {
  showPresence: true,
  readReceipts: true,
  enterToSend: true,
};

/** Your chat privacy and preferences (WhatsApp Settings › Privacy, Chats). */
export function createProfileService({ database, repository }: ChatRuntime) {
  function present(row: {
    show_presence: boolean;
    read_receipts: boolean;
    enter_to_send: boolean;
  }): ChatProfile {
    return {
      showPresence: row.show_presence,
      readReceipts: row.read_receipts,
      enterToSend: row.enter_to_send,
    };
  }

  return {
    async get(userId: string): Promise<ChatProfile> {
      const [row] = await repository.getProfiles(database, [userId]);
      return row ? present(row) : DEFAULTS;
    },

    async update(
      userId: string,
      input: UpdateChatProfileRequest,
    ): Promise<ChatProfile> {
      const row = await repository.saveProfile(database, userId, {
        ...(input.showPresence !== undefined
          ? { show_presence: input.showPresence }
          : {}),
        ...(input.readReceipts !== undefined
          ? { read_receipts: input.readReceipts }
          : {}),
        ...(input.enterToSend !== undefined
          ? { enter_to_send: input.enterToSend }
          : {}),
      });
      return present(row);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
