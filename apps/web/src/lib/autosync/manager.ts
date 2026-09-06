import { onlineManager } from "@tanstack/react-query";
import { queryClient } from "../query-client";
import { getAutosyncKey } from "./keys";
import { getDirtyAutosyncDrafts } from "./registry";
import { AutosyncSyncError } from "./types";
import type { AutosyncKey, AutosyncRegistration } from "./types";

const getOnlineState = () => {
  if (typeof navigator === "undefined") return true;
  const online = navigator.onLine;
  onlineManager.setOnline(online);
  return online;
};

const awaitFlushUntilSettledOrOffline = async (
  flush: () => Promise<void>,
): Promise<void> => {
  if (!getOnlineState()) return;

  await new Promise<void>((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      unsubscribe();
      resolve();
    };
    const unsubscribe = onlineManager.subscribe((online) => {
      if (!online) finish();
    });
    void flush().then(finish, finish);
  });
};

class AutosyncManager {
  private readonly registrations = new Map<string, AutosyncRegistration>();

  register(registration: AutosyncRegistration): () => void {
    const keyString = getAutosyncKey(registration.key);
    this.registrations.set(keyString, registration);
    return () => {
      if (this.registrations.get(keyString) === registration) {
        this.registrations.delete(keyString);
      }
    };
  }

  async recover(): Promise<ReturnType<typeof getDirtyAutosyncDrafts>> {
    return getDirtyAutosyncDrafts();
  }

  async flushAll(): Promise<void> {
    const registrations = [...this.registrations.values()];
    await Promise.all(
      registrations.map((registration) =>
        awaitFlushUntilSettledOrOffline(registration.flush),
      ),
    );

    if (getOnlineState()) {
      await queryClient.resumePausedMutations().catch(() => undefined);
    }
  }

  async requireSynced(
    keys?: AutosyncKey | readonly AutosyncKey[],
  ): Promise<void> {
    const requestedKeys = keys
      ? Array.isArray(keys)
        ? keys
        : [keys]
      : undefined;
    const registrations = [...this.registrations.values()].filter((entry) =>
      requestedKeys
        ? requestedKeys.some(
            (key) => getAutosyncKey(key) === getAutosyncKey(entry.key),
          )
        : true,
    );

    if (!getOnlineState()) {
      throw new AutosyncSyncError(
        requestedKeys?.[0] ??
          registrations[0]?.key ?? {
            entity: "all",
            entityId: "all",
            scope: "all",
        },
        "offline",
        "Please reconnect and try again.",
      );
    }

    await Promise.all(
      registrations.map((registration) => registration.flush()),
    );
    await queryClient.resumePausedMutations();

    const unsynced = registrations.find(
      (registration) =>
        registration.isDirty() ||
        !["idle", "saved"].includes(registration.getStatus()),
    );
    if (unsynced) {
      throw new AutosyncSyncError(
        unsynced.key,
        unsynced.getStatus(),
        "Some changes have not been confirmed by the server yet.",
      );
    }

    if (requestedKeys) {
      const registeredKeys = new Set(
        registrations.map((registration) => getAutosyncKey(registration.key)),
      );
      const dirtyKeys = getDirtyAutosyncDrafts().map(({ key }) =>
        getAutosyncKey(key),
      );
      const missingDirtyKey = requestedKeys.find((key) => {
        const keyString = getAutosyncKey(key);
        return !registeredKeys.has(keyString) && dirtyKeys.includes(keyString);
      });
      if (missingDirtyKey) {
        throw new AutosyncSyncError(
          missingDirtyKey,
          "pending",
          "Please return to the editor and try again.",
        );
      }
    } else {
      const registeredKeys = new Set(
        registrations.map((registration) => getAutosyncKey(registration.key)),
      );
      const missingDirtyDraft = getDirtyAutosyncDrafts().find(
        ({ key }) => !registeredKeys.has(getAutosyncKey(key)),
      );
      if (missingDirtyDraft) {
        throw new AutosyncSyncError(
          missingDirtyDraft.key,
          "pending",
          "Please return to the editor and try again.",
        );
      }
    }
  }
}

export const autosyncManager = new AutosyncManager();

export const getAutosyncOnlineState = getOnlineState;
