import type { ChatProfile, UpdateChatProfileRequest } from "@veolms/contracts";

import type { ChatRuntime } from "../shared/chat.runtime.ts";

const DEFAULTS: ChatProfile = {
  showPresence: true,
  readReceipts: true,
  enterToSend: true,
};

/** Your chat privacy and preferences (WhatsApp Settings › Privacy, Chats). */
export function createProfileService({
  database,
  repository,
  access,
}: ChatRuntime) {
  /** Read receipts can be turned off by chat staff only. */
  function present(
    row: {
      show_presence: boolean;
      read_receipts: boolean;
      enter_to_send: boolean;
    },
    staff: boolean,
  ): ChatProfile {
    return {
      showPresence: row.show_presence,
      readReceipts: staff ? row.read_receipts : true,
      enterToSend: row.enter_to_send,
      readReceiptsChoice: staff,
    };
  }

  return {
    async get(userId: string): Promise<ChatProfile> {
      const [row, staff] = await Promise.all([
        repository.getProfiles(database, [userId]).then((rows) => rows[0]),
        access.isChatStaff(database, userId),
      ]);
      return row
        ? present(row, staff)
        : { ...DEFAULTS, readReceiptsChoice: staff };
    },

    async update(
      userId: string,
      input: UpdateChatProfileRequest,
    ): Promise<ChatProfile> {
      const staff = await access.isChatStaff(database, userId);
      if (!staff) {
        input = { ...input };
        delete input.readReceipts;
      }
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
      return present(row, staff);
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
